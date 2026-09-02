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

async function refundUnexpectedPayment(
  paymentIntentId: string,
  sessionId: string
) {
  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
      },
      {
        idempotencyKey: `relydo-auto-refund-${sessionId}`,
      }
    );

    return {
      ok: true as const,
      refundId: refund.id,
    };
  } catch (error) {
    console.error(
      "RELYDO: no pudimos reembolsar automáticamente un pago que ya no podía aplicarse:",
      error
    );

    return {
      ok: false as const,
      refundId: null,
    };
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
            "Debes iniciar sesión como cliente para verificar este pago.",
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
      {
        expand: ["payment_intent"],
      }
    );

    if (session.payment_status !== "paid") {
      return NextResponse.json(
        {
          error: "Stripe todavía no confirma este pago.",
          paymentStatus: session.payment_status,
        },
        { status: 400 }
      );
    }

    if (
      session.metadata?.payment_type &&
      session.metadata.payment_type !== "initial_job"
    ) {
      return NextResponse.json(
        {
          error:
            "Esta sesión de Stripe no corresponde al pago inicial de un trabajo.",
        },
        { status: 400 }
      );
    }

    const requestId = session.metadata?.request_id;
    const offerId = session.metadata?.offer_id;
    const metadataCustomerId = session.metadata?.customer_id;
    const metadataProfessionalId =
      session.metadata?.professional_id;

    if (
      !requestId ||
      !offerId ||
      !metadataCustomerId ||
      !metadataProfessionalId
    ) {
      return NextResponse.json(
        {
          error:
            "La sesión de Stripe no contiene los datos necesarios del trabajo.",
        },
        { status: 400 }
      );
    }

    if (
      !isStripeWebhook &&
      metadataCustomerId !== auth.user!.id
    ) {
      return NextResponse.json(
        {
          error:
            "Esta sesión de pago no pertenece a tu cuenta.",
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
            "Stripe confirmó el pago, pero no encontramos el PaymentIntent.",
        },
        { status: 500 }
      );
    }

    const { data: offer, error: offerError } =
      await supabaseAdmin
        .from("offers")
        .select(
          "id, request_id, professional_id, price, status"
        )
        .eq("id", offerId)
        .eq("request_id", requestId)
        .maybeSingle();

    if (offerError) {
      return NextResponse.json(
        {
          error: "No pudimos consultar el presupuesto.",
        },
        { status: 500 }
      );
    }

    if (!offer) {
      return NextResponse.json(
        {
          error:
            "No encontramos la oferta correspondiente al pago.",
        },
        { status: 404 }
      );
    }

    if (offer.professional_id !== metadataProfessionalId) {
      return NextResponse.json(
        {
          error:
            "El profesional de la sesión de Stripe no coincide con la oferta.",
        },
        { status: 400 }
      );
    }

    const { data: serviceRequest, error: requestError } =
      await supabaseAdmin
        .from("service_requests")
        .select(
          "id, title, customer_id, status, preferred_provider_id"
        )
        .eq("id", requestId)
        .maybeSingle();

    if (requestError) {
      return NextResponse.json(
        {
          error: "No pudimos consultar la solicitud.",
        },
        { status: 500 }
      );
    }

    if (!serviceRequest) {
      return NextResponse.json(
        {
          error: "No encontramos la solicitud correspondiente.",
        },
        { status: 404 }
      );
    }

    if (
      serviceRequest.customer_id !== metadataCustomerId ||
      (!isStripeWebhook &&
        serviceRequest.customer_id !== auth.user!.id)
    ) {
      return NextResponse.json(
        {
          error:
            "Este pago no corresponde a una solicitud de tu cuenta.",
        },
        { status: 403 }
      );
    }

    // Los importes quedan congelados dentro de la Checkout Session.
    // No releemos payment_settings después de que Stripe ya cobró.
    const jobAmount = money(
      Number(session.metadata?.professional_price || 0)
    );
    const customerFeePercent = money(
      Number(session.metadata?.customer_fee_percent || 0)
    );
    const customerFeeAmount = money(
      Number(
        session.metadata?.customer_fee_amount ||
          session.metadata?.service_fee ||
          0
      )
    );
    const customerTotalAmount = money(
      Number(session.metadata?.customer_total || 0)
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
    const currency = String(
      session.metadata?.currency || session.currency || "usd"
    ).toUpperCase();

    const frozenValues = [
      jobAmount,
      customerFeePercent,
      customerFeeAmount,
      customerTotalAmount,
      providerCommissionPercent,
      providerCommissionAmount,
      providerNetAmount,
      platformRevenueAmount,
    ];

    if (
      frozenValues.some(
        (value) => !Number.isFinite(value)
      ) ||
      jobAmount <= 0 ||
      customerTotalAmount <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "La sesión de Stripe no contiene montos válidos de RELYDO.",
        },
        { status: 400 }
      );
    }

    const stripeTotal =
      typeof session.amount_total === "number"
        ? money(session.amount_total / 100)
        : null;

    if (
      stripeTotal === null ||
      Math.abs(stripeTotal - customerTotalAmount) > 0.01
    ) {
      return NextResponse.json(
        {
          error:
            "El importe confirmado por Stripe no coincide con el checkout original de RELYDO.",
        },
        { status: 400 }
      );
    }

    const { data: existingPayment, error: existingPaymentError } =
      await supabaseAdmin
        .from("payments")
        .select("id, status, provider_payment_id")
        .eq("offer_id", offerId)
        .limit(1)
        .maybeSingle();

    if (existingPaymentError) {
      return NextResponse.json(
        {
          error: "No pudimos comprobar el registro del pago.",
        },
        { status: 500 }
      );
    }

    if (
      existingPayment?.provider_payment_id &&
      existingPayment.provider_payment_id !== paymentIntentId
    ) {
      const refund = await refundUnexpectedPayment(
        paymentIntentId,
        session.id
      );

      return NextResponse.json(
        {
          error: refund.ok
            ? "Esta oferta ya tenía otro pago. El cobro duplicado fue reembolsado automáticamente."
            : "Esta oferta ya tenía otro pago y no pudimos reembolsar automáticamente el cobro duplicado. Requiere revisión administrativa.",
          duplicatePayment: true,
          refunded: refund.ok,
          refundId: refund.refundId,
        },
        { status: refund.ok ? 409 : 500 }
      );
    }

    const paymentAlreadyRecorded =
      existingPayment?.provider_payment_id === paymentIntentId;

    const jobAlreadyMatchesPayment =
      serviceRequest.preferred_provider_id ===
        offer.professional_id &&
      offer.status === "selected";

    const canClaimOpenRequest =
      serviceRequest.status === "open" &&
      (
        !serviceRequest.preferred_provider_id ||
        serviceRequest.preferred_provider_id ===
          offer.professional_id
      ) &&
      offer.status === "pending";

    if (
      !canClaimOpenRequest &&
      !jobAlreadyMatchesPayment
    ) {
      if (!paymentAlreadyRecorded) {
        const refund = await refundUnexpectedPayment(
          paymentIntentId,
          session.id
        );

        return NextResponse.json(
          {
            error: refund.ok
              ? "La solicitud cambió antes de finalizar el pago. Stripe reembolsó automáticamente el cobro."
              : "La solicitud cambió antes de finalizar el pago y el reembolso automático falló. Requiere revisión administrativa.",
            refunded: refund.ok,
            refundId: refund.refundId,
          },
          { status: refund.ok ? 409 : 500 }
        );
      }

      return NextResponse.json(
        {
          error:
            "El pago ya está registrado, pero el estado actual del trabajo requiere revisión administrativa.",
        },
        { status: 409 }
      );
    }

    // Primero reclamamos la solicitud de forma condicional. Así dos
    // checkouts pagados al mismo tiempo no pueden contratar dos Pros.
    if (canClaimOpenRequest) {
      let claimQuery = supabaseAdmin
        .from("service_requests")
        .update({
          status: "in_progress",
          preferred_provider_id: offer.professional_id,
        })
        .eq("id", requestId)
        .eq("status", "open");

      claimQuery = serviceRequest.preferred_provider_id
        ? claimQuery.eq(
            "preferred_provider_id",
            offer.professional_id
          )
        : claimQuery.is("preferred_provider_id", null);

      const { data: claimedRequest, error: claimError } =
        await claimQuery
          .select("id")
          .maybeSingle();

      if (claimError) {
        return NextResponse.json(
          {
            error: "El pago fue confirmado, pero no pudimos reservar el trabajo automáticamente.",
          },
          { status: 500 }
        );
      }

      if (!claimedRequest) {
        const { data: currentRequest } = await supabaseAdmin
          .from("service_requests")
          .select("status, preferred_provider_id")
          .eq("id", requestId)
          .maybeSingle();

        const anotherRetryWon =
          currentRequest?.preferred_provider_id ===
          offer.professional_id;

        if (!anotherRetryWon) {
          const refund = await refundUnexpectedPayment(
            paymentIntentId,
            session.id
          );

          return NextResponse.json(
            {
              error: refund.ok
                ? "Otra contratación se confirmó antes. El cobro de esta sesión fue reembolsado automáticamente."
                : "Otra contratación se confirmó antes y el reembolso automático falló. Requiere revisión administrativa.",
              refunded: refund.ok,
              refundId: refund.refundId,
            },
            { status: refund.ok ? 409 : 500 }
          );
        }
      }
    }

    // Estas dos operaciones son recuperables: si una falla después de
    // reservar la solicitud, el webhook de Stripe volverá a intentarlas.
    const { error: selectedOfferError } = await supabaseAdmin
      .from("offers")
      .update({ status: "selected" })
      .eq("id", offerId)
      .in("status", ["pending", "selected"]);

    if (selectedOfferError) {
      return NextResponse.json(
        {
          error: "El pago fue confirmado, pero no pudimos seleccionar el presupuesto automáticamente.",
        },
        { status: 500 }
      );
    }

    const { error: rejectedOffersError } = await supabaseAdmin
      .from("offers")
      .update({ status: "rejected" })
      .eq("request_id", requestId)
      .eq("status", "pending")
      .neq("id", offerId);

    if (rejectedOffersError) {
      console.warn(
        "RELYDO: no pudimos rechazar todas las ofertas restantes; el webhook volverá a intentarlo:",
        rejectedOffersError
      );
    }

    const stripeCustomerId =
      typeof session.customer === "string"
        ? session.customer
        : null;

    const paymentData = {
      request_id: requestId,
      offer_id: offerId,
      customer_id: serviceRequest.customer_id,
      provider_id: offer.professional_id,
      job_amount: jobAmount,
      customer_fee_percent: customerFeePercent,
      customer_fee_amount: customerFeeAmount,
      customer_total_amount: customerTotalAmount,
      provider_commission_percent:
        providerCommissionPercent,
      provider_commission_amount:
        providerCommissionAmount,
      provider_net_amount: providerNetAmount,
      platform_revenue_amount: platformRevenueAmount,
      currency,
      status: "ready_for_payout",
      payment_provider: "stripe",
      provider_payment_id: paymentIntentId,
      provider_customer_id: stripeCustomerId,
      refunded_amount: 0,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let paymentCreatedNow = false;

    if (!existingPayment) {
      const { error: insertPaymentError } = await supabaseAdmin
        .from("payments")
        .insert(paymentData);

      if (insertPaymentError) {
        if (insertPaymentError.code !== "23505") {
          return NextResponse.json(
            {
              error: "El pago fue confirmado, pero no pudimos registrar el pago automáticamente.",
            },
            { status: 500 }
          );
        }

        const { data: concurrentPayment, error: concurrentError } =
          await supabaseAdmin
            .from("payments")
            .select("id, provider_payment_id")
            .eq("offer_id", offerId)
            .maybeSingle();

        if (concurrentError || !concurrentPayment) {
          return NextResponse.json(
            {
              error:
                "Se detectó un pago concurrente y no pudimos verificarlo con seguridad.",
            },
            { status: 500 }
          );
        }

        if (
          concurrentPayment.provider_payment_id &&
          concurrentPayment.provider_payment_id !== paymentIntentId
        ) {
          const refund = await refundUnexpectedPayment(
            paymentIntentId,
            session.id
          );

          return NextResponse.json(
            {
              error: refund.ok
                ? "Se detectó un segundo cobro y fue reembolsado automáticamente."
                : "Se detectó un segundo cobro y el reembolso automático falló. Requiere revisión administrativa.",
              refunded: refund.ok,
              refundId: refund.refundId,
            },
            { status: refund.ok ? 409 : 500 }
          );
        }
      } else {
        paymentCreatedNow = true;
      }
    } else if (!paymentAlreadyRecorded) {
      const { error: updatePaymentError } = await supabaseAdmin
        .from("payments")
        .update(paymentData)
        .eq("id", existingPayment.id)
        .or(
          `provider_payment_id.is.null,provider_payment_id.eq.${paymentIntentId}`
        );

      if (updatePaymentError) {
        return NextResponse.json(
          {
            error: "El pago fue confirmado, pero no pudimos actualizar el registro del pago automáticamente.",
          },
          { status: 500 }
        );
      }

      paymentCreatedNow = true;
    }

    if (paymentCreatedNow) {
      try {
        await sendRelydoNotification({
          userId: offer.professional_id,
          type: "provider_hired",
          title: "¡Has sido contratado!",
          titleEn: "You have been hired!",
          message: `${
            serviceRequest.title || "Trabajo RELYDO"
          }: el cliente confirmó el pago y te contrató para realizar este trabajo.`,
          messageEn: `${
            serviceRequest.title || "RELYDO job"
          }: the customer confirmed payment and hired you for this job.`,
          requestId,
          url: `/trabajos/${requestId}`,
        });
      } catch (notificationError) {
        console.warn(
          "El pago quedó confirmado, pero no pudimos notificar al profesional:",
          notificationError
        );
      }
    }

    return NextResponse.json({
      success: true,
      paymentConfirmed: true,
      alreadyProcessed: paymentAlreadyRecorded,
      fundsReleasedToProvider: false,
      requestId,
      offerId,
      professionalId: offer.professional_id,
      paymentStatus: session.payment_status,
      amounts: {
        jobAmount,
        customerFeeAmount,
        customerTotalAmount,
        providerCommissionAmount,
        providerNetAmount,
        platformRevenueAmount,
      },
    });
  } catch (error) {
    console.error("Error verificando pago:", error);

    return NextResponse.json(
      {
        error:
          "No se pudo verificar el pago.",
      },
      { status: 500 }
    );
  }
}
