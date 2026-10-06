import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { confirmScreeningPayment, invalidateScreeningPayment } from "../../../lib/providerScreening";
import { confirmChangeOrderPayment } from "../../../lib/changeOrderPayments";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not configured." },
      { status: 500 }
    );
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe signature." },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid Stripe signature." },
      { status: 400 }
    );
  }

  if (event.type === "charge.refunded" || event.type === "charge.dispute.created" || event.type === "charge.dispute.updated" || event.type === "charge.dispute.closed") {
    try {
      const chargeId = event.type === "charge.refunded" ? (event.data.object as Stripe.Charge).id :
        (() => { const charge = (event.data.object as Stripe.Dispute).charge; return typeof charge === "string" ? charge : charge.id; })();
      await invalidateScreeningPayment(stripe, chargeId, event.type === "charge.refunded" ? "refunded" : "disputed");
      return NextResponse.json({ received: true });
    } catch {
      return NextResponse.json({ error: "Screening payment invalidation requires retry" }, { status: 500 });
    }
  }

  let basePaymentIntentId: string | null = null;

  // Mobile PaymentSheet does not emit checkout.session.completed.
  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object as Stripe.PaymentIntent;
    if (intent.metadata?.payment_type === "initial_job" &&
        intent.metadata?.payment_flow === "payment_sheet") {
      basePaymentIntentId = intent.id;
    } else if (intent.metadata?.payment_type !== "change_order") {
      return NextResponse.json({ received: true, ignored: true });
    }
    if (!basePaymentIntentId) {
      try {
        const result = await confirmChangeOrderPayment({ paymentIntentId: intent.id });
        return NextResponse.json({ received: true, processed: true, ...result });
      } catch (error) {
        console.error("Change Order webhook requires retry/reconciliation", intent.id, error);
        return NextResponse.json({ error: "Additional payment confirmation failed; retry required." }, { status: 500 });
      }
    }
  }

  if (
    !basePaymentIntentId &&
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return NextResponse.json({
      received: true,
      ignored: true,
    });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  if (!basePaymentIntentId && session.payment_status !== "paid") {
    return NextResponse.json({
      received: true,
      pending: true,
    });
  }

  if (!basePaymentIntentId && session.metadata?.payment_type === "change_order") {
    // Existing job payments retain their own confirmation path.
    try {
      const result = await confirmChangeOrderPayment({ sessionId: session.id });
      return NextResponse.json({ received: true, processed: true, ...result });
    } catch (error) {
      console.error("Change Order webhook requires retry/reconciliation", session.id, error);
      return NextResponse.json({ error: "Additional payment confirmation failed; retry required." }, { status: 500 });
    }
  }

  const endpoint = "/api/checkout/verify-payment";
  if (!basePaymentIntentId && session.metadata?.payment_type === "provider_verification") {
    try {
      await confirmScreeningPayment(stripe, session.id);
      return NextResponse.json({ received: true, processed: true });
    } catch {
      return NextResponse.json({ error: "Verification payment requires reconciliation" }, { status: 500 });
    }
  }

  const configuredOrigin =
    process.env.RELYDO_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "");

  let baseUrl: string;
  try {
    const url = new URL(configuredOrigin);
    if (
      (url.protocol !== "https:" &&
        (process.env.NODE_ENV === "production" || url.protocol !== "http:")) ||
      url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash
    ) {
      throw new Error("Invalid application origin.");
    }
    baseUrl = url.origin;
  } catch {
    return NextResponse.json(
      { error: "Trusted application origin is not configured or invalid; Stripe should retry this webhook." },
      { status: 500 }
    );
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-relydo-internal-stripe": webhookSecret,
      },
      // Reuse base confirmation, including its frozen snapshot validator and collision handling.
      body: JSON.stringify(basePaymentIntentId
        ? { paymentIntentId: basePaymentIntentId }
        : { sessionId: session.id }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Payment finalization unavailable; Stripe should retry this webhook." }, { status: 500 });
  }

  let result: Record<string, unknown> = {};

  try {
    result = (await response.json()) as Record<string, unknown>;
  } catch {
    // Si el procesador devolvió una respuesta no JSON, dejamos
    // que Stripe reintente porque no podemos confirmar el resultado.
  }

  if (response.ok) {
    return NextResponse.json({
      received: true,
      processed: true,
    });
  }

  // Un 409 con reembolso confirmado es un resultado terminal válido:
  // no queremos que Stripe repita el webhook indefinidamente.
  if (response.status === 409 && result.refunded === true) {
    return NextResponse.json({
      received: true,
      processed: true,
      refunded: true,
    });
  }

  console.error(
    "Stripe webhook could not finalize RELYDO payment:",
    result
  );

  return NextResponse.json(
    {
      error:
        "Payment finalization failed; Stripe should retry this webhook.",
    },
    { status: 500 }
  );
}
