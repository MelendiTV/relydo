/** Validate only the financial values frozen by the base Checkout/PaymentIntent. */
export function validateBasePaymentSnapshot(
  metadata: Record<string, string> | null,
  chargedCents: number | null,
  creditReservation?: { id: string; amount_cents: number; charge_cents: number; snapshot: Record<string, string> } | null,
) {
  // Same two-decimal rounding used when Checkout freezes its amounts.
  const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const read = (key: string) => {
    const raw = metadata?.[key];
    if (typeof raw !== "string" || raw.trim() === "") throw new Error("Snapshot financiero incompleto.");
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 100)) || value !== money(value)) {
      throw new Error("Snapshot financiero inválido.");
    }
    return value;
  };
  const jobAmount = read("professional_price");
  const customerFeePercent = read("customer_fee_percent");
  const customerFeeAmount = read("customer_fee_amount");
  const customerTotalAmount = read("customer_total");
  const providerCommissionPercent = read("provider_commission_percent");
  const providerCommissionAmount = read("provider_commission_amount");
  const providerNetAmount = read("provider_net_amount");
  const platformRevenueAmount = read("platform_revenue_amount");
  const hasCredit = metadata?.referral_credit_reservation_id !== undefined || metadata?.referral_credit_applied !== undefined || metadata?.customer_charge_amount !== undefined;
  const referralCreditApplied = hasCredit ? read("referral_credit_applied") : 0;
  const customerChargeAmount = hasCredit ? read("customer_charge_amount") : customerTotalAmount;
  if (hasCredit && (!creditReservation || creditReservation.id !== metadata?.referral_credit_reservation_id ||
      Number(creditReservation.amount_cents) !== Math.round(referralCreditApplied * 100) ||
      Number(creditReservation.charge_cents) !== Math.round(customerChargeAmount * 100) ||
      Object.keys(creditReservation.snapshot).some(key => creditReservation.snapshot[key] !== metadata?.[key]))) {
    throw new Error("Reserva de crédito inválida.");
  }
  if (
    referralCreditApplied > platformRevenueAmount || customerChargeAmount !== money(customerTotalAmount - referralCreditApplied) ||
    customerChargeAmount < providerNetAmount ||
    jobAmount <= 0 || customerTotalAmount <= 0 || providerCommissionPercent > 100 ||
    customerFeeAmount !== money(jobAmount * (customerFeePercent / 100)) ||
    providerCommissionAmount !== money(jobAmount * (providerCommissionPercent / 100)) ||
    customerTotalAmount !== money(jobAmount + customerFeeAmount) ||
    providerNetAmount !== money(jobAmount - providerCommissionAmount) ||
    platformRevenueAmount !== money(customerFeeAmount + providerCommissionAmount) ||
    !Number.isSafeInteger(chargedCents) || chargedCents !== Math.round(customerChargeAmount * 100)
  ) throw new Error("Los importes no coinciden con el snapshot financiero original.");
  return { jobAmount, customerFeePercent, customerFeeAmount, customerTotalAmount,
    providerCommissionPercent, providerCommissionAmount, providerNetAmount, platformRevenueAmount, referralCreditApplied, customerChargeAmount };
}
