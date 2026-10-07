import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readJobResolution, FinancialGuardError } from "./jobFinancialGuard";

/** Observes Stripe only; the RPC writes both promotional awards transactionally. */
export async function awardCustomerReferral(db: SupabaseClient, stripe: Stripe, requestId: string) {
  const preflight = await db.rpc("award_customer_referral", { p_request_id: requestId, p_evidence: null });
  if (preflight.error || !preflight.data) throw new FinancialGuardError("No se pudo validar la acreditación del referido.");
  if (preflight.data.outcome !== "needs_evidence") return preflight.data;
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
        transfer.reversed || transfer.amount_reversed !== 0) return { outcome: "ineligible" };
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
  const { data, error } = await db.rpc("award_customer_referral", { p_request_id: requestId, p_evidence: evidence });
  if (error || !data) throw new FinancialGuardError("No se pudo registrar el crédito del referido; la liberación al Pro ya está guardada.");
  return data;
}

/** Retry only promotional writes, without re-entering the Pro transfer path. */
export async function retryCustomerReferralAwards(db: SupabaseClient, stripe: Stripe) {
  const { data, error } = await db.rpc("pending_customer_referral_awards");
  if (error) throw new FinancialGuardError("No se pudieron consultar los créditos pendientes de referidos.");
  for (const requestId of data || []) {
    try { await awardCustomerReferral(db, stripe, requestId); }
    catch (error) { console.error("Crédito de referido pendiente", requestId, error); }
  }
}
