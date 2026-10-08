import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readJobResolution, FinancialGuardError } from "./jobFinancialGuard";

type Redemption = { id: string; request_id: string; destination: string; amount_cents: number;
  currency: string; created_at: string; receipt: Stripe.Transfer | null };
async function rpc(db: SupabaseClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args);
  if (error || !data) throw new FinancialGuardError("El bono Pro requiere revisión o reintento; el release normal ya está guardado.");
  return data;
}
async function observeRelease(db: SupabaseClient, stripe: Stripe, requestId: string) {
  const resolution = await readJobResolution(db, requestId, "automatic_release");
  if (!resolution) throw new FinancialGuardError("Falta la resolución de la liberación para validar el referido.");
  const evidence = [];
  for (const receipt of resolution.receipts || []) {
    if (receipt.kind !== "transfer" || !receipt.id || !receipt.charge_id) {
      throw new FinancialGuardError("La liberación del referido requiere conciliación.");
    }
    const [charge, refunds, transfer] = await Promise.all([
      stripe.charges.retrieve(receipt.charge_id),
      stripe.refunds.list({ charge: receipt.charge_id, limit: 100 }),
      stripe.transfers.retrieve(receipt.id),
    ]);
    const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    const destination = typeof transfer.destination === "string" ? transfer.destination : transfer.destination?.id;
    // Ineligible is a normal outcome; never fail/repeat a Pro transfer because
    // the promotional reward does not qualify. Observational/network errors retry.
    if (!charge.paid || charge.status !== "succeeded" || charge.disputed || charge.refunded ||
        charge.amount_refunded !== 0 || refunds.has_more || refunds.data.length ||
        transfer.reversed || transfer.amount_reversed !== 0) return null;
    if (charge.id !== receipt.charge_id || paymentIntentId !== receipt.source?.paymentIntentId ||
        transfer.id !== receipt.id || transfer.source_transaction !== charge.id ||
        destination !== receipt.destination || transfer.amount !== receipt.amount ||
        transfer.currency !== receipt.currency || charge.currency !== receipt.currency ||
        charge.livemode !== transfer.livemode) {
      throw new FinancialGuardError("La evidencia del referido no coincide con la liberación.");
    }
    evidence.push({ transfer_id: transfer.id, charge_id: charge.id, payment_intent_id: paymentIntentId,
      destination, amount: transfer.amount, currency: transfer.currency, paid: charge.paid,
      disputed: charge.disputed, refunded: charge.refunded, amount_refunded: charge.amount_refunded,
      has_refunds: false, reversed: transfer.reversed, amount_reversed: transfer.amount_reversed,
      observed_at: new Date().toISOString() });
  }

  return evidence;
}

/** The two credits commit atomically AFTER the ordinary release is durable. */
export async function processProviderReferral(db: SupabaseClient, stripe: Stripe, requestId: string) {
  let award = await rpc(db, "award_provider_referral", { p_request_id: requestId, p_evidence: null });
  if (award.outcome === "needs_evidence") {
    const evidence = await observeRelease(db, stripe, requestId);
    if (!evidence) return { outcome: "ineligible" };
    award = await rpc(db, "award_provider_referral", { p_request_id: requestId, p_evidence: evidence });
  }
  let reservation = await rpc(db, "reserve_provider_referral_bonus", { p_request_id: requestId, p_evidence: null });
  if (reservation.outcome === "needs_evidence") {
    const evidence = await observeRelease(db, stripe, requestId);
    if (!evidence) return { outcome: "ineligible" };
    reservation = await rpc(db, "reserve_provider_referral_bonus", { p_request_id: requestId, p_evidence: evidence });
  }
  if (reservation.outcome !== "reserved") return reservation;
  const d = reservation.redemption as Redemption;
  if (!d?.id || d.amount_cents !== 2500 || d.currency !== "usd" || d.request_id !== requestId) {
    throw new FinancialGuardError("La reserva del bono Pro está incompleta.");
  }
  if (d.receipt) return { outcome: "already_paid", transfer_id: d.receipt.id };
  const group = "relydo_pro_bonus_" + d.id;
  const matches = (t: Stripe.Transfer) => t.id && t.amount === 2500 && t.currency === "usd" &&
    (typeof t.destination === "string" ? t.destination : t.destination?.id) === d.destination &&
    !t.source_transaction && t.transfer_group === group && !t.reversed && t.amount_reversed === 0 &&
    t.metadata?.provider_referral_redemption_id === d.id;
  // Recovery precedes eligibility/age checks: a successful remote transfer with
  // a failed DB save must be recorded, even if the job/account changed later.
  const transfers = await stripe.transfers.list({ transfer_group: group, limit: 100 });
  if (transfers.has_more || transfers.data.length > 1 || transfers.data.some(t => !matches(t))) {
    throw new FinancialGuardError("Hay movimientos del bono Pro sin conciliar. No se repetirá la transferencia.");
  }
  let transfer = transfers.data[0];
  if (!transfer) {
    const age = Date.now() - Date.parse(d.created_at);
    if (!Number.isFinite(age) || age < 0 || age >= 20 * 60 * 60 * 1000) {
      throw new FinancialGuardError("El bono Pro incierto requiere conciliación; no se reutilizará una clave vencida.");
    }
    const evidence = await observeRelease(db, stripe, requestId);
    if (!evidence) return { outcome: "ineligible" };
    const authorized = await rpc(db, "authorize_provider_referral_bonus", { p_redemption_id: d.id, p_evidence: evidence });
    if (!authorized.allowed) return { outcome: "ineligible" };
    // FULL $25 from RELYDO balance. No source_transaction, commission/margin cap,
    // customer credit deduction or partial redemption.
    transfer = await stripe.transfers.create({ amount: 2500, currency: "usd", destination: d.destination,
      transfer_group: group, metadata: { request_id: requestId, provider_referral_redemption_id: d.id,
        payment_type: "provider_referral_bonus" } }, { idempotencyKey: "relydo_pro_bonus_" + d.id });
  }
  if (!matches(transfer)) throw new FinancialGuardError("El comprobante Stripe del bono Pro no coincide con la reserva.");
  const saved = await rpc(db, "record_provider_referral_bonus", { p_redemption_id: d.id, p_receipt: {
    id: transfer.id, amount: transfer.amount, currency: transfer.currency, destination: d.destination,
    source_transaction: null, transfer_group: transfer.transfer_group, reversed: transfer.reversed,
    amount_reversed: transfer.amount_reversed, metadata: { provider_referral_redemption_id: d.id },
  } });
  if (saved.recorded !== true) throw new FinancialGuardError("Falta confirmar el comprobante del bono Pro; requiere reintento.");
  return { outcome: "paid", transfer_id: transfer.id, amount_cents: 2500 };
}

/** Retry the promotional instruction without re-entering ordinary Pro release. */
export async function retryProviderReferrals(db: SupabaseClient, stripe: Stripe) {
  const requests = await rpc(db, "pending_provider_referrals", {});
  for (const requestId of requests) {
    try { await processProviderReferral(db, stripe, requestId); }
    catch (error) { console.error("Bono Pro pendiente", requestId, error); }
  }
}
