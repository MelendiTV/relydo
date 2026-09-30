type Money = number | string | null | undefined;
type BasePayment = { job_amount: Money; customer_total_amount: Money; customer_fee_amount: Money; provider_commission_amount: Money; provider_net_amount: Money; platform_revenue_amount: Money };
type Adjustment = { id: string; request_id: string; payment_status: string; original_amount: Money; additional_amount: Money; created_at: string; additional_customer_total_amount: Money; additional_customer_fee_amount: Money; additional_provider_commission_amount: Money; additional_provider_net_amount: Money; additional_platform_revenue_amount: Money };
const cents = (value: Money): number | null => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Math.round(Number(value) * 100);
const sum = (values: Money[]) => {
  const numbers = values.map(cents);
  return numbers.some(value => value === null) ? null : (numbers as number[]).reduce((a, b) => a + b, 0);
};
const dollars = (value: number | null) => value === null ? null : value / 100;
export function orderFinancialSummary(payment: BasePayment, orders: Adjustment[], requestId: string) {
  const paid = [...new Map(orders.filter(order => order.request_id === requestId && order.payment_status === "paid").map(order => [order.id, order])).values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const changes = sum(paid.map(order => order.additional_amount));
  // payments guarda el cobro base; confirmar contra el primer presupuesto para no sumar sobre un agregado histórico.
  const base = cents(payment.job_amount);
  const original = paid.length ? cents(paid[0].original_amount) : base;
  const baseConfirmed = !paid.length || (base !== null && original !== null && base === original);
  const add = (baseValue: Money, values: Money[]) => {
    const start = cents(baseValue), extra = sum(values);
    return dollars(baseConfirmed && start !== null && extra !== null ? start + extra : null);
  };
  const customerExtra = paid.map(order => order.additional_customer_total_amount ?? (cents(order.additional_amount) !== null && cents(order.additional_customer_fee_amount) !== null ? (cents(order.additional_amount)! + cents(order.additional_customer_fee_amount)!) / 100 : null));
  return {
    original: dollars(original), changes: dollars(changes),
    serviceTotal: dollars(original !== null && changes !== null ? original + changes : null),
    originalCustomer: baseConfirmed ? dollars(cents(payment.customer_total_amount)) : null,
    additionalCustomer: dollars(sum(customerExtra)), customerTotal: add(payment.customer_total_amount, customerExtra),
    commission: add(payment.provider_commission_amount, paid.map(order => order.additional_provider_commission_amount)),
    net: add(payment.provider_net_amount, paid.map(order => order.additional_provider_net_amount)),
    revenue: add(payment.platform_revenue_amount, paid.map(order => order.additional_platform_revenue_amount)),
    fee: add(payment.customer_fee_amount, paid.map(order => order.additional_customer_fee_amount)),
    baseConfirmed,
  };
}
