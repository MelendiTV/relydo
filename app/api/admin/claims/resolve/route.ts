import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { sendRelydoNotification } from "../../../../lib/serverNotifications";
import { hasAdminPermission, isAdminRole } from "../../../../lib/adminPermissions";

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


type ResolutionAction =
  | "pay_provider"
  | "refund_customer"
  | "partial";

function dinero(valor: unknown) {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return NaN;
  }

  return Math.round((numero + Number.EPSILON) * 100) / 100;
}

export async function POST(request: NextRequest) {
  try {
    // ======================================================
    // 1. VERIFICAR ADMIN
    // ======================================================

    const authorization =
      request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "No estás autenticado." },
        { status: 401 }
      );
    }

    const accessToken =
      authorization.replace("Bearer ", "").trim();

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (userError || !user?.email) {
      return NextResponse.json(
        { error: "No pudimos verificar tu sesión." },
        { status: 401 }
      );
    }

    const { data: adminProfile, error: adminProfileError } = await supabaseAdmin
      .from("profiles")
      .select("role, admin_role")
      .eq("id", user.id)
      .maybeSingle();

    if (
      adminProfileError ||
      !adminProfile ||
      adminProfile.role !== "admin" ||
      !isAdminRole(adminProfile.admin_role) ||
      !hasAdminPermission(adminProfile.admin_role, "claims")
    ) {
      return NextResponse.json(
        { error: "No tienes permiso para resolver reclamos." },
        { status: 403 }
      );
    }

    // ======================================================
    // 2. LEER DECISIÓN
    // ======================================================

    const body = await request.json();

    const claimId =
      String(body.claimId || "").trim();

    const action =
      String(body.action || "").trim() as ResolutionAction;

    const notes =
      String(body.notes || "").trim();

    const providerAwardAmount =
      dinero(body.providerAwardAmount);

    const customerRefundAmount =
      dinero(body.customerRefundAmount);

    const overrideResponseWindow =
      body.overrideResponseWindow === true;

    if (!claimId) {
      return NextResponse.json(
        { error: "Falta el ID del reclamo." },
        { status: 400 }
      );
    }

    if (
      action !== "pay_provider" &&
      action !== "refund_customer" &&
      action !== "partial"
    ) {
      return NextResponse.json(
        { error: "La decisión del reclamo no es válida." },
        { status: 400 }
      );
    }

    if (!notes) {
      return NextResponse.json(
        {
          error:
            "Debes escribir una nota explicando la resolución.",
        },
        { status: 400 }
      );
    }

    // ======================================================
    // 3. BUSCAR RECLAMO
    // ======================================================

    const {
      data: claim,
      error: claimError,
    } = await supabaseAdmin
      .from("job_claims")
      .select(`
        id,
        request_id,
        customer_id,
        provider_id,
        status,
        provider_response,
        provider_response_deadline,
        provider_responded_at,
        resolution_type,
        provider_award_amount,
        customer_refund_amount
      `)
      .eq("id", claimId)
      .maybeSingle();

    if (claimError) {
      return NextResponse.json(
        {
          error:
            `No pudimos consultar el reclamo: ${claimError.message}`,
        },
        { status: 500 }
      );
    }

    if (!claim) {
      return NextResponse.json(
        { error: "No encontramos este reclamo." },
        { status: 404 }
      );
    }

    if (claim.status !== "reviewing") {
      return NextResponse.json(
        {
          error:
            claim.status === "open"
              ? "Primero debes pasar el reclamo a En revisión antes de tomar una decisión económica."
              : "Este reclamo ya fue cerrado.",
        },
        { status: 409 }
      );
    }

    // ======================================================
    // 3B. PLAZO DEL PROFESIONAL + OVERRIDE DEL ADMIN
    // ======================================================

    const providerResponded =
      Boolean(
        claim.provider_response?.trim()
      ) ||
      Boolean(
        claim.provider_responded_at
      );

    if (!providerResponded) {
      let plazoVigente =
        false;

      let deadlineValido =
        false;

      if (
        claim.provider_response_deadline
      ) {
        const deadlineMs =
          new Date(
            claim.provider_response_deadline
          ).getTime();

        deadlineValido =
          Number.isFinite(
            deadlineMs
          );

        if (
          deadlineValido
        ) {
          plazoVigente =
            Date.now() <
            deadlineMs;
        }
      }

      const requiereOverride =
        !deadlineValido ||
        plazoVigente;

      if (
        requiereOverride &&
        !overrideResponseWindow
      ) {
        return NextResponse.json(
          {
            error:
              plazoVigente
                ? "El profesional todavía está dentro de su plazo de 24 horas para responder. El administrador debe confirmar expresamente que desea resolver antes."
                : "No pudimos validar el plazo de respuesta del profesional. El administrador debe confirmar expresamente que desea resolver de todos modos.",
            requiresAdminOverride:
              true,
            providerResponseDeadline:
              claim.provider_response_deadline,
          },
          { status: 409 }
        );
      }
    }

    // ======================================================
    // 4. VALIDAR TRABAJO
    // ======================================================

    const {
      data: serviceRequest,
      error: requestError,
    } = await supabaseAdmin
      .from("service_requests")
      .select(`
        id,
        title,
        status,
        job_stage,
        customer_id,
        preferred_provider_id
      `)
      .eq("id", claim.request_id)
      .maybeSingle();

    if (requestError) {
      return NextResponse.json(
        {
          error:
            `No pudimos consultar el trabajo: ${requestError.message}`,
        },
        { status: 500 }
      );
    }

    if (!serviceRequest) {
      return NextResponse.json(
        {
          error:
            "No encontramos el trabajo relacionado.",
        },
        { status: 404 }
      );
    }

    const trabajoCompletado =
      serviceRequest.status ===
      "completed";

    const trabajoIniciado =
      serviceRequest.status ===
        "in_progress" &&
      serviceRequest.job_stage ===
        "working";

    if (
      !trabajoCompletado &&
      !trabajoIniciado
    ) {
      return NextResponse.json(
        {
          error:
            "Este reclamo solo puede resolverse cuando el trabajo está completado o cuando ya fue iniciado.",
        },
        { status: 400 }
      );
    }

    if (
      serviceRequest.customer_id !== claim.customer_id ||
      serviceRequest.preferred_provider_id !== claim.provider_id
    ) {
      return NextResponse.json(
        {
          error:
            "Los participantes del reclamo no coinciden con el trabajo.",
        },
        { status: 409 }
      );
    }

    // ======================================================
    // 5. BUSCAR PAGO
    // ======================================================

    const {
      data: payment,
      error: paymentError,
    } = await supabaseAdmin
      .from("payments")
      .select(`
        id,
        request_id,
        offer_id,
        customer_id,
        provider_id,
        customer_total_amount,
        provider_net_amount,
        refunded_amount,
        currency,
        payment_provider,
        provider_payment_id
      `)
      .eq("request_id", claim.request_id)
      .eq("customer_id", claim.customer_id)
      .eq("provider_id", claim.provider_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentError) {
      return NextResponse.json(
        {
          error:
            `No pudimos consultar el pago: ${paymentError.message}`,
        },
        { status: 500 }
      );
    }

    if (!payment) {
      return NextResponse.json(
        {
          error:
            "No encontramos el pago relacionado con este reclamo.",
        },
        { status: 404 }
      );
    }

    if (payment.payment_provider !== "stripe") {
      return NextResponse.json(
        { error: "Este pago no pertenece a Stripe." },
        { status: 400 }
      );
    }

    if (!payment.provider_payment_id) {
      return NextResponse.json(
        {
          error:
            "No encontramos el PaymentIntent original.",
        },
        { status: 400 }
      );
    }

    const customerTotal =
      dinero(payment.customer_total_amount);

    const providerNet =
      dinero(payment.provider_net_amount);

    if (
      !Number.isFinite(customerTotal) ||
      customerTotal <= 0 ||
      !Number.isFinite(providerNet) ||
      providerNet <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "Los importes guardados del trabajo no son válidos.",
        },
        { status: 400 }
      );
    }

    const transferGroup =
      `relydo_request_${claim.request_id}`;

    // ======================================================
    // 6. COMPROBAR TRANSFERENCIAS EXISTENTES
    // ======================================================

    const existingTransfers =
      await stripe.transfers.list({
        transfer_group: transferGroup,
        limit: 100,
      });

    const activeTransfers =
      existingTransfers.data.filter(
        (transfer) =>
          transfer.amount > transfer.amount_reversed
      );

    const activeTransferredCents =
      activeTransfers.reduce(
        (total, transfer) =>
          total +
          (transfer.amount - transfer.amount_reversed),
        0
      );

    // ======================================================
    // 7A. PAGAR TODO EL NETO AL PROFESIONAL
    // ======================================================

    if (action === "pay_provider") {
      // ====================================================
      // TRABAJO TODAVÍA INICIADO:
      // Admin falla a favor del profesional, pero NO se paga
      // todavía. Se cierra el reclamo y el trabajo continúa.
      // El pago normal se liberará cuando el profesional
      // complete el trabajo siguiendo el flujo habitual.
      // ====================================================

      if (trabajoIniciado) {
        const {
          error: updateClaimError,
        } = await supabaseAdmin
          .from("job_claims")
          .update({
            status: "resolved",
            resolution_type:
              "pay_provider",
            provider_award_amount:
              0,
            customer_refund_amount:
              0,
            resolution_notes:
              `[A FAVOR DEL PROFESIONAL - CONTINUAR TRABAJO]\n${notes}`,
            resolved_at:
              new Date().toISOString(),
            resolved_by:
              user.id,
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            claim.id
          );

        if (
          updateClaimError
        ) {
          return NextResponse.json(
            {
              error:
                `No pudimos cerrar el reclamo: ${updateClaimError.message}`,
            },
            { status: 500 }
          );
        }

        try {
          await Promise.allSettled([
            sendRelydoNotification({
              userId: claim.customer_id,
              type: "claim_resolved",
              title: "Reclamo resuelto",
              titleEn: "Claim resolved",
              message: `RELYDO resolvió el reclamo a favor del profesional. El trabajo continuará. ${serviceRequest.title || "Trabajo RELYDO"}.`,
              messageEn: `RELYDO resolved the claim in favor of the professional. The job will continue. ${serviceRequest.title || "RELYDO job"}.`,
              requestId: claim.request_id,
              url: `/mis-solicitudes/${claim.request_id}`,
            }),
            sendRelydoNotification({
              userId: claim.provider_id,
              type: "claim_resolved",
              title: "Reclamo resuelto",
              titleEn: "Claim resolved",
              message: `RELYDO resolvió el reclamo a tu favor. El trabajo fue desbloqueado y puedes continuar. ${serviceRequest.title || "Trabajo RELYDO"}.`,
              messageEn: `RELYDO resolved the claim in your favor. The job was unlocked and you may continue. ${serviceRequest.title || "RELYDO job"}.`,
              requestId: claim.request_id,
              url: `/trabajos/${claim.request_id}`,
            }),
          ]);
        } catch (notificationError) {
          console.warn(
            "El reclamo fue resuelto, pero falló el envío de notificaciones:",
            notificationError
          );
        }

        return NextResponse.json({
          success: true,
          action:
            "pay_provider",
          workUnlocked:
            true,
          paymentReleased:
            false,
          providerAwardAmount:
            0,
          customerRefundAmount:
            0,
          message:
            "Reclamo resuelto a favor del profesional. El trabajo fue desbloqueado y puede continuar. El pago todavía no fue liberado.",
        });
      }

      const alreadyRefunded =
        dinero(payment.refunded_amount || 0);

      if (
        Number.isFinite(alreadyRefunded) &&
        alreadyRefunded > 0
      ) {
        return NextResponse.json(
          {
            error:
              "Este pago ya tiene un reembolso registrado y no puede resolverse con pago completo al profesional.",
          },
          { status: 409 }
        );
      }

      const expectedCents =
        Math.round(providerNet * 100);

      if (
        activeTransferredCents > 0 &&
        activeTransferredCents !== expectedCents
      ) {
        return NextResponse.json(
          {
            error:
              "Ya existe una transferencia parcial o diferente para este trabajo. Usa una resolución parcial.",
          },
          { status: 409 }
        );
      }

      const {
        data: providerProfile,
        error: providerProfileError,
      } = await supabaseAdmin
        .from("provider_profiles")
        .select(`
          user_id,
          stripe_account_id
        `)
        .eq("user_id", claim.provider_id)
        .maybeSingle();

      if (providerProfileError) {
        return NextResponse.json(
          {
            error:
              `No pudimos consultar Stripe Connect: ${providerProfileError.message}`,
          },
          { status: 500 }
        );
      }

      if (!providerProfile?.stripe_account_id) {
        return NextResponse.json(
          {
            error:
              "El profesional no tiene Stripe Connect configurado.",
          },
          { status: 400 }
        );
      }

      const account =
        await stripe.accounts.retrieve(
          providerProfile.stripe_account_id
        );

      if (
        account.capabilities?.transfers !== "active"
      ) {
        return NextResponse.json(
          {
            error:
              "La cuenta Stripe del profesional no puede recibir transferencias.",
          },
          { status: 400 }
        );
      }

      const paymentIntent =
        await stripe.paymentIntents.retrieve(
          payment.provider_payment_id,
          { expand: ["latest_charge"] }
        );

      const latestCharge =
        paymentIntent.latest_charge;

      const chargeId =
        typeof latestCharge === "string"
          ? latestCharge
          : latestCharge?.id;

      if (!chargeId) {
        return NextResponse.json(
          {
            error:
              "No encontramos el cargo original de Stripe.",
          },
          { status: 500 }
        );
      }

      let transferId =
        activeTransfers[0]?.id || null;

      if (!transferId) {
        const transfer =
          await stripe.transfers.create(
            {
              amount: expectedCents,
              currency: (
                payment.currency || "usd"
              ).toLowerCase(),
              destination:
                providerProfile.stripe_account_id,
              source_transaction: chargeId,
              transfer_group: transferGroup,
              metadata: {
                request_id: String(claim.request_id),
                payment_id: String(payment.id),
                claim_id: String(claim.id),
                professional_id:
                  String(claim.provider_id),
                resolution:
                  "pay_provider",
              },
            },
            {
              idempotencyKey:
                `relydo_release_payment_${payment.id}`,
            }
          );

        transferId = transfer.id;
      }

      const releasedAt =
        new Date().toISOString();

      const {
        error: updatePaymentError,
      } = await supabaseAdmin
        .from("payments")
        .update({
          status: "paid_out",
          stripe_transfer_id: transferId,
          released_at: releasedAt,
          last_release_error: null,
          updated_at: releasedAt,
        })
        .eq("id", payment.id);

      if (updatePaymentError) {
        return NextResponse.json(
          {
            error:
              "Stripe procesó la transferencia, pero RELYDO no pudo registrar el pago como liberado. No repitas la operación.",
            stripeTransferId: transferId,
          },
          { status: 500 }
        );
      }

      const {
        error: updateClaimError,
      } = await supabaseAdmin
        .from("job_claims")
        .update({
          status: "resolved",
          resolution_type: "pay_provider",
          provider_award_amount: providerNet,
          customer_refund_amount: 0,
          resolution_notes:
            `[PAGO AL PROFESIONAL]\n${notes}`,
          resolved_at:
            new Date().toISOString(),
          resolved_by: user.id,
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", claim.id);

      if (updateClaimError) {
        return NextResponse.json(
          {
            error:
              "El dinero fue procesado, pero no pudimos cerrar el reclamo. No repitas la operación.",
            stripeTransferId: transferId,
          },
          { status: 500 }
        );
      }

      try {
        await Promise.allSettled([
          sendRelydoNotification({
            userId: claim.customer_id,
            type: "claim_resolved",
            title: "Reclamo resuelto",
            titleEn: "Claim resolved",
            message: `RELYDO resolvió el reclamo a favor del profesional. ${serviceRequest.title || "Trabajo RELYDO"}.`,
            messageEn: `RELYDO resolved the claim in favor of the professional. ${serviceRequest.title || "RELYDO job"}.`,
            requestId: claim.request_id,
            url: `/mis-solicitudes/${claim.request_id}`,
          }),
          sendRelydoNotification({
            userId: claim.provider_id,
            type: "claim_resolved",
            title: "Reclamo resuelto",
            titleEn: "Claim resolved",
            message: `RELYDO resolvió el reclamo a tu favor. Se liberaron $${providerNet.toFixed(2)}. ${serviceRequest.title || "Trabajo RELYDO"}.`,
            messageEn: `RELYDO resolved the claim in your favor. $${providerNet.toFixed(2)} was released. ${serviceRequest.title || "RELYDO job"}.`,
            requestId: claim.request_id,
            url: `/trabajos/${claim.request_id}`,
          }),
        ]);
      } catch (notificationError) {
        console.warn(
          "El reclamo fue resuelto, pero falló el envío de notificaciones:",
          notificationError
        );
      }

      return NextResponse.json({
        success: true,
        action: "pay_provider",
        providerAwardAmount: providerNet,
        customerRefundAmount: 0,
        stripeTransferId: transferId,
      });
    }

    // ======================================================
    // 7B. REEMBOLSO TOTAL AL CLIENTE
    // ======================================================

    if (action === "refund_customer") {
      if (activeTransferredCents > 0) {
        return NextResponse.json(
          {
            error:
              "Ya existe dinero transferido al profesional. No haremos un reembolso total automático sin procesar antes una reversión.",
          },
          { status: 409 }
        );
      }

      const previousRefunded =
        dinero(payment.refunded_amount || 0);

      const remainingRefund =
        dinero(customerTotal - previousRefunded);

      if (
        !Number.isFinite(remainingRefund) ||
        remainingRefund <= 0
      ) {
        return NextResponse.json(
          {
            error:
              "Este pago ya está totalmente reembolsado.",
          },
          { status: 409 }
        );
      }

      const refund =
        await stripe.refunds.create(
          {
            payment_intent:
              payment.provider_payment_id,
            amount:
              Math.round(remainingRefund * 100),
            reason:
              "requested_by_customer",
            metadata: {
              request_id: String(claim.request_id),
              payment_id: String(payment.id),
              claim_id: String(claim.id),
              resolution:
                "refund_customer",
            },
          },
          {
            idempotencyKey:
              `relydo_claim_full_refund_${payment.id}`,
          }
        );

      const refundedAmount =
        dinero(refund.amount / 100);

      const totalRefunded =
        dinero(previousRefunded + refundedAmount);

      const {
        error: updatePaymentError,
      } = await supabaseAdmin
        .from("payments")
        .update({
          status: "refunded",
          refunded_amount: totalRefunded,
          refunded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id);

      if (updatePaymentError) {
        return NextResponse.json(
          {
            error:
              "Stripe hizo el reembolso, pero RELYDO no pudo actualizar payments. No repitas el reembolso.",
            stripeRefundId: refund.id,
          },
          { status: 500 }
        );
      }

      const {
        error: updateClaimError,
      } = await supabaseAdmin
        .from("job_claims")
        .update({
          status: "resolved",
          resolution_type: "refund_customer",
          provider_award_amount: 0,
          customer_refund_amount: totalRefunded,
          resolution_notes:
            `[REEMBOLSO AL CLIENTE]\n${notes}`,
          resolved_at:
            new Date().toISOString(),
          resolved_by: user.id,
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", claim.id);

      if (updateClaimError) {
        return NextResponse.json(
          {
            error:
              "El cliente fue reembolsado, pero no pudimos cerrar el reclamo. No repitas el reembolso.",
            stripeRefundId: refund.id,
          },
          { status: 500 }
        );
      }

      const {
        error:
          cancelRequestError,
      } =
        await supabaseAdmin
          .from(
            "service_requests"
          )
          .update({
            status:
              "cancelled",
            job_stage:
              null,
            cancellation_reason:
              "Reclamo resuelto a favor del cliente por RELYDO.",
            cancelled_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            claim.request_id
          );

      if (
        cancelRequestError
      ) {
        return NextResponse.json(
          {
            error:
              "El cliente fue reembolsado y el reclamo fue cerrado, pero no pudimos marcar el trabajo como cancelado. No repitas el reembolso.",
            stripeRefundId:
              refund.id,
          },
          { status: 500 }
        );
      }

      try {
        await Promise.allSettled([
          sendRelydoNotification({
            userId: claim.customer_id,
            type: "claim_resolved",
            title: "Reclamo resuelto",
            titleEn: "Claim resolved",
            message: `RELYDO resolvió el reclamo a tu favor. Se procesó un reembolso de $${totalRefunded.toFixed(2)}. ${serviceRequest.title || "Trabajo RELYDO"}.`,
            messageEn: `RELYDO resolved the claim in your favor. A $${totalRefunded.toFixed(2)} refund was processed. ${serviceRequest.title || "RELYDO job"}.`,
            requestId: claim.request_id,
            url: `/mis-solicitudes/${claim.request_id}`,
          }),
          sendRelydoNotification({
            userId: claim.provider_id,
            type: "claim_resolved",
            title: "Reclamo resuelto",
            titleEn: "Claim resolved",
            message: `RELYDO resolvió el reclamo a favor del cliente. ${serviceRequest.title || "Trabajo RELYDO"}.`,
            messageEn: `RELYDO resolved the claim in favor of the customer. ${serviceRequest.title || "RELYDO job"}.`,
            requestId: claim.request_id,
            url: `/trabajos/${claim.request_id}`,
          }),
        ]);
      } catch (notificationError) {
        console.warn(
          "El reclamo fue resuelto, pero falló el envío de notificaciones:",
          notificationError
        );
      }

      return NextResponse.json({
        success: true,
        action: "refund_customer",
        providerAwardAmount: 0,
        customerRefundAmount: totalRefunded,
        stripeRefundId: refund.id,
        refundStatus: refund.status,
      });
    }

    // ======================================================
    // 7C. RESOLUCIÓN PARCIAL
    // ======================================================
    //
    // REGLA:
    // - Una decisión económica del Admin se ejecuta de inmediato.
    // - No usa la espera normal de liberación del trabajo.
    // - El proceso es reanudable/idempotente:
    //   si Stripe ya procesó una parte, RELYDO no la repite.
    //
    // ORDEN PARA CASOS NUEVOS:
    // 1. Compensar al profesional.
    // 2. Reembolsar al cliente.
    // 3. Consolidar payments.
    // 4. Cerrar el reclamo.
    //
    // Para casos que quedaron a medias anteriormente,
    // se detecta lo ya realizado y solo se procesa lo pendiente.
    // ======================================================

    if (
      !Number.isFinite(providerAwardAmount) ||
      !Number.isFinite(customerRefundAmount) ||
      providerAwardAmount < 0 ||
      customerRefundAmount < 0
    ) {
      return NextResponse.json(
        {
          error:
            "Los importes de la resolución parcial no son válidos.",
        },
        { status: 400 }
      );
    }

    if (
      providerAwardAmount === 0 &&
      customerRefundAmount === 0
    ) {
      return NextResponse.json(
        {
          error:
            "En una resolución parcial debes asignar dinero al profesional, al cliente o a ambos.",
        },
        { status: 400 }
      );
    }

    if (providerAwardAmount > providerNet) {
      return NextResponse.json(
        {
          error:
            `El profesional no puede recibir más de $${providerNet.toFixed(
              2
            )}.`,
        },
        { status: 400 }
      );
    }

    if (customerRefundAmount > customerTotal) {
      return NextResponse.json(
        {
          error:
            `El cliente no puede recibir un reembolso mayor de $${customerTotal.toFixed(
              2
            )}.`,
        },
        { status: 400 }
      );
    }

    if (
      dinero(
        providerAwardAmount +
          customerRefundAmount
      ) > customerTotal
    ) {
      return NextResponse.json(
        {
          error:
            `La suma destinada al profesional y al cliente no puede superar los $${customerTotal.toFixed(
              2
            )} pagados por el cliente.`,
        },
        { status: 400 }
      );
    }

    const expectedProviderCents =
      Math.round(providerAwardAmount * 100);

    const expectedRefundCents =
      Math.round(customerRefundAmount * 100);

    const previousRefunded =
      dinero(payment.refunded_amount || 0);

    if (
      !Number.isFinite(previousRefunded) ||
      previousRefunded < 0
    ) {
      return NextResponse.json(
        {
          error:
            "El importe de reembolso previo guardado no es válido.",
        },
        { status: 500 }
      );
    }

    // ======================================================
    // 7C-1. RECONCILIAR REEMBOLSOS REALES DE STRIPE
    // ======================================================

    const stripeRefunds =
      await stripe.refunds.list({
        payment_intent:
          payment.provider_payment_id,
        limit: 100,
      });

    const partialRefundsForThisClaim =
      stripeRefunds.data.filter(
        (refund) =>
          refund.metadata?.claim_id ===
            String(claim.id) &&
          refund.metadata?.resolution ===
            "partial" &&
          refund.status !== "failed" &&
          refund.status !== "canceled"
      );

    const stripeRefundedForClaimCents =
      partialRefundsForThisClaim.reduce(
        (total, refund) =>
          total + refund.amount,
        0
      );

    const dbRefundedCents =
      Math.round(previousRefunded * 100);

    if (
      stripeRefundedForClaimCents > 0 &&
      stripeRefundedForClaimCents !==
        expectedRefundCents
    ) {
      return NextResponse.json(
        {
          error:
            `Stripe ya registra un reembolso parcial de $${(
              stripeRefundedForClaimCents / 100
            ).toFixed(
              2
            )} para este reclamo, diferente a los $${customerRefundAmount.toFixed(
              2
            )} definidos ahora. No se hará otro movimiento automáticamente.`,
        },
        { status: 409 }
      );
    }

    if (
      dbRefundedCents > 0 &&
      dbRefundedCents !== expectedRefundCents
    ) {
      return NextResponse.json(
        {
          error:
            `RELYDO ya registra un reembolso de $${previousRefunded.toFixed(
              2
            )}, diferente a los $${customerRefundAmount.toFixed(
              2
            )} definidos ahora. Revisa el historial antes de continuar.`,
        },
        { status: 409 }
      );
    }

    const refundAlreadyProcessed =
      customerRefundAmount === 0 ||
      stripeRefundedForClaimCents ===
        expectedRefundCents ||
      dbRefundedCents ===
        expectedRefundCents;

    let stripeRefundId: string | null =
      partialRefundsForThisClaim[0]?.id ||
      null;

    let refundStatus: string | null =
      partialRefundsForThisClaim[0]?.status ||
      null;

    // ======================================================
    // 7C-2. RECONCILIAR TRANSFERENCIAS AL PROFESIONAL
    // ======================================================

    if (
      activeTransferredCents > 0 &&
      activeTransferredCents !==
        expectedProviderCents
    ) {
      return NextResponse.json(
        {
          error:
            `Ya existe una transferencia activa de $${(
              activeTransferredCents / 100
            ).toFixed(
              2
            )} para este trabajo, diferente a los $${providerAwardAmount.toFixed(
              2
            )} definidos en esta resolución. No se hará una segunda distribución automáticamente.`,
        },
        { status: 409 }
      );
    }

    let stripeTransferId: string | null =
      activeTransfers[0]?.id || null;

    const transferAlreadyProcessed =
      providerAwardAmount === 0 ||
      activeTransferredCents ===
        expectedProviderCents;

    // ======================================================
    // 7C-3. COMPENSAR AL PROFESIONAL INMEDIATAMENTE
    // ======================================================

    if (
      providerAwardAmount > 0 &&
      !transferAlreadyProcessed
    ) {
      const {
        data: providerProfile,
        error: providerProfileError,
      } = await supabaseAdmin
        .from("provider_profiles")
        .select(`
          user_id,
          stripe_account_id
        `)
        .eq(
          "user_id",
          claim.provider_id
        )
        .maybeSingle();

      if (providerProfileError) {
        return NextResponse.json(
          {
            error:
              `No pudimos consultar Stripe Connect: ${providerProfileError.message}`,
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
              "El profesional no tiene Stripe Connect configurado.",
          },
          { status: 400 }
        );
      }

      const account =
        await stripe.accounts.retrieve(
          providerProfile.stripe_account_id
        );

      if (
        account.capabilities?.transfers !==
        "active"
      ) {
        return NextResponse.json(
          {
            error:
              "La cuenta Stripe del profesional no puede recibir transferencias.",
          },
          { status: 400 }
        );
      }

      /*
        IMPORTANTE:
        En una resolución de Admin RELYDO asume sus costos
        de procesamiento. Por eso la compensación se envía
        desde el balance de la plataforma y no se limita al
        neto restante del cargo después de un reembolso.
      */

      const transfer =
        await stripe.transfers.create(
          {
            amount:
              expectedProviderCents,

            currency: (
              payment.currency || "usd"
            ).toLowerCase(),

            destination:
              providerProfile.stripe_account_id,

            transfer_group:
              transferGroup,

            metadata: {
              request_id:
                String(claim.request_id),

              payment_id:
                String(payment.id),

              claim_id:
                String(claim.id),

              professional_id:
                String(claim.provider_id),

              resolution:
                "partial",

              provider_award_amount:
                providerAwardAmount.toFixed(2),

              customer_refund_amount:
                customerRefundAmount.toFixed(2),
            },
          },
          {
            idempotencyKey:
              `relydo_claim_partial_transfer_${payment.id}_${claim.id}_${expectedProviderCents}`,
          }
        );

      stripeTransferId =
        transfer.id;

      const transferRecordedAt =
        new Date().toISOString();

      const {
        error:
          updateTransferPaymentError,
      } = await supabaseAdmin
        .from("payments")
        .update({
          stripe_transfer_id:
            transfer.id,
          released_at:
            transferRecordedAt,
          last_release_error:
            null,
          updated_at:
            transferRecordedAt,
        })
        .eq("id", payment.id);

      if (updateTransferPaymentError) {
        return NextResponse.json(
          {
            error:
              "Stripe transfirió la compensación al profesional, pero RELYDO no pudo registrar la transferencia. No repitas la operación; usa el ID de Stripe para reconciliar.",
            stripeTransferId:
              transfer.id,
            partialProcessing:
              true,
          },
          { status: 500 }
        );
      }
    }

    // ======================================================
    // 7C-4. REEMBOLSAR AL CLIENTE SOLO SI FALTA
    // ======================================================

    if (
      customerRefundAmount > 0 &&
      !refundAlreadyProcessed
    ) {
      const refund =
        await stripe.refunds.create(
          {
            payment_intent:
              payment.provider_payment_id,

            amount:
              expectedRefundCents,

            reason:
              "requested_by_customer",

            metadata: {
              request_id:
                String(claim.request_id),

              payment_id:
                String(payment.id),

              claim_id:
                String(claim.id),

              resolution:
                "partial",

              customer_refund_amount:
                customerRefundAmount.toFixed(2),

              provider_award_amount:
                providerAwardAmount.toFixed(2),
            },
          },
          {
            idempotencyKey:
              `relydo_claim_partial_refund_${payment.id}_${claim.id}_${expectedRefundCents}`,
          }
        );

      stripeRefundId =
        refund.id;

      refundStatus =
        refund.status;

      const refundRecordedAt =
        new Date().toISOString();

      const {
        error:
          updateRefundPaymentError,
      } = await supabaseAdmin
        .from("payments")
        .update({
          refunded_amount:
            customerRefundAmount,
          refunded_at:
            refundRecordedAt,
          updated_at:
            refundRecordedAt,
        })
        .eq("id", payment.id);

      if (updateRefundPaymentError) {
        return NextResponse.json(
          {
            error:
              "Stripe procesó el reembolso al cliente, pero RELYDO no pudo registrarlo en payments. No repitas la operación; usa el ID de Stripe para reconciliar.",
            stripeRefundId:
              refund.id,
            stripeTransferId,
            partialProcessing:
              true,
          },
          { status: 500 }
        );
      }
    } else if (
      customerRefundAmount > 0 &&
      dbRefundedCents !==
        expectedRefundCents
    ) {
      /*
        Stripe confirma que este reembolso ya existe,
        pero la fila payments quedó desactualizada.
        La reconciliamos sin crear otro reembolso.
      */
      const reconciledAt =
        new Date().toISOString();

      const {
        error:
          reconcileRefundError,
      } = await supabaseAdmin
        .from("payments")
        .update({
          refunded_amount:
            customerRefundAmount,
          refunded_at:
            reconciledAt,
          updated_at:
            reconciledAt,
        })
        .eq("id", payment.id);

      if (reconcileRefundError) {
        return NextResponse.json(
          {
            error:
              "Stripe confirma el reembolso existente, pero RELYDO no pudo reconciliar payments. No repitas el reembolso.",
            stripeRefundId,
            stripeTransferId,
            partialProcessing:
              true,
          },
          { status: 500 }
        );
      }
    }

    // ======================================================
    // 7C-5. CONSOLIDAR ESTADO FINANCIERO
    // ======================================================

    const partialUpdatedAt =
      new Date().toISOString();

    const partialStatus =
      customerRefundAmount > 0
        ? "partially_refunded"
        : providerAwardAmount >= providerNet
        ? "paid_out"
        : "paid_out";

    const partialPaymentUpdate:
      Record<string, unknown> = {
        status:
          partialStatus,
        refunded_amount:
          customerRefundAmount,
        updated_at:
          partialUpdatedAt,
      };

    if (customerRefundAmount > 0) {
      partialPaymentUpdate.refunded_at =
        partialUpdatedAt;
    }

    if (stripeTransferId) {
      partialPaymentUpdate.stripe_transfer_id =
        stripeTransferId;
      partialPaymentUpdate.released_at =
        partialUpdatedAt;
      partialPaymentUpdate.last_release_error =
        null;
    }

    const {
      error:
        updatePartialPaymentError,
    } = await supabaseAdmin
      .from("payments")
      .update(
        partialPaymentUpdate
      )
      .eq("id", payment.id);

    if (updatePartialPaymentError) {
      return NextResponse.json(
        {
          error:
            "La distribución económica fue procesada, pero RELYDO no pudo consolidar el estado de payments. No repitas movimientos de dinero.",
          stripeTransferId,
          stripeRefundId,
          partialProcessing:
            true,
        },
        { status: 500 }
      );
    }

    // ======================================================
    // 7C-6. CERRAR EL RECLAMO
    // ======================================================

    const {
      error: updateClaimError,
    } = await supabaseAdmin
      .from("job_claims")
      .update({
        status:
          "resolved",

        resolution_type:
          "partial",

        provider_award_amount:
          providerAwardAmount,

        customer_refund_amount:
          customerRefundAmount,

        resolution_notes:
          `[RESOLUCIÓN PARCIAL]\nProfesional: $${providerAwardAmount.toFixed(
            2
          )}\nCliente: $${customerRefundAmount.toFixed(
            2
          )}\n${notes}`,

        resolved_at:
          new Date().toISOString(),

        resolved_by:
          user.id,

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        claim.id
      );

    if (updateClaimError) {
      return NextResponse.json(
        {
          error:
            "La distribución económica fue procesada, pero no pudimos cerrar el reclamo. No repitas movimientos de dinero; vuelve a intentar para que RELYDO reconcilie y cierre el caso.",
          stripeTransferId,
          stripeRefundId,
          partialProcessing:
            true,
        },
        { status: 500 }
      );
    }

    // ======================================================
    // 7C-7. SI EL TRABAJO ESTABA INICIADO, CANCELARLO
    // ======================================================

    let workCancelled =
      false;

    if (trabajoIniciado) {
      const {
        error: cancelRequestError,
      } = await supabaseAdmin
        .from("service_requests")
        .update({
          status:
            "cancelled",

          job_stage:
            null,

          cancellation_reason:
            "Reclamo resuelto parcialmente por RELYDO.",

          cancelled_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          claim.request_id
        );

      if (cancelRequestError) {
        return NextResponse.json(
          {
            error:
              "La resolución económica fue procesada y el reclamo fue cerrado, pero no pudimos cancelar el trabajo. No repitas movimientos de dinero.",
            stripeTransferId,
            stripeRefundId,
            partialProcessing:
              true,
          },
          { status: 500 }
        );
      }

      workCancelled =
        true;
    }

    // ======================================================
    // 7C-8. NOTIFICAR RESOLUCIÓN
    // ======================================================

    try {
      await Promise.allSettled([
        sendRelydoNotification({
          userId:
            claim.customer_id,
          type:
            "claim_resolved",
          title: "Reclamo resuelto",
          titleEn: "Claim resolved",
          message: `RELYDO resolvió parcialmente el reclamo. Reembolso para ti: $${customerRefundAmount.toFixed(2)}. ${serviceRequest.title || "Trabajo RELYDO"}.`,
          messageEn: `RELYDO partially resolved the claim. Refund for you: $${customerRefundAmount.toFixed(2)}. ${serviceRequest.title || "RELYDO job"}.`,
          requestId:
            claim.request_id,
          url:
            `/mis-solicitudes/${claim.request_id}`,
        }),

        sendRelydoNotification({
          userId:
            claim.provider_id,
          type:
            "claim_resolved",
          title: "Reclamo resuelto",
          titleEn: "Claim resolved",
          message: `RELYDO resolvió parcialmente el reclamo. Compensación para ti: $${providerAwardAmount.toFixed(2)}. ${serviceRequest.title || "Trabajo RELYDO"}.`,
          messageEn: `RELYDO partially resolved the claim. Compensation for you: $${providerAwardAmount.toFixed(2)}. ${serviceRequest.title || "RELYDO job"}.`,
          requestId:
            claim.request_id,
          url:
            `/trabajos/${claim.request_id}`,
        }),
      ]);
    } catch (notificationError) {
      console.warn(
        "El reclamo fue resuelto, pero falló el envío de notificaciones:",
        notificationError
      );
    }

    // ======================================================
    // 7C-9. RESPUESTA FINAL
    // ======================================================

    return NextResponse.json({
      success:
        true,

      action:
        "partial",

      providerAwardAmount,

      customerRefundAmount,

      stripeTransferId,

      stripeRefundId,

      refundStatus,

      workCancelled,

      recoveredExistingRefund:
        refundAlreadyProcessed &&
        customerRefundAmount > 0,

      recoveredExistingTransfer:
        transferAlreadyProcessed &&
        providerAwardAmount > 0,

      message:
        trabajoIniciado
          ? "Resolución parcial procesada correctamente. Se aplicó la distribución definida y el trabajo fue cancelado."
          : "Resolución parcial procesada correctamente.",
    });

  } catch (error) {
    console.error(
      "Error resolviendo reclamo:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo resolver el reclamo.",
      },
      { status: 500 }
    );
  }
}