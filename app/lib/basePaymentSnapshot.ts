/** Validate only the financial values frozen by the base Checkout/PaymentIntent. */
export function validateBasePaymentSnapshot(
  metadata: Record<string, string> | null,
  chargedCents: number | null,
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
  if (
    jobAmount <= 0 || customerTotalAmount <= 0 || providerCommissionPercent > 100 ||
    customerFeeAmount !== money(jobAmount * (customerFeePercent / 100)) ||
    providerCommissionAmount !== money(jobAmount * (providerCommissionPercent / 100)) ||
    customerTotalAmount !== money(jobAmount + customerFeeAmount) ||
    providerNetAmount !== money(jobAmount - providerCommissionAmount) ||
    platformRevenueAmount !== money(customerFeeAmount + providerCommissionAmount) ||
    !Number.isSafeInteger(chargedCents) || chargedCents !== Math.round(customerTotalAmount * 100)
  ) throw new Error("Los importes no coinciden con el snapshot financiero original.");
  return { jobAmount, customerFeePercent, customerFeeAmount, customerTotalAmount,
    providerCommissionPercent, providerCommissionAmount, providerNetAmount, platformRevenueAmount };
}
