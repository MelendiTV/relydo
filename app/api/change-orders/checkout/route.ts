import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "../../../lib/serverAuth";
import { ChangeOrderPaymentError, confirmChangeOrderPayment } from "../../../lib/changeOrderPayments";
import { PaymentFlow, PaymentPayload, prepareReservedPayment, reservePayment } from "../../../lib/changeOrderPaymentReservation";

export const runtime = "nodejs";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
type Order = {
  id: string; request_id: string; provider_id: string; customer_id: string;
  original_amount: number; additional_amount: number; new_total_amount: number;
  stripe_checkout_session_id: string | null; stripe_payment_intent_id: string | null;
  payment_status: string;
};

async function buildPayload(order: Order, flow: PaymentFlow, request: NextRequest, body: Record<string, unknown>, email?: string): Promise<PaymentPayload> {
  const { data: settings, error } = await db.from("payment_settings")
    .select("customer_service_fee_percent,provider_commission_percent,currency")
    .eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !settings) throw new ChangeOrderPaymentError("No pudimos cargar las tarifas del pago.", 503);
  const additionalAmount = money(Number(order.additional_amount));
  const customerFeePercent = money(Number(settings.customer_service_fee_percent));
  const providerCommissionPercent = money(Number(settings.provider_commission_percent));
  const customerFeeAmount = money(additionalAmount * customerFeePercent / 100);
  const customerTotalAmount = money(additionalAmount + customerFeeAmount);
  const providerCommissionAmount = money(additionalAmount * providerCommissionPercent / 100);
  const providerNetAmount = money(additionalAmount - providerCommissionAmount);
  const platformRevenueAmount = money(customerFeeAmount + providerCommissionAmount);
  const currency = String(settings.currency || "usd").toLowerCase();
  // Existing RELYDO amounts use two decimal places. Do not silently apply that
  // convention to a different Stripe currency exponent.
  if (currency !== "usd") throw new ChangeOrderPaymentError("Esta moneda requiere revisar sus unidades antes de preparar el pago.");
  const amounts = { additionalAmount, customerFeePercent, customerFeeAmount, customerTotalAmount,
    providerCommissionPercent, providerCommissionAmount, providerNetAmount, platformRevenueAmount, currency: currency.toUpperCase() };
  if (Object.values(amounts).some(v => typeof v === "number" && (!Number.isFinite(v) || v < 0)) ||
    additionalAmount <= 0 || providerNetAmount <= 0 || providerCommissionPercent > 100 ||
    !Number.isSafeInteger(Math.round(customerTotalAmount * 100))) throw new ChangeOrderPaymentError("Los importes del adicional no son válidos.");
  const metadata = {
    payment_type: "change_order", payment_flow: flow,
    change_order_id: order.id, request_id: order.request_id, customer_id: order.customer_id, provider_id: order.provider_id,
    original_amount: Number(order.original_amount).toFixed(2), additional_amount: additionalAmount.toFixed(2),
    new_total_amount: Number(order.new_total_amount).toFixed(2), customer_fee_percent: customerFeePercent.toFixed(2),
    customer_fee_amount: customerFeeAmount.toFixed(2), customer_total_amount: customerTotalAmount.toFixed(2),
    provider_commission_percent: providerCommissionPercent.toFixed(2), provider_commission_amount: providerCommissionAmount.toFixed(2),
    provider_net_amount: providerNetAmount.toFixed(2), platform_revenue_amount: platformRevenueAmount.toFixed(2),
  };
  if (flow === "payment_sheet") {
    const { data: profile, error: profileError } = await db.from("profiles").select("stripe_customer_id").eq("id", order.customer_id).maybeSingle();
    if (profileError) throw new ChangeOrderPaymentError("No pudimos consultar el cliente de Stripe.", 503);
    return { metadata, amounts, currency, params: {
      amount: Math.round(customerTotalAmount * 100), currency, automatic_payment_methods: { enabled: true },
      ...(profile?.stripe_customer_id ? { customer: profile.stripe_customer_id } : {}),
      transfer_group: `relydo_request_${order.request_id}`, metadata,
    } };
  }
  const mobileUrl = String(body.mobileReturnUrl || "").trim();
  const returnUrl = mobileUrl.startsWith("relydo://") || mobileUrl.startsWith("exp://")
    ? mobileUrl : `${request.nextUrl.origin}/mis-solicitudes/${order.request_id}`;
  const separator = returnUrl.includes("?") ? "&" : "?";
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{ quantity: 1,
    price_data: { currency, unit_amount: Math.round(additionalAmount * 100), product_data: { name: "Cambio de presupuesto" } } }];
  if (customerFeeAmount > 0) lineItems.push({ quantity: 1,
    price_data: { currency, unit_amount: Math.round(customerFeeAmount * 100), product_data: { name: "Tarifa de servicio RELYDO" } } });
  return { metadata, amounts, currency, params: {
    mode: "payment", payment_method_types: ["card"], line_items: lineItems,
    success_url: `${returnUrl}${separator}change_order_payment=success&change_order_id=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${returnUrl}${separator}change_order_payment=cancelled&change_order_id=${order.id}`,
    ...(email ? { customer_email: email } : {}), metadata,
    payment_intent_data: { transfer_group: `relydo_request_${order.request_id}`, metadata },
  } };
}

function mobileAmounts(order: Order, intent: Stripe.PaymentIntent) {
  const keys = { additionalAmount: "additional_amount", customerFeePercent: "customer_fee_percent",
    customerFeeAmount: "customer_fee_amount", customerTotalAmount: "customer_total_amount",
    providerCommissionPercent: "provider_commission_percent", providerCommissionAmount: "provider_commission_amount",
    providerNetAmount: "provider_net_amount", platformRevenueAmount: "platform_revenue_amount" };
  const amounts: Record<string, number | string> = { currency: intent.currency.toUpperCase() };
  for (const [key, meta] of Object.entries(keys)) {
    const raw = intent.metadata[meta];
    if (!raw?.trim() || !Number.isFinite(Number(raw)) || Number(raw) < 0) throw new ChangeOrderPaymentError("El intento histórico no tiene importes completos.");
    amounts[key] = Number(raw);
  }
  if (Math.round(Number(amounts.customerTotalAmount) * 100) !== intent.amount ||
    Number(amounts.additionalAmount) !== Number(order.additional_amount) ||
    Number(intent.metadata.original_amount) !== Number(order.original_amount) ||
    Number(intent.metadata.new_total_amount) !== Number(order.new_total_amount) ||
    money(Number(amounts.additionalAmount) + Number(amounts.customerFeeAmount)) !== Number(amounts.customerTotalAmount) ||
    money(Number(amounts.additionalAmount) - Number(amounts.providerCommissionAmount)) !== Number(amounts.providerNetAmount)) {
    throw new ChangeOrderPaymentError("El importe del intento histórico no coincide.");
  }
  return amounts;
}
async function pendingResponse(order: Order, flow: PaymentFlow, session?: Stripe.Checkout.Session | null, intent?: Stripe.PaymentIntent | null, amounts?: Record<string, number | string>) {
  if (session?.payment_status === "paid") return NextResponse.json(await confirmChangeOrderPayment({ sessionId: session.id, expectedCustomerId: order.customer_id, expectedChangeOrderId: order.id }));
  if (intent?.status === "succeeded") return NextResponse.json(await confirmChangeOrderPayment({ paymentIntentId: intent.id, expectedCustomerId: order.customer_id, expectedChangeOrderId: order.id }));
  if (flow === "checkout" && session?.status === "open" && session.url && !intent) {
    return NextResponse.json({ success: true, reused: true, url: session.url, sessionId: session.id, changeOrderId: order.id, amounts });
  }
  if (flow === "payment_sheet" && intent?.client_secret && session?.status !== "open" && session?.status !== "complete" &&
    ["requires_payment_method", "requires_confirmation", "requires_action"].includes(intent.status)) {
    const responseAmounts = amounts || mobileAmounts(order, intent);
    // Reuse the Stripe customer that owns THIS intent, never a changed profile.
    const customer = typeof intent.customer === "string" ? intent.customer : intent.customer?.id;
    const customerSession = customer ? await stripe.customerSessions.create({ customer, components: {
      mobile_payment_element: { enabled: true, features: { payment_method_redisplay: "enabled",
        payment_method_allow_redisplay_filters: ["always", "limited", "unspecified"],
        payment_method_save: "enabled", payment_method_remove: "enabled" } },
    } }) : null;
    return NextResponse.json({ success: true, reused: true, paymentFlow: "payment_sheet", paymentIntentId: intent.id,
      paymentIntentClientSecret: intent.client_secret, stripeCustomerId: customer || null,
      customerSessionClientSecret: customerSession?.client_secret || null, changeOrderId: order.id,
      amounts: responseAmounts });
  }
  throw new ChangeOrderPaymentError("El intento está pendiente, cerrado o reservado en otro canal. No inicies otro cobro; requiere revisión.");
}
function checkIdentity(order: Order, metadata: Stripe.Metadata | null) {
  if (metadata?.payment_type !== "change_order" || metadata.change_order_id !== order.id ||
    metadata.customer_id !== order.customer_id || metadata.provider_id !== order.provider_id || metadata.request_id !== order.request_id) {
    throw new ChangeOrderPaymentError("El intento no corresponde a este adicional.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (!auth.user) return NextResponse.json({ error: "Tu sesión no es válida. Inicia sesión nuevamente." }, { status: 401 });
    const body = await request.json();
    const id = String(body?.changeOrderId || "").trim();
    if (!id) throw new ChangeOrderPaymentError("Falta el ID del cambio de presupuesto.", 400);
    const flow: PaymentFlow = body?.paymentFlow === "payment_sheet" ? "payment_sheet" : "checkout";
    const { data: order, error } = await db.from("change_orders").select("id,request_id,provider_id,customer_id,original_amount,additional_amount,new_total_amount,payment_status,stripe_checkout_session_id,stripe_payment_intent_id")
      .eq("id", id).eq("customer_id", auth.user.id).maybeSingle();
    if (error) throw new ChangeOrderPaymentError("No pudimos consultar el adicional.", 503);
    if (!order) throw new ChangeOrderPaymentError("No encontramos el adicional o no tienes permiso para pagarlo.", 404);
    if (body?.action === "confirm") return NextResponse.json(await confirmChangeOrderPayment({
      paymentIntentId: String(body?.paymentIntentId || "").trim() || undefined,
      expectedCustomerId: auth.user.id, expectedChangeOrderId: id,
    }));

    const session = order.stripe_checkout_session_id ? await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id) : null;
    const intent = order.stripe_payment_intent_id ? await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id) : null;
    if (session) checkIdentity(order, session.metadata);
    if (intent) checkIdentity(order, intent.metadata);
    // Historical expired web Checkout + succeeded mobile PI is valid.
    if (session?.payment_status === "paid" || intent?.status === "succeeded") return await pendingResponse(order, flow, session, intent);
    if (order.payment_status === "paid") throw new ChangeOrderPaymentError("El pago registrado requiere conciliación; no vuelvas a pagar.");

    // Always consult the transactional gate before exposing any pending attempt.
    let reservation = await reservePayment(id, auth.user.id, flow);
    if (reservation.outcome === "legacy") return await pendingResponse(order, flow, session, intent);
    if (reservation.outcome === "needs_payload") {
      const payload = await buildPayload(order, flow, request, body, auth.user.email);
      reservation = await reservePayment(id, auth.user.id, flow, payload);
    }
    if (reservation.outcome !== "reserved" || !reservation.reservation) {
      throw new ChangeOrderPaymentError("El adicional cambió mientras se preparaba. Reintenta la confirmación, no el cobro.");
    }
    const prepared = await prepareReservedPayment(stripe, id, auth.user.id, reservation.reservation);
    return await pendingResponse(order, flow, prepared.session, prepared.intent, prepared.amounts);
  } catch (error) {
    if (error instanceof ChangeOrderPaymentError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
    console.error("Change Order preparation failed", error);
    return NextResponse.json({ error: "No pudimos preparar el pago. El intento se conserva; no inicies otro cobro." }, { status: 503 });
  }
}
