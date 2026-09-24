import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { ChangeOrderPaymentError } from "./changeOrderPayments";

export type PaymentFlow = "checkout" | "payment_sheet";
export type PaymentPayload = {
  currency: string;
  metadata: Record<string, string>;
  amounts: Record<string, number | string>;
  params: Stripe.Checkout.SessionCreateParams | Stripe.PaymentIntentCreateParams;
};
type Reservation = {
  id: string;
  flow: PaymentFlow;
  created_at: string;
  payload: PaymentPayload;
  session_id: string | null;
  payment_intent_id: string | null;
};
export type ReservationResult = {
  outcome: "paid" | "legacy" | "needs_payload" | "reserved";
  reservation?: Reservation;
};
function database() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function reservationError(error: { code?: string; message?: string }): never {
  // Missing/unavailable RPC must fail closed; never fall back to direct writes.
  if (error.code === "P0001") {
    throw new ChangeOrderPaymentError("El adicional tiene un pago reservado o un estado que requiere revisión. No inicies otro cobro.");
  }
  throw new ChangeOrderPaymentError("No pudimos asegurar la reserva del pago. No inicies otro cobro.", 503);
}
export async function reservePayment(orderId: string, customerId: string, flow: PaymentFlow, payload?: PaymentPayload): Promise<ReservationResult> {
  const { data, error } = await database().rpc("reserve_change_order_payment", {
    p_change_order_id: orderId, p_customer_id: customerId, p_flow: flow, p_payload: payload || null,
  });
  if (error) reservationError(error);
  if (!data || !["paid", "legacy", "needs_payload", "reserved"].includes(data.outcome)) {
    throw new ChangeOrderPaymentError("La reserva devolvió un resultado inválido.", 503);
  }
  return data;
}

/** Preparation only. No confirm/capture/transfer/refund API is called here.
 * A reservation is never cleared or recycled automatically, even after expiry.
 */
export async function prepareReservedPayment(stripe: Stripe, orderId: string, customerId: string, reservation: Reservation) {
  const { id, flow, payload } = reservation;
  if (!id || !payload?.metadata || !payload.params || !["checkout", "payment_sheet"].includes(flow)) {
    throw new ChangeOrderPaymentError("La reserva no contiene datos completos.", 503);
  }
  const age = Date.now() - new Date(reservation.created_at).getTime();
  const hasReference = flow === "checkout" ? reservation.session_id : reservation.payment_intent_id;
  // Stripe may prune idempotency keys after >=24h. Leave a safety margin and
  // never create again once an uncertain reservation exceeds this window.
  if (!hasReference && (!Number.isFinite(age) || age < 0 || age >= 20 * 60 * 60 * 1000)) {
    throw new ChangeOrderPaymentError("El intento de pago requiere conciliación antes de continuar. No vuelvas a pagar.");
  }
  const metadata = { ...payload.metadata, payment_reservation_id: id };
  const key = `relydo_co_reservation_${id}`;
  const expectedTotal = Math.round(Number(payload.amounts.customerTotalAmount) * 100);
  if (!Number.isSafeInteger(expectedTotal) || expectedTotal <= 0) throw new ChangeOrderPaymentError("La reserva tiene un importe inválido.");
  let session: Stripe.Checkout.Session | undefined;
  let intent: Stripe.PaymentIntent | undefined;
  if (flow === "checkout") {
    const params = payload.params as Stripe.Checkout.SessionCreateParams;
    session = reservation.session_id
      ? await stripe.checkout.sessions.retrieve(reservation.session_id)
      : await stripe.checkout.sessions.create({
        ...params, metadata,
        payment_intent_data: { ...params.payment_intent_data, metadata },
      }, { idempotencyKey: key });
    if (session.metadata?.change_order_id !== orderId || session.amount_total !== expectedTotal || session.currency !== payload.currency ||
      Object.entries(metadata).some(([key, value]) => session!.metadata?.[key] !== value)) {
      throw new ChangeOrderPaymentError("El Checkout no corresponde a la reserva.");
    }
  } else {
    intent = reservation.payment_intent_id
      ? await stripe.paymentIntents.retrieve(reservation.payment_intent_id)
      : await stripe.paymentIntents.create({
        ...payload.params as Stripe.PaymentIntentCreateParams, metadata,
      }, { idempotencyKey: key });
    if (intent.metadata?.change_order_id !== orderId || intent.amount !== expectedTotal || intent.currency !== payload.currency ||
      Object.entries(metadata).some(([key, value]) => intent!.metadata?.[key] !== value)) {
      throw new ChangeOrderPaymentError("El PaymentIntent no corresponde a la reserva.");
    }
  }
  const { data, error } = await database().rpc("attach_change_order_payment", {
    p_change_order_id: orderId, p_customer_id: customerId, p_reservation_id: id,
    p_session_id: session?.id || null, p_payment_intent_id: intent?.id || null,
  });
  if (error) reservationError(error);
  if (!data?.attached) throw new ChangeOrderPaymentError("No pudimos guardar el identificador del pago.", 503);
  // A webhook may have confirmed between reserve and attach. The route still
  // reconciles a successful Stripe object, but does not expose a pending one.
  if (!data.allowed && session?.payment_status !== "paid" && intent?.status !== "succeeded") {
    throw new ChangeOrderPaymentError("El trabajo cambió durante la preparación. El intento quedó registrado para revisión.");
  }
  return { session, intent, amounts: payload.amounts };
}
