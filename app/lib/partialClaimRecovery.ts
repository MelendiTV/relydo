import type Stripe from "stripe";
import { FinancialGuardError, financialStripe } from "./jobFinancialGuard";

type Source = { key: string; chargeId: string; providerCents: number; refundCents: number };
type Receipt = { id: string; amount: number; status: string | null };

/** Validate the entire plan before any create, then reconcile immutable guard steps. */
export async function reconcilePartialClaimSources<T extends Source>({
  stripe, settlement, sources, existingTransfers, transferParams, refundParams, beforeRecover,
}: {
  beforeRecover?: () => Promise<void>;
  stripe: Stripe;
  settlement: ReturnType<typeof financialStripe>;
  sources: T[];
  existingTransfers: { data: Stripe.Transfer[]; has_more: boolean };
  transferParams: (source: T) => Stripe.TransferCreateParams;
  refundParams: (source: T) => Stripe.RefundCreateParams;
}) {
  const fail = () => { throw new FinancialGuardError("Los movimientos de una fuente no coinciden con la resolución parcial. Se requiere conciliación antes de continuar."); };
  if (existingTransfers.has_more || new Set(sources.map(s => s.key)).size !== sources.length ||
      new Set(sources.map(s => s.chargeId)).size !== sources.length) fail();
  const transfers = new Map<string, Receipt>();
  const refunds = new Map<string, Receipt[]>();
  const metadataMatches = (actual: Stripe.Metadata | null, expected: Stripe.RefundCreateParams["metadata"]) =>
    !!actual?.relydo_financial_step_id && Object.entries(expected || {}).every(([key, value]) => actual[key] === value);
  for (const transfer of existingTransfers.data) {
    const source = sources.find(s => s.key === transfer.metadata?.claim_source_key);
    if (!source) fail();
    const planned = source!;
    if (planned.providerCents <= 0) fail();
    const params = transferParams(planned);
    const destination = typeof transfer.destination === "string" ? transfer.destination : transfer.destination?.id;
    if (transfer.amount !== planned.providerCents || transfer.amount_reversed ||
        transfer.source_transaction !== planned.chargeId || destination !== params.destination ||
        transfer.currency !== params.currency || !metadataMatches(transfer.metadata, params.metadata) || transfers.has(planned.key)) fail();
    transfers.set(planned.key, { id: transfer.id, amount: transfer.amount, status: "succeeded" });
  }
  for (const source of sources) {
    // Include zero-allocation sources: a prior movement there is also a conflict.
    const listed = await stripe.refunds.list({ charge: source.chargeId, limit: 100 });
    if (listed.has_more || listed.data.length > 1) fail();
    const params = refundParams(source);
    for (const refund of listed.data) {
      const charge = typeof refund.charge === "string" ? refund.charge : refund.charge?.id;
      if (source.refundCents <= 0 || refund.amount !== source.refundCents || refund.status !== "succeeded" ||
          charge !== source.chargeId || !metadataMatches(refund.metadata, params.metadata)) fail();
    }
    refunds.set(source.key, listed.data.map(r => ({ id: r.id, amount: r.amount, status: r.status })));
  }
  // All source observations must be valid before reserving a durable decision.
  await beforeRecover?.();
  // recover is read-only with respect to Stripe. It checks exact persisted params,
  // validates step identity and saves missing receipts; it never creates money.
  for (const source of sources) {
    for (const kind of ["transfer", "refund"] as const) {
      if ((kind === "transfer" ? source.providerCents : source.refundCents) <= 0) continue;
      const receipt = await settlement.recover(kind, kind === "transfer" ? transferParams(source) : refundParams(source));
      const observed = kind === "transfer" ? transfers.get(source.key) : refunds.get(source.key)?.[0];
      if (observed && (!receipt || receipt.id !== observed.id || receipt.amount !== observed.amount)) fail();
      if (receipt) {
        if (kind === "transfer") transfers.set(source.key, receipt);
        else refunds.set(source.key, [receipt]);
      }
    }
  }
  return { transfers, refunds,
    transferCents: [...transfers.values()].reduce((sum, r) => sum + r.amount, 0),
    refundCents: [...refunds.values()].flat().reduce((sum, r) => sum + r.amount, 0),
  };
}
