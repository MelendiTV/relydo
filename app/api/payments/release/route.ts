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


type JwtPayload = {
  session_id?: string;
  [key: string]: unknown;
};

function decodeJwtPayload(accessToken: string): JwtPayload | null {
  try {
    const parts = accessToken.split(".");
    if (parts.length !== 3) return null;

    const payloadPart = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const padded =
      payloadPart +
      "=".repeat((4 - (payloadPart.length % 4)) % 4);

    return JSON.parse(
      Buffer.from(padded, "base64").toString("utf8")
    ) as JwtPayload;
  } catch {
    return null;
  }
}

async function providerSessionIsActive(userId: string, accessToken: string) {
  const sessionId = decodeJwtPayload(accessToken)?.session_id;
  if (!sessionId) return false;

  const { data, error } = await supabaseAdmin
    .from("provider_active_sessions")
    .select("session_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data?.session_id) return false;
  return data.session_id === sessionId;
}

type ReleaseResult =
  | {
      success: true;
      requestId: string;
      paymentId: string;
      stripeTransferId: string;
      providerNetAmount: number;
      destinationAccount: string;
      alreadyReleased?: boolean;
      changeOrderTransferIds?: string[];
    }
  | {
      success: false;
      status: number;
      error: string;
      paymentBlocked?: boolean;
      reason?: string;
      claimId?: string;
      claimStatus?: string;
    };

function unauthorized(message = "No autorizado.") {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status: 401 }
  );
}

async function procesarLiberacion({
  requestId,
  expectedProviderId,
  enforceReleaseWindow = true,
}: {
  requestId: string;
  expectedProviderId?: string | null;
  enforceReleaseWindow?: boolean;
}): Promise<ReleaseResult> {
  // ============================================================
  // 1. BUSCAR TRABAJO
  // ============================================================

  const { data: serviceRequest, error: requestError } =
    await supabaseAdmin
      .from("service_requests")
      .select(`
        id,
        status,
        preferred_provider_id
      `)
      .eq("id", requestId)
      .maybeSingle();

  if (requestError) {
    console.error("Error buscando trabajo:", requestError);

    return {
      success: false,
      status: 500,
      error: `No pudimos consultar el trabajo: ${requestError.message}`,
    };
  }

  if (!serviceRequest) {
    return {
      success: false,
      status: 404,
      error: "No encontramos este trabajo.",
    };
  }

  if (!serviceRequest.preferred_provider_id) {
    return {
      success: false,
      status: 400,
      error: "Este trabajo no tiene un profesional asignado.",
    };
  }

  if (
    expectedProviderId &&
    serviceRequest.preferred_provider_id !== expectedProviderId
  ) {
    return {
      success: false,
      status: 403,
      error:
        "No tienes permiso para liberar el pago de este trabajo.",
    };
  }

  // ============================================================
  // 2. EL TRABAJO DEBE ESTAR COMPLETADO
  // ============================================================

  if (serviceRequest.status !== "completed") {
    return {
      success: false,
      status: 400,
      error:
        "El pago no puede liberarse porque el trabajo todavía no está completado.",
    };
  }

  // ============================================================
  // 3. COMPROBAR RECLAMO ACTIVO
  // ============================================================

  const { data: activeClaims, error: claimError } =
    await supabaseAdmin
      .from("job_claims")
      .select(`
        id,
        status,
        reason,
        created_at
      `)
      .eq("request_id", requestId)
      .in("status", ["open", "reviewing", "in_review"])
      .limit(1);

  if (claimError) {
    console.error(
      "Error comprobando reclamos activos:",
      claimError
    );

    return {
      success: false,
      status: 500,
      error: `No pudimos comprobar si existe un reclamo activo: ${claimError.message}`,
    };
  }

  const activeClaim =
    activeClaims && activeClaims.length > 0
      ? activeClaims[0]
      : null;

  if (activeClaim) {
    console.log("======================================");
    console.log("PAGO BLOQUEADO POR RECLAMO");
    console.log("Trabajo:", requestId);
    console.log("Reclamo:", activeClaim.id);
    console.log("Estado:", activeClaim.status);
    console.log("Motivo:", activeClaim.reason);
    console.log("======================================");

    return {
      success: false,
      status: 409,
      paymentBlocked: true,
      reason: "active_claim",
      claimId: activeClaim.id,
      claimStatus: activeClaim.status,
      error:
        "El pago está retenido porque existe un reclamo activo sobre este trabajo.",
    };
  }

  // ============================================================
  // 4. BUSCAR EL PAGO
  // ============================================================

  const { data: payment, error: paymentError } =
    await supabaseAdmin
      .from("payments")
      .select(`
        id,
        request_id,
        offer_id,
        provider_id,
        provider_net_amount,
        currency,
        status,
        payment_provider,
        provider_payment_id,
        completed_at,
        release_due_at,
        released_at,
        stripe_transfer_id,
        release_attempts,
        last_release_error
      `)
      .eq("request_id", requestId)
      .eq(
        "provider_id",
        serviceRequest.preferred_provider_id
      )
      .order("updated_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

  if (paymentError) {
    console.error("Error buscando payment:", paymentError);

    return {
      success: false,
      status: 500,
      error: `No pudimos consultar el pago: ${paymentError.message}`,
    };
  }

  if (!payment) {
    return {
      success: false,
      status: 404,
      error:
        "No encontramos el pago correspondiente a este trabajo.",
    };
  }

  // ============================================================
  // 5. ESTADO DE LIBERACIÓN DEL PAGO ORIGINAL
  //
  // IMPORTANTE:
  // Ya no regresamos inmediatamente si el pago original fue
  // liberado. Puede existir uno o más Change Orders pagados que
  // todavía necesiten su propia transferencia al profesional.
  // ============================================================

  const pagoOriginalYaLiberado =
    Boolean(
      payment.released_at &&
      payment.stripe_transfer_id
    );

  // ============================================================
  // 6. RESPETAR LA VENTANA DE PROTECCIÓN
  // ============================================================

  if (enforceReleaseWindow) {
    if (!payment.release_due_at) {
      return {
        success: false,
        status: 409,
        reason: "release_not_scheduled",
        error:
          "Este pago todavía no tiene una fecha de liberación programada.",
      };
    }

    const releaseDueAt =
      new Date(payment.release_due_at).getTime();

    if (
      !Number.isFinite(releaseDueAt) ||
      releaseDueAt > Date.now()
    ) {
      return {
        success: false,
        status: 409,
        reason: "release_window_active",
        error:
          "El pago sigue dentro del período de protección y todavía no puede liberarse.",
      };
    }
  }

  // ============================================================
  // 7. VALIDAR STRIPE
  // ============================================================

  if (payment.payment_provider !== "stripe") {
    return {
      success: false,
      status: 400,
      error: "Este pago no pertenece a Stripe.",
    };
  }

  if (!payment.provider_payment_id) {
    return {
      success: false,
      status: 400,
      error:
        "No encontramos el PaymentIntent original de Stripe.",
    };
  }

  const providerNetAmountOriginal =
    Number(payment.provider_net_amount);

  if (
    !Number.isFinite(providerNetAmountOriginal) ||
    providerNetAmountOriginal <= 0
  ) {
    return {
      success: false,
      status: 400,
      error:
        "El importe original destinado al profesional no es válido.",
    };
  }

  // ============================================================
  // 8. BUSCAR STRIPE CONNECT DEL PROFESIONAL
  // ============================================================

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
      serviceRequest.preferred_provider_id
    )
    .maybeSingle();

  if (providerProfileError) {
    console.error(
      "Error buscando Stripe Connect:",
      providerProfileError
    );

    return {
      success: false,
      status: 500,
      error: `No pudimos consultar la cuenta Stripe del profesional: ${providerProfileError.message}`,
    };
  }

  if (!providerProfile?.stripe_account_id) {
    return {
      success: false,
      status: 400,
      error:
        "El profesional no tiene una cuenta Stripe Connect configurada.",
    };
  }

  const connectedAccount =
    await stripe.accounts.retrieve(
      providerProfile.stripe_account_id
    );

  if (
    connectedAccount.capabilities?.transfers !==
    "active"
  ) {
    return {
      success: false,
      status: 400,
      error:
        "La cuenta Stripe del profesional todavía no está habilitada para recibir transferencias.",
    };
  }

  // ============================================================
  // 9. BUSCAR CHANGE ORDERS PAGADOS
  //
  // Cada Change Order se cobró en un PaymentIntent separado,
  // por lo tanto cada adicional debe transferirse usando el
  // cargo de ESE PaymentIntent, no el cargo del pago original.
  // ============================================================

  const {
    data: paidChangeOrders,
    error: changeOrdersError,
  } = await supabaseAdmin
    .from("change_orders")
    .select(`
      id,
      request_id,
      provider_id,
      customer_id,
      status,
      payment_status,
      additional_amount,
      additional_provider_net_amount,
      stripe_payment_intent_id,
      stripe_transfer_id,
      released_at
    `)
    .eq("request_id", requestId)
    .eq(
      "provider_id",
      serviceRequest.preferred_provider_id
    )
    .eq("status", "accepted")
    .eq("payment_status", "paid")
    .order("created_at", {
      ascending: true,
    });

  if (changeOrdersError) {
    console.error(
      "Error buscando Change Orders pagados:",
      changeOrdersError
    );

    return {
      success: false,
      status: 500,
      error:
        `No pudimos consultar los cambios de presupuesto pagados: ${changeOrdersError.message}`,
    };
  }

  const changeOrders =
    paidChangeOrders || [];

  const netoChangeOrdersTotal =
    Math.round(
      (
        changeOrders.reduce(
          (total, changeOrder) =>
            total +
            Number(
              changeOrder.additional_provider_net_amount ||
                0
            ),
          0
        ) +
        Number.EPSILON
      ) *
        100
    ) / 100;

  const providerNetAmountTotal =
    Math.round(
      (
        providerNetAmountOriginal +
        netoChangeOrdersTotal +
        Number.EPSILON
      ) *
        100
    ) / 100;

  // ============================================================
  // 10. REGISTRAR INTENTO
  // ============================================================

  await supabaseAdmin
    .from("payments")
    .update({
      release_attempts:
        Number(payment.release_attempts || 0) + 1,
      last_release_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment.id);

  try {
    let originalTransferId =
      payment.stripe_transfer_id || "";

    let originalLiberadoAhora =
      false;

    // ==========================================================
    // 11. LIBERAR PAGO ORIGINAL SI TODAVÍA NO SE LIBERÓ
    // ==========================================================

    if (!pagoOriginalYaLiberado) {
      const paymentIntent =
        await stripe.paymentIntents.retrieve(
          payment.provider_payment_id,
          {
            expand: ["latest_charge"],
          }
        );

      const latestCharge =
        paymentIntent.latest_charge;

      const chargeId =
        typeof latestCharge === "string"
          ? latestCharge
          : latestCharge?.id;

      if (!chargeId) {
        return {
          success: false,
          status: 500,
          error:
            "No encontramos el cargo original de Stripe.",
        };
      }

      console.log("======================================");
      console.log("LIBERANDO PAGO ORIGINAL AL PROFESIONAL");
      console.log("Trabajo:", requestId);
      console.log("Payment:", payment.id);
      console.log(
        "Profesional:",
        serviceRequest.preferred_provider_id
      );
      console.log(
        "Cuenta Stripe:",
        providerProfile.stripe_account_id
      );
      console.log(
        "Monto original:",
        providerNetAmountOriginal
      );
      console.log("======================================");

      const transferOriginal =
        await stripe.transfers.create(
          {
            amount:
              Math.round(
                providerNetAmountOriginal *
                  100
              ),

            currency: (
              payment.currency || "usd"
            ).toLowerCase(),

            destination:
              providerProfile.stripe_account_id,

            source_transaction:
              chargeId,

            transfer_group:
              `relydo_request_${requestId}`,

            metadata: {
              request_id:
                String(requestId),

              payment_id:
                String(payment.id),

              offer_id:
                String(
                  payment.offer_id || ""
                ),

              professional_id:
                String(
                  serviceRequest.preferred_provider_id
                ),

              provider_net_amount:
                providerNetAmountOriginal.toFixed(
                  2
                ),

              payment_type:
                "original",

              release_reason:
                "job_completed_after_protection_window",
            },
          },
          {
            idempotencyKey:
              `relydo_release_payment_${payment.id}`,
          }
        );

      originalTransferId =
        transferOriginal.id;

      originalLiberadoAhora =
        true;

      const releasedAt =
        new Date().toISOString();

      const {
        error: updateReleaseError,
      } = await supabaseAdmin
        .from("payments")
        .update({
          released_at: releasedAt,
          stripe_transfer_id:
            transferOriginal.id,
          last_release_error: null,
          status: "paid_out",
          updated_at: releasedAt,
        })
        .eq("id", payment.id);

      if (updateReleaseError) {
        console.error(
          "La transferencia original se creó, pero no pudimos actualizar payments:",
          updateReleaseError
        );

        return {
          success: false,
          status: 500,
          error:
            "Stripe creó la transferencia original, pero RELYDO no pudo registrar la liberación en la base de datos.",
        };
      }
    }

    // ==========================================================
    // 12. LIBERAR CADA CHANGE ORDER PAGADO
    // ==========================================================

    const changeOrderTransferIds:
      string[] = [];

    for (
      const changeOrder of changeOrders
    ) {
      if (
        changeOrder.released_at &&
        changeOrder.stripe_transfer_id
      ) {
        changeOrderTransferIds.push(
          changeOrder.stripe_transfer_id
        );

        continue;
      }

      const netoAdicional =
        Number(
          changeOrder.additional_provider_net_amount
        );

      if (
        !Number.isFinite(netoAdicional) ||
        netoAdicional <= 0
      ) {
        throw new Error(
          `El Change Order ${changeOrder.id} tiene un neto profesional inválido.`
        );
      }

      if (
        !changeOrder.stripe_payment_intent_id
      ) {
        throw new Error(
          `El Change Order ${changeOrder.id} no tiene PaymentIntent de Stripe registrado.`
        );
      }

      const changePaymentIntent =
        await stripe.paymentIntents.retrieve(
          changeOrder.stripe_payment_intent_id,
          {
            expand: ["latest_charge"],
          }
        );

      const changeLatestCharge =
        changePaymentIntent.latest_charge;

      const changeChargeId =
        typeof changeLatestCharge ===
        "string"
          ? changeLatestCharge
          : changeLatestCharge?.id;

      if (!changeChargeId) {
        throw new Error(
          `No encontramos el cargo de Stripe del Change Order ${changeOrder.id}.`
        );
      }

      console.log("======================================");
      console.log("LIBERANDO CHANGE ORDER AL PROFESIONAL");
      console.log("Trabajo:", requestId);
      console.log(
        "Change Order:",
        changeOrder.id
      );
      console.log(
        "Monto adicional neto:",
        netoAdicional
      );
      console.log("======================================");

      const changeTransfer =
        await stripe.transfers.create(
          {
            amount:
              Math.round(
                netoAdicional * 100
              ),

            currency: (
              payment.currency || "usd"
            ).toLowerCase(),

            destination:
              providerProfile.stripe_account_id,

            source_transaction:
              changeChargeId,

            transfer_group:
              `relydo_request_${requestId}`,

            metadata: {
              request_id:
                String(requestId),

              change_order_id:
                String(
                  changeOrder.id
                ),

              professional_id:
                String(
                  serviceRequest.preferred_provider_id
                ),

              provider_net_amount:
                netoAdicional.toFixed(
                  2
                ),

              payment_type:
                "change_order",

              release_reason:
                "job_completed_after_protection_window",
            },
          },
          {
            idempotencyKey:
              `relydo_release_change_order_${changeOrder.id}`,
          }
        );

      changeOrderTransferIds.push(
        changeTransfer.id
      );

      const changeReleasedAt =
        new Date().toISOString();

      const {
        error:
          updateChangeOrderError,
      } = await supabaseAdmin
        .from("change_orders")
        .update({
          stripe_transfer_id:
            changeTransfer.id,
          released_at:
            changeReleasedAt,
          updated_at:
            changeReleasedAt,
        })
        .eq(
          "id",
          changeOrder.id
        );

      if (
        updateChangeOrderError
      ) {
        console.error(
          "La transferencia del Change Order se creó, pero no pudimos actualizar change_orders:",
          updateChangeOrderError
        );

        throw new Error(
          "Stripe transfirió el adicional, pero RELYDO no pudo registrar la liberación del Change Order."
        );
      }
    }

    // ==========================================================
    // 13. RESPUESTA FINAL
    // ==========================================================

    const todosChangeOrdersLiberados =
      changeOrders.every(
        (changeOrder) =>
          Boolean(
            changeOrder.released_at &&
            changeOrder.stripe_transfer_id
          ) ||
          changeOrderTransferIds.length >
            0
      );

    const alreadyReleased =
      pagoOriginalYaLiberado &&
      changeOrders.every(
        (changeOrder) =>
          Boolean(
            changeOrder.released_at &&
            changeOrder.stripe_transfer_id
          )
      );

    console.log("======================================");
    console.log("LIBERACIÓN COMPLETA");
    console.log("Trabajo:", requestId);
    console.log(
      "Original:",
      providerNetAmountOriginal
    );
    console.log(
      "Change Orders:",
      netoChangeOrdersTotal
    );
    console.log(
      "Total profesional:",
      providerNetAmountTotal
    );
    console.log("======================================");

    if (!alreadyReleased) {
      await sendRelydoNotification({
        userId: serviceRequest.preferred_provider_id,
        type: "payment_released",
        title: "Pago liberado",
        titleEn: "Payment released",
        message: `El pago de tu trabajo fue liberado. Neto del profesional: $${Number(providerNetAmountTotal || 0).toFixed(2)}.`,
        messageEn: `Your job payment was released. Provider net: $${Number(providerNetAmountTotal || 0).toFixed(2)}.`,
        requestId,
        url: `/trabajos/${requestId}`,
      });
    }

    return {
      success: true,
      requestId,
      paymentId: payment.id,
      stripeTransferId:
        originalTransferId ||
        changeOrderTransferIds[0] ||
        "",
      providerNetAmount:
        providerNetAmountTotal,
      destinationAccount:
        providerProfile.stripe_account_id,
      alreadyReleased:
        alreadyReleased &&
        todosChangeOrdersLiberados &&
        !originalLiberadoAhora,
      changeOrderTransferIds,
    };
  } catch (transferError) {
    const mensajeError =
      transferError instanceof Error
        ? transferError.message
        : "Error desconocido creando la transferencia.";

    console.error(
      "Error creando transferencia Stripe:",
      transferError
    );

    await supabaseAdmin
      .from("payments")
      .update({
        last_release_error: mensajeError,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);

    return {
      success: false,
      status: 500,
      error: mensajeError,
    };
  }
}

// ============================================================
// POST
// Liberación manual / profesional.
// También respeta la ventana de protección.
// ============================================================

export async function POST(
  request: NextRequest
) {
  try {
    const authorization =
      request.headers.get("authorization");

    if (
      !authorization?.startsWith("Bearer ")
    ) {
      return unauthorized(
        "No estás autenticado."
      );
    }

    const accessToken =
      authorization
        .replace("Bearer ", "")
        .trim();

    const {
      data: { user },
      error: userError,
    } =
      await supabaseAdmin.auth.getUser(
        accessToken
      );

    if (userError || !user) {
      return unauthorized(
        "No pudimos verificar tu sesión."
      );
    }

    const sessionActive = await providerSessionIsActive(
      user.id,
      accessToken
    );

    if (!sessionActive) {
      return NextResponse.json(
        {
          success: false,
          code: "PROVIDER_SESSION_REPLACED",
          error:
            "Tu sesión profesional ya no es la sesión activa de esta cuenta.",
        },
        { status: 409 }
      );
    }

    const body =
      await request.json();

    const requestId =
      body.requestId;

    if (!requestId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Falta el ID del trabajo.",
        },
        { status: 400 }
      );
    }

    const resultado =
      await procesarLiberacion({
        requestId,
        expectedProviderId: user.id,
        enforceReleaseWindow: true,
      });

    if (!resultado.success) {
      return NextResponse.json(
        resultado,
        {
          status:
            resultado.status,
        }
      );
    }

    return NextResponse.json(
      resultado
    );
  } catch (error) {
    console.error(
      "Error liberando pago:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo liberar el pago.",
      },
      { status: 500 }
    );
  }
}

// ============================================================
// GET
// PROCESO AUTOMÁTICO DEL SERVIDOR
//
// Busca pagos cuyo release_due_at ya venció.
// NO depende de que el profesional tenga la página abierta.
// ============================================================

export async function GET(
  request: NextRequest
) {
  try {
    const cronSecret =
      process.env.RELYDO_CRON_SECRET;

    if (!cronSecret) {
      return NextResponse.json(
        {
          success: false,
          error:
            "RELYDO_CRON_SECRET no está configurado.",
        },
        { status: 500 }
      );
    }

    const authorization =
      request.headers.get("authorization");

    if (
      authorization !==
      `Bearer ${cronSecret}`
    ) {
      return unauthorized();
    }

    const ahora =
      new Date().toISOString();

    const {
      data: duePayments,
      error: duePaymentsError,
    } = await supabaseAdmin
      .from("payments")
      .select(`
        id,
        request_id,
        release_due_at,
        released_at
      `)
      .not("release_due_at", "is", null)
      .lte("release_due_at", ahora)
      .order("release_due_at", {
        ascending: true,
      })
      .limit(50);

    if (duePaymentsError) {
      console.error(
        "Error buscando pagos con ventana vencida:",
        duePaymentsError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            duePaymentsError.message,
        },
        { status: 500 }
      );
    }

    const {
      data: pendingChangeOrders,
      error: pendingChangeOrdersError,
    } = await supabaseAdmin
      .from("change_orders")
      .select(`
        id,
        request_id,
        payment_status,
        status,
        stripe_transfer_id,
        released_at
      `)
      .eq("status", "accepted")
      .eq("payment_status", "paid")
      .is("released_at", null)
      .limit(50);

    if (pendingChangeOrdersError) {
      console.error(
        "Error buscando Change Orders pendientes de liberar:",
        pendingChangeOrdersError
      );

      return NextResponse.json(
        {
          success: false,
          error:
            pendingChangeOrdersError.message,
        },
        { status: 500 }
      );
    }

    const requestIds =
      Array.from(
        new Set([
          ...(duePayments || [])
            .filter(
              (payment) =>
                !payment.released_at
            )
            .map(
              (payment) =>
                payment.request_id
            ),

          ...(pendingChangeOrders || [])
            .map(
              (changeOrder) =>
                changeOrder.request_id
            ),
        ])
      ).slice(0, 25);

    const resultados: Array<{
      requestId: string;
      success: boolean;
      message: string;
      stripeTransferId?: string;
      changeOrderTransferIds?: string[];
    }> = [];

    for (
      const requestId of requestIds
    ) {
      const resultado =
        await procesarLiberacion({
          requestId,
          expectedProviderId: null,
          enforceReleaseWindow: true,
        });

      if (resultado.success) {
        resultados.push({
          requestId:
            resultado.requestId,
          success: true,
          message:
            resultado.alreadyReleased
              ? "Todos los pagos ya estaban liberados."
              : "Liberación procesada correctamente.",
          stripeTransferId:
            resultado.stripeTransferId,
          changeOrderTransferIds:
            resultado.changeOrderTransferIds,
        });
      } else {
        resultados.push({
          requestId,
          success: false,
          message:
            resultado.error,
        });
      }
    }

    return NextResponse.json({
      success: true,
      checked:
        requestIds.length,
      pendingOriginalPayments:
        (duePayments || []).filter(
          (payment) =>
            !payment.released_at
        ).length,
      pendingChangeOrders:
        pendingChangeOrders?.length ||
        0,
      results: resultados,
    });
  } catch (error) {
    console.error(
      "Error en liberación automática:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo ejecutar la liberación automática.",
      },
      { status: 500 }
    );
  }
}