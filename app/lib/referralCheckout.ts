import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ReferralCheckout = {
  id: string; customer_id: string; request_id: string; offer_id: string;
  snapshot: Record<string, string>; amount_cents: number; charge_cents: number;
  state: "reserved" | "consumed" | "released";
  stripe_session_id: string | null; stripe_payment_intent_id: string | null;
  created_at: string;
};

export async function reserveReferralCheckout(db: SupabaseClient, metadata: Record<string, string>, useCredit: boolean) {
  const { data, error } = await db.rpc("reserve_referral_checkout", {
    p_customer_id: metadata.customer_id, p_request_id: metadata.request_id,
    p_offer_id: metadata.offer_id, p_use_credit: useCredit, p_snapshot: metadata,
  });
  if (error || !data) throw new Error(error?.message || "Credit checkout reservation failed");
  return data as ReferralCheckout;
}

export async function attachReferralCheckout(db: SupabaseClient, reservation: ReferralCheckout, sessionId: string | null, intentId: string | null) {
  const { error } = await db.rpc("attach_referral_checkout", { p_id: reservation.id, p_session_id: sessionId, p_intent_id: intentId });
  if (error) throw new Error("Stripe checkout reference requires retry: " + error.message);
}

// Never release solely because a client reports a failure or a reservation is old.
// First expire/cancel its Stripe object, so a late success cannot spend returned credit.
export async function returnReferralCheckout(db: SupabaseClient, stripe: Stripe, reservation: ReferralCheckout, cancel = false) {
  if (reservation.state !== "reserved") return reservation.state === "released";
  if (reservation.stripe_session_id) {
    let session = await stripe.checkout.sessions.retrieve(reservation.stripe_session_id);
    if (cancel && session.status === "open") session = await stripe.checkout.sessions.expire(session.id);
    if (session.status !== "expired") {
      const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      if (!cancel || session.status !== "complete" || session.payment_status === "paid" || !intentId) return false;
      let intent = await stripe.paymentIntents.retrieve(intentId);
      if (["requires_payment_method", "requires_confirmation", "requires_action"].includes(intent.status)) intent = await stripe.paymentIntents.cancel(intent.id);
      if (intent.status !== "canceled") return false;
    }
  } else if (reservation.stripe_payment_intent_id) {
    let intent = await stripe.paymentIntents.retrieve(reservation.stripe_payment_intent_id);
    if (cancel && ["requires_payment_method", "requires_confirmation", "requires_action"].includes(intent.status)) {
      intent = await stripe.paymentIntents.cancel(intent.id);
    }
    if (intent.status !== "canceled") return false;
  } else {
    // A create response may have been lost. Reuse the same creation key to recover it;
    // never assume there is no live Stripe object and give this credit back.
    return false;
  }
  const { error } = await db.rpc("return_referral_checkout", { p_id: reservation.id });
  if (error) throw new Error(error.message);
  return true;
}

export async function reconcileReferralCheckouts(db: SupabaseClient, stripe: Stripe, customerId: string,
  choice?: { requestId: string; offerId: string; useCredit: boolean; paymentFlow: string }) {
  const { data, error } = await db.from("referral_credit_checkouts").select("*").eq("customer_id", customerId).eq("state", "reserved");
  if (error) throw new Error(error.message);
  for (const reservation of (data || []) as ReferralCheckout[]) {
    const changedChoice = choice && reservation.request_id === choice.requestId &&
      (reservation.offer_id !== choice.offerId || reservation.snapshot.use_referral_credit !== String(choice.useCredit) ||
       reservation.snapshot.payment_flow !== choice.paymentFlow);
    const returned = await returnReferralCheckout(db, stripe, reservation, !!changedChoice);
    if (changedChoice && !returned) throw new Error("El pago anterior sigue pendiente; verifica o cancela ese pago antes de cambiar la opción de crédito. / Previous payment is pending; verify or cancel it before changing credit.");
  }
}

/** Release only a definitive Stripe validation failure, never network/timeout/idempotency uncertainty. */
export async function createReferralStripeObject<T>(db: SupabaseClient, reservation: ReferralCheckout | null, create: () => Promise<T>): Promise<T> {
  try { return await create(); } catch (error) {
    const failure = error as { type?: string; code?: string };
    if (reservation && failure.type === "StripeInvalidRequestError" && failure.code !== "idempotency_key_in_use") {
      const result = await db.rpc("return_referral_checkout", { p_id: reservation.id });
      if (result.error) throw new Error("Failed Stripe creation; credit return requires retry");
    }
    throw error;
  }
}
