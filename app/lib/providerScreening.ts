import "server-only";
import { createClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
export function screeningDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}
export const screeningColumns = "id,provider_id,amount,currency,package_slug,payment_status,stripe_session_id,stripe_payment_intent_id,payment_started_at,paid_at,candidate_key,invitation_key,checkr_started_at,checkr_candidate_id,checkr_invitation_id,checkr_report_id,invitation_status,background_status,identity_status,decision_state,updated_at";
export async function screeningApprovalReady(providerId: string) {
  if (process.env.PROVIDER_SCREENING_ENABLED !== "true") return true;
  const { data, error } = await screeningDb().from("provider_screenings").select("payment_status,background_status,identity_status,decision_state").eq("provider_id", providerId).maybeSingle();
  return !error && data?.payment_status === "paid" && data.background_status === "clear" && data.identity_status === "verified" && data.decision_state === "eligible";
}
export async function confirmScreeningPayment(stripe: Stripe, sessionId: string) {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const db = screeningDb();
  const { data: row, error } = await db.from("provider_screenings").select(screeningColumns).eq("id", session.metadata?.screening_id || "").single();
  if (error || !row || session.metadata?.payment_type !== "provider_verification" || session.metadata.provider_id !== row.provider_id || row.stripe_session_id !== session.id || session.client_reference_id !== row.provider_id || session.amount_total !== row.amount || session.currency !== row.currency) throw new Error("Screening payment mismatch");
  if (session.payment_status !== "paid") return;
  const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!intentId) throw new Error("Missing intent");
  const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ["latest_charge"] });
  if (intent.status !== "succeeded" || intent.amount_received !== row.amount || intent.currency !== row.currency || intent.metadata.payment_type !== "provider_verification" || intent.metadata.screening_id !== row.id || intent.metadata.provider_id !== row.provider_id) throw new Error("Screening intent mismatch");
  const invalid = invalidScreeningCharge(intent.latest_charge);
  if (invalid) { await persistInvalidPayment(row.id, intent.id, invalid); return; }
  const result = await db.from("provider_screenings").update({ payment_status: "paid", stripe_payment_intent_id: intent.id, paid_at: row.paid_at || new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", row.id).eq("payment_status", "unpaid");
  if (result.error) throw new Error("Payment persistence failed");
}


// Any partial refund invalidates the fee; disputes require manual reconciliation.
export function invalidScreeningCharge(charge: Stripe.PaymentIntent["latest_charge"]): "refunded" | "disputed" | null {
  if (!charge || typeof charge === "string") throw new Error("Expanded charge required");
  if (charge.disputed) return "disputed";
  if (charge.refunded || charge.amount_refunded > 0) return "refunded";
  if (!charge.paid || charge.status !== "succeeded") throw new Error("Successful charge required");
  return null;
}
async function persistInvalidPayment(id: string, intentId: string, status: "refunded" | "disputed") {
  const result = await screeningDb().from("provider_screenings").update({ payment_status: status, stripe_payment_intent_id: intentId, decision_state: "blocked", updated_at: new Date().toISOString() }).eq("id", id);
  if (result.error) throw new Error("Invalid payment persistence failed");
}
export async function revalidateScreeningPayment(stripe: Stripe, row: {
  id: string; provider_id: string; payment_status: string; stripe_payment_intent_id: string | null; amount: number; currency: string;
}) {
  if (row.payment_status !== "paid" || !row.stripe_payment_intent_id) return false;
  const intent = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id, { expand: ["latest_charge"] });
  const invalid = invalidScreeningCharge(intent.latest_charge);
  if (invalid) { await persistInvalidPayment(row.id, intent.id, invalid); return false; }
  if (intent.status !== "succeeded" || intent.amount_received !== row.amount || intent.currency !== row.currency || intent.metadata.payment_type !== "provider_verification" || intent.metadata.screening_id !== row.id || intent.metadata.provider_id !== row.provider_id) return false;
  const current = await screeningDb().from("provider_screenings").select("payment_status").eq("id", row.id).single();
  if (current.error) throw new Error("Payment lookup failed");
  return current.data?.payment_status === "paid";
}
export async function invalidateScreeningPayment(stripe: Stripe, chargeId: string, status: "refunded" | "disputed") {
  const charge = await stripe.charges.retrieve(chargeId);
  const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!intentId) return;
  const intent = await stripe.paymentIntents.retrieve(intentId);
  if (intent.metadata.payment_type !== "provider_verification") return;
  const lookup = await screeningDb().from("provider_screenings").select("id,provider_id,stripe_payment_intent_id").eq("id", intent.metadata.screening_id || "").single();
  if (lookup.error || !lookup.data || lookup.data.provider_id !== intent.metadata.provider_id || (lookup.data.stripe_payment_intent_id && lookup.data.stripe_payment_intent_id !== intentId)) throw new Error("Payment lookup mismatch");
  // Covers refunds delivered before checkout success, using signed intent metadata.
  await persistInvalidPayment(lookup.data.id, intentId, status);
}
