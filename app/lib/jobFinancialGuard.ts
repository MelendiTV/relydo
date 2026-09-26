import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

export class FinancialGuardError extends Error {
  readonly status = 409;
}

/** No fallback when the migration is missing or the database is unavailable. */
async function rpc(db: SupabaseClient, name: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args);
  if (error || !data) throw new FinancialGuardError("La operación financiera requiere revisión o no pudo reservarse. No repitas movimientos de dinero.");
  return data;
}

export async function reserveJobResolution(db: SupabaseClient, requestId: string, owner: string, decision: Record<string, unknown> = {}, stripe?: Stripe) {
  const reservation = await rpc(db, "reserve_job_financial_resolution", { p_request_id: requestId, p_owner: owner, p_decision: decision });
  // Recover receipts BEFORE legacy route logic lists/skips existing effects.
  // This path only observes Stripe; it never creates a financial movement.
  if (stripe) {
    const executor = financialStripe(stripe, db, owner);
    for (const step of reservation.pending_steps || []) await executor.recover(step.kind, step.params);
  }
  return reservation;
}

export async function assertReassignmentSafe(db: SupabaseClient, requestId: string) {
  if (!requestId) throw new FinancialGuardError("No se pudo identificar el trabajo de la reasignación.");
  return rpc(db, "guard_job_reassignment", { p_request_id: requestId });
}

export function applyFinancialJobUpdate(db: SupabaseClient, requestId: string, owner: string, patch: Record<string, unknown>) {
  // Preserve the existing Supabase {data,error} contract for the route's checks.
  return db.rpc("apply_job_financial_update", { p_request_id: requestId, p_owner: owner, p_patch: patch });
}

/** Amounts/recipients remain those chosen by the existing business rules.
 * Persist a single immutable instruction per charge and direction before Stripe.
 * A second route cannot take ownership, even after a claim has been closed.
 */
export function financialStripe(stripe: Stripe, db: SupabaseClient, owner: string) {
  async function execute(kind: "transfer" | "refund", params: Stripe.TransferCreateParams | Stripe.RefundCreateParams, readOnly = false) {
    const requestId = String((params.metadata && params.metadata.request_id) || "");
    if (!requestId) throw new FinancialGuardError("Falta el trabajo del movimiento financiero.");
    let chargeId: string;
    if (kind === "transfer") {
      chargeId = String((params as Stripe.TransferCreateParams).source_transaction || "");
    } else {
      const refund = params as Stripe.RefundCreateParams;
      if (refund.charge) chargeId = refund.charge;
      else {
        if (!refund.payment_intent) throw new FinancialGuardError("Falta el origen del reembolso.");
        const intent = await stripe.paymentIntents.retrieve(refund.payment_intent);
        chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id || "";
      }
    }
    if (!chargeId || !Number.isSafeInteger(params.amount) || Number(params.amount) <= 0) {
      throw new FinancialGuardError("El movimiento no tiene un cargo e importe explícitos válidos.");
    }
    const step = await rpc(db, "reserve_job_financial_step", {
      p_request_id: requestId, p_owner: owner, p_kind: kind, p_charge_id: chargeId, p_params: params,
    });
    if (step.receipt) {
      if (!step.receipt.id || step.receipt.status !== "succeeded" || step.receipt.amount !== params.amount) {
        throw new FinancialGuardError("El comprobante durable no confirma la instrucción financiera.");
      }
      return step.receipt;
    }
    if (!step.id || !step.params || !step.created_at) throw new FinancialGuardError("La reserva del movimiento está incompleta.");
    // Protect the transition from the OLD idempotency keys: a legacy Stripe
    // success with a missing local save must not become a new transfer/refund.
    const existing = kind === "transfer"
      ? await stripe.transfers.list({ transfer_group: `relydo_request_${requestId}`, limit: 100 })
      : await stripe.refunds.list({ charge: chargeId, limit: 100 });
    if (existing.has_more) throw new FinancialGuardError("Hay más movimientos que revisar antes de continuar.");
    const relevant = existing.data.filter(item => kind === "refund" ||
      (item as Stripe.Transfer).source_transaction === chargeId);
    if (relevant.some(item => item.metadata?.relydo_financial_step_id !== step.id)) {
      throw new FinancialGuardError("Este cargo tiene movimientos anteriores sin conciliar. No se creará otro movimiento.");
    }
    if (relevant.length > 1) throw new FinancialGuardError("Se encontraron movimientos duplicados; requieren conciliación.");
    const recovered = relevant[0];
    if (!recovered && readOnly) return null;
    const age = Date.now() - Date.parse(step.created_at);
    if (!recovered && (!Number.isFinite(age) || age < 0 || age >= 20 * 60 * 60 * 1000)) {
      throw new FinancialGuardError("El movimiento incierto necesita conciliación; su clave no se reutilizará fuera de la ventana segura.");
    }
    const options = { idempotencyKey: `relydo_financial_step_${step.id}` };
    const instruction = { ...step.params, metadata: { ...step.params.metadata, relydo_financial_step_id: step.id } };
    const result = recovered || (kind === "transfer"
      ? await stripe.transfers.create(instruction, options)
      : await stripe.refunds.create(instruction, options));
    if (result.amount !== params.amount || !result.id || (kind === "refund" && (result as Stripe.Refund).status !== "succeeded")) {
      throw new FinancialGuardError("Stripe todavía no confirmó el movimiento. La reserva permanece bloqueada para revisión.");
    }
    if (kind === "transfer") {
      const transfer = result as Stripe.Transfer;
      const destination = typeof transfer.destination === "string" ? transfer.destination : transfer.destination?.id;
      if (transfer.amount_reversed || destination !== (params as Stripe.TransferCreateParams).destination ||
        transfer.currency !== (params as Stripe.TransferCreateParams).currency || transfer.source_transaction !== chargeId) {
        throw new FinancialGuardError("La transferencia observada no coincide con la instrucción o fue revertida.");
      }
    }
    if (kind === "refund") {
      const refund = result as Stripe.Refund;
      const charge = typeof refund.charge === "string" ? refund.charge : refund.charge?.id;
      if (charge !== chargeId || !Object.entries(params.metadata || {}).every(([key, value]) => refund.metadata?.[key] === value)) {
        throw new FinancialGuardError("El reembolso observado no coincide con el cargo y la instrucción reservada.");
      }
    }
    // Minimal durable receipt: no client secrets, customer details or credentials.
    const receipt = { id: result.id, amount: result.amount, currency: result.currency,
      status: kind === "refund" ? (result as Stripe.Refund).status : "succeeded" };
    const saved = await rpc(db, "record_job_financial_step", { p_step_id: step.id, p_owner: owner, p_receipt: receipt });
    if (!saved.recorded) throw new FinancialGuardError("Stripe procesó el movimiento, pero falta guardar su comprobante.");
    return receipt;
  }
  return {
    // Existing keys are deliberately replaced by the durable database step key.
    transfer: (params: Stripe.TransferCreateParams, options?: Stripe.RequestOptions) => { void options; return execute("transfer", params); },
    refund: (params: Stripe.RefundCreateParams, options?: Stripe.RequestOptions) => { void options; return execute("refund", params); },
    recover: (kind: "transfer" | "refund", params: Stripe.TransferCreateParams | Stripe.RefundCreateParams) => execute(kind, params, true),
  };
}
