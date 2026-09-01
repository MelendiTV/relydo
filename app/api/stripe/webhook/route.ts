import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

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
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Invalid Stripe signature.",
      },
      { status: 400 }
    );
  }

  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  ) {
    return NextResponse.json({
      received: true,
      ignored: true,
    });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  if (session.payment_status !== "paid") {
    return NextResponse.json({
      received: true,
      pending: true,
    });
  }

  const endpoint =
    session.metadata?.payment_type === "change_order"
      ? "/api/change-orders/verify-payment"
      : "/api/checkout/verify-payment";

  const baseUrl = (
    process.env.RELYDO_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    request.nextUrl.origin
  ).replace(/\/$/, "");

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-relydo-internal-stripe": webhookSecret,
    },
    body: JSON.stringify({
      sessionId: session.id,
    }),
    cache: "no-store",
  });

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
