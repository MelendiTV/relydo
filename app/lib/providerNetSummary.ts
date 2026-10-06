import type { SupabaseClient } from "@supabase/supabase-js";

type Money = number | string | null;
export type ProviderChangeOrder = {
  id: string;
  request_id: string;
  payment_status: string;
  original_amount: Money;
  created_at: string;
  additional_provider_net_amount: Money;
  released_at: string | null;
  stripe_transfer_id: string | null;
};

const cents = (value: Money) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : 0;
};

// Read confirmed, persisted snapshots; never infer net from prices or current fees.
export function providerNetSummary(
  payment: { request_id: string; job_amount: Money; provider_net_amount: Money; status: string | null },
  orders: readonly ProviderChangeOrder[],
) {
  const confirmed = orders.filter(order => order.request_id === payment.request_id && order.payment_status === "paid")
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  // Historical aggregated bases must not receive the same additions a second time.
  if (confirmed.length && (payment.job_amount == null || confirmed[0].original_amount == null ||
      cents(payment.job_amount) !== cents(confirmed[0].original_amount))) {
    throw new Error("El pago base requiere conciliación antes de sumar adicionales.");
  }
  const base = cents(payment.provider_net_amount);
  let additional = 0;
  let heldAdditional = 0;
  let releasedAdditional = 0;
  const seen = new Set<string>();
  for (const order of orders) {
    if (order.request_id !== payment.request_id || order.payment_status !== "paid" || seen.has(order.id)) continue;
    seen.add(order.id);
    const net = cents(order.additional_provider_net_amount);
    additional += net;
    if (order.released_at || order.stripe_transfer_id) releasedAdditional += net;
    else heldAdditional += net;
  }
  return {
    base: base / 100,
    additional: additional / 100,
    total: (base + additional) / 100,
    held: ((payment.status === "ready_for_payout" ? base : 0) + heldAdditional) / 100,
    released: ((payment.status === "paid_out" ? base : 0) + releasedAdditional) / 100,
  };
}

export async function loadProviderChangeOrders(db: SupabaseClient, providerId: string) {
  const rows: ProviderChangeOrder[] = [];
  // Stable pagination avoids silently losing additions beyond the API row limit.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("change_orders")
      .select("id,request_id,payment_status,original_amount,created_at,additional_provider_net_amount,released_at,stripe_transfer_id")
      .eq("provider_id", providerId).eq("payment_status", "paid")
      .order("id", { ascending: true }).range(offset, offset + 499);
    if (error) throw new Error(`No pudimos cargar los pagos adicionales: ${error.message}`);
    rows.push(...(data || []) as ProviderChangeOrder[]);
    if (!data || data.length < 500) return rows;
  }
}
