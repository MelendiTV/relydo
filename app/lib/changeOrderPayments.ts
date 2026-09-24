import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { sendRelydoNotification } from "./serverNotifications";

export class ChangeOrderPaymentError extends Error {
  constructor(message: string, public status = 409) {
    super(message);
  }
}
type Input = {
  sessionId?: string;
  paymentIntentId?: string;
  expectedCustomerId?: string;
  expectedChangeOrderId?: string;
};
const columns = "id,request_id,customer_id,provider_id,status,payment_status,stripe_checkout_session_id,stripe_payment_intent_id,additional_amount,original_amount,new_total_amount,updated_at";
function cents(value: unknown): number {
  if (value === null || value === undefined || String(value).trim() === "") throw new ChangeOrderPaymentError("El pago no tiene importes históricos completos.");
  const number = Number(value);
  const result = Math.round(number * 100);
  if (!Number.isFinite(number) || !Number.isSafeInteger(result) || number < 0) throw new ChangeOrderPaymentError("El pago contiene importes inválidos.");
  return result;
}

/** Server-only reconciliation. Never creates charges, transfers or refunds.
 * Webhooks must verify signatures before calling. HTTP callers must provide
 * expectedCustomerId from Supabase Auth, never from request data.
 */
export async function confirmChangeOrderPayment(input: Input) {
  if ((!input.sessionId && !input.paymentIntentId) || (input.sessionId && input.paymentIntentId)) throw new ChangeOrderPaymentError("Envía sessionId o paymentIntentId para confirmar el pago.", 400);
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  let session: Stripe.Checkout.Session | null = input.sessionId ? await stripe.checkout.sessions.retrieve(input.sessionId) : null;
  const intentId = input.paymentIntentId || (typeof session?.payment_intent === "string" ? session.payment_intent : session?.payment_intent?.id);
  if (!intentId) throw new ChangeOrderPaymentError("Stripe todavía no confirma este pago adicional.");
  const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ["latest_charge"] });
  const identity = session?.metadata || intent.metadata;
  if (identity?.payment_type !== "change_order" || !identity.change_order_id) throw new ChangeOrderPaymentError("Este pago no corresponde a un cambio de presupuesto.", 400);
  if ((input.expectedCustomerId && identity.customer_id !== input.expectedCustomerId) || (input.expectedChangeOrderId && identity.change_order_id !== input.expectedChangeOrderId)) throw new ChangeOrderPaymentError("El pago no pertenece al cliente o cambio solicitado.", 403);
  const { data: order, error: readError } = await db.from("change_orders").select(columns).eq("id", identity.change_order_id).maybeSingle();
  if (readError) throw new ChangeOrderPaymentError("No pudimos consultar el pago adicional.", 500);
  if (!order) throw new ChangeOrderPaymentError("No encontramos el cambio de presupuesto.", 404);
  for (const metadata of [identity, intent.metadata]) {
    if (metadata?.payment_type !== "change_order" || metadata.change_order_id !== order.id || metadata.request_id !== order.request_id || metadata.customer_id !== order.customer_id || metadata.provider_id !== order.provider_id) throw new ChangeOrderPaymentError("Los participantes del pago no coinciden con el cambio de presupuesto.");
  }
  // Old web PaymentIntents contain identity only; use their Session snapshot.
  if (!session && intent.metadata.payment_flow !== "payment_sheet") {
    const sessions = await stripe.checkout.sessions.list({ payment_intent: intent.id, limit: 2 });
    if (sessions.data.length !== 1) throw new ChangeOrderPaymentError("No pudimos identificar el Checkout de este pago.");
    session = sessions.data[0];
  }
  if (session) {
    const linked = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (linked !== intent.id || session.mode !== "payment" || session.metadata?.change_order_id !== order.id || session.metadata?.payment_type !== "change_order" || session.metadata?.customer_id !== order.customer_id || session.metadata?.provider_id !== order.provider_id || session.metadata?.request_id !== order.request_id) throw new ChangeOrderPaymentError("El Checkout no corresponde al pago adicional.");
  }
  if (intent.status !== "succeeded" || (session && session.payment_status !== "paid")) throw new ChangeOrderPaymentError("Stripe todavía no confirma este pago adicional.");
  const charge = intent.latest_charge;
  if (!charge || typeof charge === "string") throw new ChangeOrderPaymentError("No pudimos verificar el cargo del pago adicional.", 500);
  if (charge.refunded || charge.amount_refunded > 0 || charge.disputed) throw new ChangeOrderPaymentError("El cobro tiene un reembolso o disputa y requiere revisión.");
  const metadata = session?.metadata || intent.metadata;
  const amount = cents(metadata?.additional_amount);
  const fee = cents(metadata?.customer_fee_amount);
  const total = cents(metadata?.customer_total_amount);
  const commission = cents(metadata?.provider_commission_amount);
  const net = cents(metadata?.provider_net_amount);
  const revenue = cents(metadata?.platform_revenue_amount);
  const feePercent = cents(metadata?.customer_fee_percent) / 100;
  const commissionPercent = cents(metadata?.provider_commission_percent) / 100;
  if (
    amount <= 0 || net <= 0 || commissionPercent > 100 ||
    amount !== cents(order.additional_amount) ||
    cents(metadata?.original_amount) !== cents(order.original_amount) ||
    cents(metadata?.new_total_amount) !== cents(order.new_total_amount) ||
    cents(metadata?.new_total_amount) !== cents(metadata?.original_amount) + amount ||
    fee !== Math.round(amount * feePercent / 100) ||
    commission !== Math.round(amount * commissionPercent / 100) ||
    total !== amount + fee || net !== amount - commission || revenue !== fee + commission ||
    intent.amount !== total || intent.amount_received !== total ||
    (session && (session.amount_total !== total || session.currency !== intent.currency))
  ) {
    throw new ChangeOrderPaymentError("Los importes del cobro no coinciden con el presupuesto histórico.");
  }
  // Stripe verification and local confirmation are distinct. PostgreSQL owns
  // the job/order locks, idempotency and financial snapshot persistence.
  // Never fall back to the old direct UPDATE if the migration is missing.
  const { payment_reservation_id: reservationId, ...financialMetadata } = metadata || {};
  const { data: confirmation, error: confirmationError } = await db.rpc("confirm_change_order_payment", {
    p_change_order_id: order.id,
    p_evidence: {
      payment_intent_id: intent.id, session_id: session?.id || null,
      reservation_id: reservationId || null, charge_id: charge.id,
      status: intent.status, currency: intent.currency, amount_received: intent.amount_received,
      paid_at: new Date(charge.created * 1000).toISOString(), metadata: financialMetadata,
    },
  });
  if (confirmationError) throw new ChangeOrderPaymentError("Stripe cobró, pero RELYDO no pudo confirmar el adicional. Reintenta la confirmación, no el cobro.", confirmationError.code === "P0001" ? 409 : 503);
  if (confirmation?.outcome === "reconciliation_required") throw new ChangeOrderPaymentError("Stripe cobró y su evidencia quedó registrada, pero el trabajo o reclamo requiere conciliación. No vuelvas a pagar.");
  if (confirmation?.outcome !== "paid") throw new ChangeOrderPaymentError("La base de datos no confirmó el pago adicional.", 503);
  const result = { success: true, paymentStatus: "paid" as const, changeOrderId: order.id, requestId: order.request_id, paymentIntentId: intent.id, sessionId: session?.id };
  if (confirmation.already_paid) return { ...result, alreadyPaid: true };
  let notificationWarning = false;
  try {
    const notification = await sendRelydoNotification({
      userId: order.provider_id, type: "change_order_paid", requestId: order.request_id,
      title: "Pago adicional confirmado", titleEn: "Additional payment confirmed",
      message: `El cliente pagó el cambio de presupuesto. Adicional: $${(amount / 100).toFixed(2)}. Neto adicional: $${(net / 100).toFixed(2)}.`,
      messageEn: `The customer paid the budget change. Additional amount: $${(amount / 100).toFixed(2)}. Additional net: $${(net / 100).toFixed(2)}.`,
      url: `/trabajos/${order.request_id}`,
    });
    notificationWarning = Boolean(notification.error || notification.mobileError || notification.pushFailed || notification.mobilePushFailed);
  } catch { notificationWarning = true; }
  // No durable outbox is available. A notification failure cannot undo payment.
  if (notificationWarning) console.warn("Change Order paid; notification requires review", order.id);
  return { ...result, alreadyPaid: false, notificationWarning };
}
