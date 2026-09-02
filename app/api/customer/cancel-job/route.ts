import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { sendRelydoNotification } from "../../../lib/serverNotifications";

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

function dinero(valor: unknown) {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return NaN;
  }

  return Math.round(
    (numero + Number.EPSILON) * 100
  ) / 100;
}

export async function POST(
  request: NextRequest
) {
  try {
    // ======================================================
    // 1. VERIFICAR SESIÓN DEL CLIENTE
    // ======================================================

    const authorization =
      request.headers.get(
        "authorization"
      );

    if (
      !authorization?.startsWith(
        "Bearer "
      )
    ) {
      return NextResponse.json(
        {
          error:
            "No estás autenticado.",
        },
        { status: 401 }
      );
    }

    const accessToken =
      authorization
        .replace(
          "Bearer ",
          ""
        )
        .trim();

    const {
      data: {
        user,
      },
      error:
        userError,
    } =
      await supabaseAdmin.auth.getUser(
        accessToken
      );

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          error:
            "No pudimos verificar tu sesión.",
        },
        { status: 401 }
      );
    }

    // Cliente autenticado para ejecutar el RPC cancel_job
    // conservando auth.uid().
    const supabaseUser =
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          global: {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },
          },
          auth: {
            persistSession:
              false,
            autoRefreshToken:
              false,
          },
        }
      );

    // ======================================================
    // 2. DATOS DE LA CANCELACIÓN
    // ======================================================

    const body =
      await request.json();

    const requestId =
      String(
        body.requestId ||
        ""
      ).trim();

    const reason =
      String(
        body.reason ||
        ""
      ).trim();

    if (!requestId) {
      return NextResponse.json(
        {
          error:
            "Falta el ID de la solicitud.",
        },
        { status: 400 }
      );
    }

    if (!reason) {
      return NextResponse.json(
        {
          error:
            "Debes indicar el motivo de la cancelación.",
        },
        { status: 400 }
      );
    }

    // ======================================================
    // 3. BUSCAR EL TRABAJO REAL
    // ======================================================

    const {
      data:
        serviceRequest,
      error:
        requestError,
    } =
      await supabaseAdmin
        .from(
          "service_requests"
        )
        .select(`
          id,
          title,
          customer_id,
          status,
          job_stage,
          preferred_provider_id,
          cancellation_reason,
          cancelled_at
        `)
        .eq(
          "id",
          requestId
        )
        .maybeSingle();

    if (requestError) {
      return NextResponse.json(
        {
          error:
            "No pudimos consultar la solicitud.",
        },
        { status: 500 }
      );
    }

    if (!serviceRequest) {
      return NextResponse.json(
        {
          error:
            "No encontramos esta solicitud.",
        },
        { status: 404 }
      );
    }

    if (
      serviceRequest.customer_id !==
      user.id
    ) {
      return NextResponse.json(
        {
          error:
            "No tienes permiso para cancelar esta solicitud.",
        },
        { status: 403 }
      );
    }

    if (
      serviceRequest.status ===
      "cancelled"
    ) {
      return NextResponse.json({
        success: true,
        alreadyCancelled: true,
        requestId,
        customerRefundAmount: 0,
        providerAwardAmount: 0,
        relydoCancellationAmount: 0,
      });
    }

    if (
      serviceRequest.status !==
        "open" &&
      serviceRequest.status !==
        "in_progress"
    ) {
      return NextResponse.json(
        {
          error:
            "Esta solicitud ya no puede cancelarse automáticamente.",
        },
        { status: 409 }
      );
    }

    if (
      serviceRequest.status ===
        "in_progress" &&
      serviceRequest.job_stage ===
        "working"
    ) {
      return NextResponse.json(
        {
          error:
            "El trabajo ya fue iniciado. No puede cancelarse automáticamente; debe gestionarse mediante un reclamo.",
        },
        { status: 409 }
      );
    }

    // ======================================================
    // 4. SOLICITUD ABIERTA SIN PAGO
    // ======================================================

    if (
      serviceRequest.status ===
      "open"
    ) {
      const {
        error:
          cancelError,
      } =
        await supabaseUser.rpc(
          "cancel_job",
          {
            p_request_id:
              requestId,
            p_reason:
              reason,
          }
        );

      if (cancelError) {
        return NextResponse.json(
          {
            error:
              "No se pudo cancelar la solicitud.",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        requestId,
        cancellationStage:
          "open",
        penaltyPercent: 0,
        penaltyAmount: 0,
        providerAwardAmount: 0,
        relydoCancellationAmount: 0,
        customerRefundAmount: 0,
      });
    }

    // ======================================================
    // 5. CONFIGURACIÓN ACTIVA DE CANCELACIONES
    // ======================================================

    const {
      data:
        settings,
      error:
        settingsError,
    } =
      await supabaseAdmin
        .from(
          "payment_settings"
        )
        .select(`
          id,
          customer_cancel_on_the_way_percent,
          customer_cancel_arrived_percent,
          cancellation_provider_percent,
          currency,
          active
        `)
        .eq(
          "active",
          true
        )
        .order(
          "created_at",
          {
            ascending:
              false,
          }
        )
        .limit(1)
        .maybeSingle();

    if (
      settingsError ||
      !settings
    ) {
      return NextResponse.json(
        {
          error:
            settingsError
              ? "No pudimos cargar la configuración de cancelaciones."
              : "No existe una configuración activa de cancelaciones.",
        },
        { status: 500 }
      );
    }

    // Política económica RELYDO:
    // - Pro contratado pero aún no salió: 5% RELYDO.
    // - En camino: 12.5% total = 5.5% Pro + 7% RELYDO.
    // - Llegó: 23.5% total = 12% Pro + 11.5% RELYDO.
    //
    // Estos porcentajes deben coincidir exactamente con el resumen
    // mostrado al cliente antes de confirmar la cancelación.
    let penaltyPercent = 0;
    let providerJobPercent = 0;
    let relydoStagePercent = 0;

    if (
      serviceRequest.status ===
        "in_progress" &&
      !serviceRequest.job_stage
    ) {
      penaltyPercent = 5;
      providerJobPercent = 0;
      relydoStagePercent = 5;
    }

    if (
      serviceRequest.job_stage ===
      "on_the_way"
    ) {
      penaltyPercent = 12.5;
      providerJobPercent = 5.5;
      relydoStagePercent = 7;
    }

    if (
      serviceRequest.job_stage ===
      "arrived"
    ) {
      penaltyPercent = 23.5;
      providerJobPercent = 12;
      relydoStagePercent = 11.5;
    }

    if (
      !Number.isFinite(
        penaltyPercent
      ) ||
      penaltyPercent < 0 ||
      penaltyPercent > 100 ||
      !Number.isFinite(
        providerJobPercent
      ) ||
      providerJobPercent < 0 ||
      providerJobPercent > 100 ||
      !Number.isFinite(
        relydoStagePercent
      ) ||
      relydoStagePercent < 0 ||
      relydoStagePercent > 100
    ) {
      return NextResponse.json(
        {
          error:
            "La configuración de cancelaciones no es válida.",
        },
        { status: 500 }
      );
    }

    // ======================================================
    // 6. BUSCAR EL PAGO REAL
    // ======================================================

    const {
      data:
        payment,
      error:
        paymentError,
    } =
      await supabaseAdmin
        .from(
          "payments"
        )
        .select(`
          id,
          request_id,
          offer_id,
          customer_id,
          provider_id,
          job_amount,
          customer_fee_amount,
          customer_total_amount,
          refunded_amount,
          currency,
          status,
          payment_provider,
          provider_payment_id
        `)
        .eq(
          "request_id",
          requestId
        )
        .eq(
          "customer_id",
          user.id
        )
        .order(
          "updated_at",
          {
            ascending:
              false,
          }
        )
        .limit(1)
        .maybeSingle();

    if (paymentError) {
      return NextResponse.json(
        {
          error:
            "No pudimos consultar el pago.",
        },
        { status: 500 }
      );
    }

    if (!payment) {
      return NextResponse.json(
        {
          error:
            "No encontramos el pago de este trabajo. No se realizará ninguna cancelación económica.",
        },
        { status: 404 }
      );
    }

    if (
      payment.provider_id !==
      serviceRequest.preferred_provider_id
    ) {
      return NextResponse.json(
        {
          error:
            "El pago no coincide con el profesional asignado al trabajo.",
        },
        { status: 409 }
      );
    }

    if (
      payment.payment_provider !==
      "stripe"
    ) {
      return NextResponse.json(
        {
          error:
            "Este pago no pertenece a Stripe.",
        },
        { status: 400 }
      );
    }

    if (
      !payment.provider_payment_id
    ) {
      return NextResponse.json(
        {
          error:
            "No encontramos el PaymentIntent original.",
        },
        { status: 400 }
      );
    }

    const jobAmount =
      dinero(
        payment.job_amount
      );

    const customerTotal =
      dinero(
        payment.customer_total_amount
      );

    if (
      !Number.isFinite(
        jobAmount
      ) ||
      jobAmount <= 0 ||
      !Number.isFinite(
        customerTotal
      ) ||
      customerTotal <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "Los importes guardados del pago no son válidos.",
        },
        { status: 400 }
      );
    }

    // ======================================================
    // 7. CALCULAR DISTRIBUCIÓN
    // ======================================================

    const serviceFeeAmount =
      dinero(
        payment.customer_fee_amount ??
          Math.max(
            0,
            customerTotal -
              jobAmount
          )
      );

    const penaltyAmount =
      dinero(
        jobAmount *
          (
            penaltyPercent /
            100
          )
      );

    const providerAwardAmount =
      dinero(
        jobAmount *
          (
            providerJobPercent /
            100
          )
      );

    const relydoStageAmount =
      dinero(
        jobAmount *
          (
            relydoStagePercent /
            100
          )
      );

    // RELYDO conserva el service fee original más su parte
    // correspondiente del cargo de cancelación.
    const relydoCancellationAmount =
      dinero(
        serviceFeeAmount +
          relydoStageAmount
      );

    // IMPORTANTE:
    // El service fee ya está fuera de jobAmount, por lo que el
    // reembolso sale del precio del trabajo y nunca del total
    // cobrado al cliente.
    //
    // Ejemplo:
    // trabajo $50 + service fee $2.50 = total $52.50
    // cancelación antes de salir: 5% de $50 = $2.50
    // reembolso Stripe = $50 - $2.50 = $47.50
    const customerRefundAmount =
      dinero(
        Math.max(
          0,
          jobAmount -
            penaltyAmount
        )
      );

    if (
      !Number.isFinite(
        serviceFeeAmount
      ) ||
      serviceFeeAmount < 0 ||
      !Number.isFinite(
        penaltyAmount
      ) ||
      !Number.isFinite(
        providerAwardAmount
      ) ||
      !Number.isFinite(
        relydoStageAmount
      ) ||
      !Number.isFinite(
        relydoCancellationAmount
      ) ||
      !Number.isFinite(
        customerRefundAmount
      )
    ) {
      return NextResponse.json(
        {
          error:
            "No pudimos calcular correctamente la cancelación.",
        },
        { status: 500 }
      );
    }

    // ======================================================
    // 8. COMPROBAR TRANSFERENCIAS EXISTENTES
    // ======================================================

    const transferGroup =
      `relydo_request_${requestId}`;

    const existingTransfers =
      await stripe.transfers.list({
        transfer_group:
          transferGroup,
        limit: 100,
      });

    const activeTransfers =
      existingTransfers.data.filter(
        (transfer) =>
          transfer.amount >
          transfer.amount_reversed
      );

    const activeTransferredCents =
      activeTransfers.reduce(
        (
          total,
          transfer
        ) =>
          total +
          (
            transfer.amount -
            transfer.amount_reversed
          ),
        0
      );

    const expectedProviderCents =
      Math.round(
        providerAwardAmount *
          100
      );

    if (
      activeTransferredCents > 0 &&
      activeTransferredCents !==
        expectedProviderCents
    ) {
      return NextResponse.json(
        {
          error:
            "Ya existe una transferencia diferente para este trabajo. No se hará una distribución automática para evitar duplicar dinero.",
        },
        { status: 409 }
      );
    }

    // ======================================================
    // 9. PREVALIDAR STRIPE CONNECT DEL PROFESIONAL
    // ======================================================

    let providerAccountId:
      string | null =
      null;

    let chargeId:
      string | null =
      null;

    if (
      providerAwardAmount >
      0
    ) {
      const {
        data:
          providerProfile,
        error:
          providerProfileError,
      } =
        await supabaseAdmin
          .from(
            "provider_profiles"
          )
          .select(`
            user_id,
            stripe_account_id
          `)
          .eq(
            "user_id",
            payment.provider_id
          )
          .maybeSingle();

      if (
        providerProfileError
      ) {
        return NextResponse.json(
          {
            error:
              "No pudimos consultar la configuración de pagos del profesional.",
          },
          { status: 500 }
        );
      }

      if (
        !providerProfile?.stripe_account_id
      ) {
        return NextResponse.json(
          {
            error:
              "El profesional no tiene Stripe Connect configurado. No se procesó la cancelación.",
          },
          { status: 400 }
        );
      }

      const account =
        await stripe.accounts.retrieve(
          providerProfile.stripe_account_id
        );

      if (
        account.capabilities
          ?.transfers !==
        "active"
      ) {
        return NextResponse.json(
          {
            error:
              "La cuenta Stripe del profesional no puede recibir la compensación de cancelación.",
          },
          { status: 400 }
        );
      }

      providerAccountId =
        providerProfile.stripe_account_id;

      const paymentIntent =
        await stripe.paymentIntents.retrieve(
          payment.provider_payment_id,
          {
            expand: [
              "latest_charge",
            ],
          }
        );

      const latestCharge =
        paymentIntent.latest_charge;

      chargeId =
        typeof latestCharge ===
        "string"
          ? latestCharge
          : latestCharge?.id ||
            null;

      if (!chargeId) {
        return NextResponse.json(
          {
            error:
              "No encontramos el cargo original de Stripe.",
          },
          { status: 500 }
        );
      }
    }

    // ======================================================
    // 10. COMPENSAR AL PROFESIONAL
    //
    // Se hace primero. Si luego el reembolso falla,
    // la clave de idempotencia evita duplicar la
    // transferencia cuando el cliente reintente.
    // ======================================================

    let stripeTransferId:
      string | null =
      activeTransfers[0]
        ?.id ||
      null;

    if (
      providerAwardAmount >
        0 &&
      !stripeTransferId &&
      providerAccountId &&
      chargeId
    ) {
      const transfer =
        await stripe.transfers.create(
          {
            amount:
              expectedProviderCents,
            currency: (
              payment.currency ||
              settings.currency ||
              "usd"
            ).toLowerCase(),
            destination:
              providerAccountId,
            source_transaction:
              chargeId,
            transfer_group:
              transferGroup,
            metadata: {
              request_id:
                String(
                  requestId
                ),
              payment_id:
                String(
                  payment.id
                ),
              professional_id:
                String(
                  payment.provider_id
                ),
              cancellation_stage:
                String(
                  serviceRequest.job_stage ||
                  "contracted"
                ),
              cancellation_penalty_percent:
                penaltyPercent.toFixed(
                  2
                ),
              cancellation_provider_percent:
                providerJobPercent.toFixed(
                  2
                ),
              cancellation_provider_amount:
                providerAwardAmount.toFixed(
                  2
                ),
            },
          },
          {
            idempotencyKey:
              `relydo_customer_cancel_transfer_${payment.id}_${expectedProviderCents}`,
          }
        );

      stripeTransferId =
        transfer.id;
    }

    // ======================================================
    // 11. REEMBOLSAR AL CLIENTE
    // ======================================================

    const previousRefunded =
      dinero(
        payment.refunded_amount ||
        0
      );

    if (
      !Number.isFinite(
        previousRefunded
      ) ||
      previousRefunded < 0
    ) {
      return NextResponse.json(
        {
          error:
            "El importe de reembolso previo no es válido.",
        },
        { status: 409 }
      );
    }

    if (
      previousRefunded >
      customerRefundAmount
    ) {
      return NextResponse.json(
        {
          error:
            "Este pago ya tiene un reembolso superior al calculado para esta cancelación. No se hará otro reembolso automáticamente.",
        },
        { status: 409 }
      );
    }

    const refundRemaining =
      dinero(
        customerRefundAmount -
          previousRefunded
      );

    let stripeRefundId:
      string | null =
      null;

    let refundStatus:
      string | null =
      null;

    if (
      refundRemaining >
      0
    ) {
      const refund =
        await stripe.refunds.create(
          {
            payment_intent:
              payment.provider_payment_id,
            amount:
              Math.round(
                refundRemaining *
                  100
              ),
            reason:
              "requested_by_customer",
            metadata: {
              request_id:
                String(
                  requestId
                ),
              payment_id:
                String(
                  payment.id
                ),
              cancellation_stage:
                String(
                  serviceRequest.job_stage ||
                  "contracted"
                ),
              cancellation_penalty_percent:
                penaltyPercent.toFixed(
                  2
                ),
              customer_refund_amount:
                customerRefundAmount.toFixed(
                  2
                ),
            },
          },
          {
            idempotencyKey:
              `relydo_customer_cancel_refund_${payment.id}_${Math.round(
                customerRefundAmount *
                  100
              )}`,
          }
        );

      stripeRefundId =
        refund.id;

      refundStatus =
        refund.status;
    }

    // ======================================================
    // 12. CANCELAR LA SOLICITUD EN SUPABASE
    //
    // La orden se cierra antes de marcar payments como
    // cancelled. De esta forma Cliente, Pro y Admin dejan de
    // verla como activa aunque una escritura posterior falle.
    //
    // Las operaciones de Stripe anteriores son idempotentes,
    // por lo que un reintento no duplica transferencia/refund.
    // ======================================================

    const {
      error:
        cancelError,
    } =
      await supabaseUser.rpc(
        "cancel_job",
        {
          p_request_id:
            requestId,
          p_reason:
            reason,
        }
      );

    if (cancelError) {
      return NextResponse.json(
        {
          error:
            "Stripe procesó la distribución, pero RELYDO no pudo marcar la solicitud como cancelada. Las operaciones económicas están protegidas contra duplicados; revisa el estado antes de reintentar.",
          stripeTransferId,
          stripeRefundId,
        },
        { status: 500 }
      );
    }

    // ======================================================
    // 13. GUARDAR RESULTADO ECONÓMICO
    // ======================================================

    const now =
      new Date().toISOString();

    const {
      error:
        updatePaymentError,
    } =
      await supabaseAdmin
        .from(
          "payments"
        )
        .update({
          status:
            "cancelled",
          refunded_amount:
            customerRefundAmount,
          cancellation_stage:
            serviceRequest.job_stage ||
            "contracted",
          cancellation_penalty_percent:
            penaltyPercent,
          cancellation_penalty_amount:
            penaltyAmount,
          cancellation_provider_amount:
            providerAwardAmount,
          cancellation_platform_amount:
            relydoCancellationAmount,
          cancellation_processed_at:
            now,
          updated_at:
            now,
        })
        .eq(
          "id",
          payment.id
        );

    if (
      updatePaymentError
    ) {
      return NextResponse.json(
        {
          error:
            "La solicitud ya quedó cancelada y Stripe procesó la distribución, pero RELYDO no pudo actualizar payments. No repitas manualmente la operación.",
          requestCancelled: true,
          stripeTransferId,
          stripeRefundId,
        },
        { status: 500 }
      );
    }

    if (
      serviceRequest.preferred_provider_id
    ) {
      try {
        await sendRelydoNotification({
          userId:
            serviceRequest.preferred_provider_id,
          type:
            "job_cancelled_by_customer",
          title: "Trabajo cancelado por el cliente",
          titleEn: "Job cancelled by the customer",
          message: `${serviceRequest.title || "Trabajo RELYDO"}: el cliente canceló el trabajo.${
            providerAwardAmount > 0
              ? ` Compensación por cancelación: $${providerAwardAmount.toFixed(2)}.`
              : ""
          }`,
          messageEn: `${serviceRequest.title || "RELYDO job"}: the customer cancelled the job.${
            providerAwardAmount > 0
              ? ` Cancellation compensation: $${providerAwardAmount.toFixed(2)}.`
              : ""
          }`,
          requestId,
          url:
            `/trabajos/${requestId}`,
        });
      } catch (
        notificationError
      ) {
        console.warn(
          "La cancelación se completó, pero no pudimos notificar al profesional:",
          notificationError
        );
      }
    }

    return NextResponse.json({
      success: true,
      requestId,
      cancellationStage:
        serviceRequest.job_stage ||
        "contracted",
      penaltyPercent,
      penaltyAmount,
      providerAwardAmount,
      relydoCancellationAmount,
      customerRefundAmount,
      stripeTransferId,
      stripeRefundId,
      refundStatus,
    });
  } catch (error) {
    console.error(
      "Error procesando cancelación del cliente:",
      error
    );

    return NextResponse.json(
      {
        error: "No se pudo procesar la cancelación.",
      },
      { status: 500 }
    );
  }
}