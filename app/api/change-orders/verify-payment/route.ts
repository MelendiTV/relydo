import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { sendRelydoNotification } from "../../../lib/serverNotifications";
import { getAuthenticatedUser } from "../../../lib/serverAuth";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function refundUnexpectedChangeOrderPayment(
  paymentIntentId: string,
  sessionId: string
) {
  try {
    const refund = await stripe.refunds.create(
      { payment_intent: paymentIntentId },
      {
        idempotencyKey: `relydo-change-order-auto-refund-${sessionId}`,
      }
    );

    return { ok: true as const, refundId: refund.id };
  } catch (error) {
    console.error(
      "RELYDO: falló el reembolso automático del Change Order:",
      error
    );
    return { ok: false as const, refundId: null };
  }
}

export async function POST(request: NextRequest) {
  try {
    const internalSecret = request.headers.get(
      "x-relydo-internal-stripe"
    );

    const isStripeWebhook = Boolean(
      process.env.STRIPE_WEBHOOK_SECRET &&
        internalSecret === process.env.STRIPE_WEBHOOK_SECRET
    );

    const auth = isStripeWebhook
      ? { user: null }
      : await getAuthenticatedUser(request);

    if (!isStripeWebhook && !auth.user) {
      return NextResponse.json(
        {
          error:
            "Debes iniciar sesión como cliente para verificar este pago adicional.",
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const sessionId = String(body?.sessionId || "").trim();

    if (!sessionId) {
      return NextResponse.json(
        { error: "Falta el ID de la sesión de Stripe." },
        { status: 400 }
      );
    }

    const session = await stripe.checkout.sessions.retrieve(
      sessionId,
      { expand: ["payment_intent"] }
    );

    if (session.payment_status !== "paid") {
      return NextResponse.json(
        {
          error:
            "Stripe todavía no confirma el pago adicional.",
          paymentStatus: session.payment_status,
        },
        { status: 400 }
      );
    }

    if (session.metadata?.payment_type !== "change_order") {
      return NextResponse.json(
        {
          error:
            "Esta sesión de Stripe no corresponde a un cambio de presupuesto.",
        },
        { status: 400 }
      );
    }

    const changeOrderId = session.metadata?.change_order_id;
    const requestId = session.metadata?.request_id;
    const customerId = session.metadata?.customer_id;
    const providerId = session.metadata?.provider_id;

    if (
      !changeOrderId ||
      !requestId ||
      !customerId ||
      !providerId
    ) {
      return NextResponse.json(
        {
          error:
            "La sesión de Stripe no contiene todos los datos del cambio de presupuesto.",
        },
        { status: 400 }
      );
    }

    if (!isStripeWebhook && customerId !== auth.user!.id) {
      return NextResponse.json(
        {
          error:
            "Esta sesión de pago adicional no pertenece a tu cuenta.",
        },
        { status: 403 }
      );
    }

    const paymentIntent = session.payment_intent;
    const paymentIntentId =
      typeof paymentIntent === "string"
        ? paymentIntent
        : paymentIntent?.id || null;

    if (!paymentIntentId) {
      return NextResponse.json(
        {
          error:
            "Stripe confirmó el pago pero no encontramos el Payment Intent.",
        },
        { status: 500 }
      );
    }

    const { data: changeOrder, error: changeOrderError } =
      await supabaseAdmin
        .from("change_orders")
        .select(`
          id,
          request_id,
          provider_id,
          customer_id,
          original_amount,
          additional_amount,
          new_total_amount,
          status,
          payment_status,
          stripe_checkout_session_id,
          stripe_payment_intent_id,
          paid_at
        `)
        .eq("id", changeOrderId)
        .eq("request_id", requestId)
        .maybeSingle();

    if (changeOrderError) {
      return NextResponse.json(
        {
          error: "No pudimos consultar el cambio de presupuesto.",
        },
        { status: 500 }
      );
    }

    if (!changeOrder) {
      return NextResponse.json(
        {
          error:
            "No encontramos el cambio de presupuesto correspondiente.",
        },
        { status: 404 }
      );
    }

    if (
      changeOrder.customer_id !== customerId ||
      changeOrder.provider_id !== providerId ||
      (!isStripeWebhook &&
        changeOrder.customer_id !== auth.user!.id)
    ) {
      return NextResponse.json(
        {
          error:
            "Los participantes del pago no coinciden con el cambio de presupuesto.",
        },
        { status: 403 }
      );
    }

    if (changeOrder.status !== "accepted") {
      const refund = await refundUnexpectedChangeOrderPayment(
        paymentIntentId,
        session.id
      );

      return NextResponse.json(
        {
          error: refund.ok
            ? "El cambio de presupuesto ya no estaba aceptado. El cobro fue reembolsado automáticamente."
            : "El cambio de presupuesto ya no estaba aceptado y el reembolso automático falló. Requiere revisión administrativa.",
          refunded: refund.ok,
          refundId: refund.refundId,
        },
        { status: refund.ok ? 409 : 500 }
      );
    }

    if (changeOrder.payment_status === "paid") {
      if (
        changeOrder.stripe_payment_intent_id &&
        changeOrder.stripe_payment_intent_id !== paymentIntentId
      ) {
        const refund = await refundUnexpectedChangeOrderPayment(
          paymentIntentId,
          session.id
        );

        return NextResponse.json(
          {
            error: refund.ok
              ? "Este cambio ya tenía otro pago. El cobro duplicado fue reembolsado automáticamente."
              : "Este cambio ya tenía otro pago y el reembolso automático falló. Requiere revisión administrativa.",
            duplicatePayment: true,
            refunded: refund.ok,
            refundId: refund.refundId,
          },
          { status: refund.ok ? 409 : 500 }
        );
      }

      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        changeOrderId: changeOrder.id,
        requestId: changeOrder.request_id,
        paymentStatus: "paid",
      });
    }

    const additionalAmount = money(
      Number(session.metadata?.additional_amount || 0)
    );
    const customerFeePercent = money(
      Number(session.metadata?.customer_fee_percent || 0)
    );
    const customerFeeAmount = money(
      Number(session.metadata?.customer_fee_amount || 0)
    );
    const customerTotalAmount = money(
      Number(session.metadata?.customer_total_amount || 0)
    );
    const providerCommissionPercent = money(
      Number(
        session.metadata?.provider_commission_percent || 0
      )
    );
    const providerCommissionAmount = money(
      Number(
        session.metadata?.provider_commission_amount || 0
      )
    );
    const providerNetAmount = money(
      Number(session.metadata?.provider_net_amount || 0)
    );
    const platformRevenueAmount = money(
      Number(
        session.metadata?.platform_revenue_amount || 0
      )
    );

    const stripeTotal = money(
      Number(session.amount_total || 0) / 100
    );

    if (
      customerTotalAmount <= 0 ||
      Math.abs(stripeTotal - customerTotalAmount) > 0.01
    ) {
      return NextResponse.json(
        {
          error:
            "El monto confirmado por Stripe no coincide con el checkout original del cambio de presupuesto.",
        },
        { status: 400 }
      );
    }

    if (
      Math.abs(
        money(Number(changeOrder.additional_amount)) -
          additionalAmount
      ) > 0.01
    ) {
      return NextResponse.json(
        {
          error:
            "El monto adicional pagado no coincide con el Change Order.",
        },
        { status: 400 }
      );
    }

    const { data: serviceRequest, error: serviceRequestError } =
      await supabaseAdmin
        .from("service_requests")
        .select(
          "id, customer_id, preferred_provider_id, status, job_stage"
        )
        .eq("id", requestId)
        .maybeSingle();

    if (serviceRequestError || !serviceRequest) {
      return NextResponse.json(
        {
          error:
            serviceRequestError?.message ||
            "No encontramos el trabajo correspondiente.",
        },
        { status: serviceRequestError ? 500 : 404 }
      );
    }

    const jobStillValid =
      serviceRequest.customer_id === customerId &&
      serviceRequest.preferred_provider_id === providerId &&
      serviceRequest.status === "in_progress" &&
      serviceRequest.job_stage === "working";

    if (!jobStillValid) {
      const refund = await refundUnexpectedChangeOrderPayment(
        paymentIntentId,
        session.id
      );

      return NextResponse.json(
        {
          error: refund.ok
            ? "El trabajo cambió antes de confirmar el pago adicional. El cobro fue reembolsado automáticamente."
            : "El trabajo cambió antes de confirmar el pago adicional y el reembolso automático falló. Requiere revisión administrativa.",
          refunded: refund.ok,
          refundId: refund.refundId,
        },
        { status: refund.ok ? 409 : 500 }
      );
    }

    const paidAt = new Date().toISOString();

    const { data: updated, error: updateError } =
      await supabaseAdmin
        .from("change_orders")
        .update({
          payment_status: "paid",
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: paymentIntentId,
          additional_customer_fee_percent:
            customerFeePercent,
          additional_customer_fee_amount:
            customerFeeAmount,
          additional_customer_total_amount:
            customerTotalAmount,
          additional_provider_commission_percent:
            providerCommissionPercent,
          additional_provider_commission_amount:
            providerCommissionAmount,
          additional_provider_net_amount:
            providerNetAmount,
          additional_platform_revenue_amount:
            platformRevenueAmount,
          paid_at: paidAt,
          updated_at: paidAt,
        })
        .eq("id", changeOrder.id)
        .neq("payment_status", "paid")
        .select(
          "id, request_id, payment_status, stripe_payment_intent_id, paid_at"
        )
        .maybeSingle();

    if (updateError) {
      return NextResponse.json(
        {
          error: "El pago adicional fue confirmado, pero no pudimos actualizar su registro automáticamente.",
        },
        { status: 500 }
      );
    }

    if (!updated) {
      const { data: concurrent } = await supabaseAdmin
        .from("change_orders")
        .select(
          "id, request_id, payment_status, stripe_payment_intent_id"
        )
        .eq("id", changeOrder.id)
        .maybeSingle();

      if (
        concurrent?.payment_status === "paid" &&
        concurrent.stripe_payment_intent_id === paymentIntentId
      ) {
        return NextResponse.json({
          success: true,
          alreadyProcessed: true,
          changeOrderId: changeOrder.id,
          requestId: changeOrder.request_id,
          paymentStatus: "paid",
        });
      }

      if (
        concurrent?.payment_status === "paid" &&
        concurrent.stripe_payment_intent_id !== paymentIntentId
      ) {
        const refund = await refundUnexpectedChangeOrderPayment(
          paymentIntentId,
          session.id
        );

        return NextResponse.json(
          {
            error: refund.ok
              ? "Otro pago se confirmó primero. Este cobro fue reembolsado automáticamente."
              : "Otro pago se confirmó primero y el reembolso automático falló. Requiere revisión administrativa.",
            refunded: refund.ok,
            refundId: refund.refundId,
          },
          { status: refund.ok ? 409 : 500 }
        );
      }

      return NextResponse.json(
        {
          error:
            "Stripe confirmó el pago, pero no pudimos finalizar el registro del Change Order.",
        },
        { status: 500 }
      );
    }

    try {
      await sendRelydoNotification({
        userId: providerId,
        type: "change_order_paid",
        title: "Pago adicional confirmado",
        titleEn: "Additional payment confirmed",
        message: `El cliente pagó el cambio de presupuesto. Monto adicional: $${additionalAmount.toFixed(
          2
        )}. Neto adicional para ti: $${providerNetAmount.toFixed(
          2
        )}.`,
        messageEn: `The customer paid the budget change. Additional amount: $${additionalAmount.toFixed(
          2
        )}. Additional net amount for you: $${providerNetAmount.toFixed(
          2
        )}.`,
        requestId,
        url: `/trabajos/${requestId}`,
      });
    } catch (notificationError) {
      console.warn(
        "El pago adicional quedó confirmado, pero no pudimos notificar al profesional:",
        notificationError
      );
    }

    return NextResponse.json({
      success: true,
      alreadyProcessed: false,
      changeOrderId: updated.id,
      requestId: updated.request_id,
      paymentStatus: updated.payment_status,
      stripePaymentIntentId: paymentIntentId,
      amounts: {
        additionalAmount,
        customerFeePercent,
        customerFeeAmount,
        customerTotalAmount,
        providerCommissionPercent,
        providerCommissionAmount,
        providerNetAmount,
        platformRevenueAmount,
      },
    });
  } catch (error) {
    console.error(
      "Error verificando pago de Change Order:",
      error
    );

    return NextResponse.json(
      {
        error:
          "No pudimos verificar el pago adicional.",
      },
      { status: 500 }
    );
  }
}
