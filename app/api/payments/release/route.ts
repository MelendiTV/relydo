import { financialPlan, financialStripe, reserveJobResolution, readJobResolution, FinancialGuardError } from "../../../lib/jobFinancialGuard";
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
  // 5A. COMPROBAR SI ESTE ES UN PAGO DE REASIGNACIÓN
  // ============================================================

  const {
    data: paymentReassignment,
    error: paymentReassignmentError,
  } = await supabaseAdmin
    .from("payment_reassignments")
    .select(`
      id,
      status,
      replacement_payment_id
    `)
    .eq("replacement_payment_id", payment.id)
    .eq("status", "applied")
    .maybeSingle();

  if (paymentReassignmentError) {
    console.error(
      "Error comprobando reasignación del pago:",
      paymentReassignmentError
    );

    return {
      success: false,
      status: 500,
      error: `No pudimos comprobar si el pago pertenece a una reasignación: ${paymentReassignmentError.message}`,
    };
  }

  const esPagoReasignado = Boolean(paymentReassignment);

  let reassignmentFundingSources: Array<{
    id: string;
    source_type: string;
    stripe_payment_intent_id: string;
    allocated_customer_amount: number | string;
    allocated_provider_amount: number | string;
    stripe_transfer_id: string | null;
    transferred_at: string | null;
  }> = [];

  if (esPagoReasignado) {
    const { data: fundingSources, error: fundingSourcesError } =
      await supabaseAdmin
        .from("payment_reassignment_funding_sources")
        .select(`
          id,
          source_type,
          stripe_payment_intent_id,
          allocated_customer_amount,
          allocated_provider_amount,
          stripe_transfer_id,
          transferred_at
        `)
        .eq("reassignment_id", paymentReassignment!.id)
        .order("created_at", { ascending: true });

    if (fundingSourcesError) {
      console.error(
        "Error buscando fuentes de fondos de la reasignación:",
        fundingSourcesError
      );

      return {
        success: false,
        status: 500,
        error: `No pudimos consultar las fuentes de fondos de la reasignación: ${fundingSourcesError.message}`,
      };
    }

    reassignmentFundingSources = fundingSources || [];

    if (reassignmentFundingSources.length === 0) {
      return {
        success: false,
        status: 409,
        reason: "reassignment_funding_missing",
        error:
          "El pago reasignado no tiene registradas sus fuentes de fondos.",
      };
    }
  }

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

  if (!esPagoReasignado && !payment.provider_payment_id) {
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
    payment.provider_net_amount == null ||
    !Number.isFinite(providerNetAmountOriginal) ||
    providerNetAmountOriginal < 0
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
    const previousResolution = await readJobResolution(supabaseAdmin, requestId, "automatic_release");
    if (previousResolution && (!Array.isArray(previousResolution.plan) || previousResolution.state === "reconciliation_required")) {
      await reserveJobResolution(supabaseAdmin, requestId, "automatic_release", previousResolution.decision, stripe);
      throw new FinancialGuardError("La liberación anterior requiere conciliación explícita.");
    }
    // Include completed sources too: an exact retry must reserve the same full plan.
    const sources: Parameters<typeof financialPlan>[1] = [];
    const addTransfer = async (key: string, paymentIntentId: string, amount: number, metadata: Stripe.MetadataParam) => {
      if (!Number.isFinite(amount) || amount < 0) throw new FinancialGuardError("El importe de la fuente no es válido.");
      if (amount === 0) return;
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      const charge = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
      sources.push({ key, paymentIntentId, transfer: {
        amount: Math.round(amount * 100), currency: (payment.currency || "usd").toLowerCase(),
        destination: providerProfile.stripe_account_id, source_transaction: charge,
        transfer_group: `relydo_request_${requestId}`, metadata: {
          request_id: String(requestId), professional_id: String(serviceRequest.preferred_provider_id),
          provider_net_amount: amount.toFixed(2), release_reason: "job_completed_after_protection_window", ...metadata,
        },
      } });
    };
    if (esPagoReasignado) {
      const allocated = reassignmentFundingSources.reduce((sum, source) => sum + Math.round(Number(source.allocated_provider_amount) * 100), 0);
      if (allocated !== Math.round(providerNetAmountOriginal * 100)) throw new FinancialGuardError("Las fuentes no coinciden con el neto del profesional.");
      for (const source of reassignmentFundingSources) {
        if (source.allocated_provider_amount == null) throw new FinancialGuardError("Falta el importe de una fuente de reasignación.");
        await addTransfer(`funding:${source.id}`, source.stripe_payment_intent_id, Number(source.allocated_provider_amount), {
          payment_id: String(payment.id), reassignment_id: String(paymentReassignment!.id),
          funding_source_id: String(source.id), funding_source_type: source.source_type, payment_type: "reassignment_funding_source",
        });
      }
    } else {
      await addTransfer(`payment:${payment.id}`, payment.provider_payment_id!, providerNetAmountOriginal, {
        payment_id: String(payment.id), offer_id: String(payment.offer_id || ""), payment_type: "original",
      });
    }
    for (const changeOrder of changeOrders) {
      if (changeOrder.additional_provider_net_amount == null) throw new FinancialGuardError("Falta el neto profesional del Change Order.");
      await addTransfer(`co:${changeOrder.id}`, changeOrder.stripe_payment_intent_id!, Number(changeOrder.additional_provider_net_amount), {
        change_order_id: String(changeOrder.id), payment_type: "change_order",
      });
    }
    const plan = await financialPlan(stripe, sources);
    await reserveJobResolution(supabaseAdmin, requestId, "automatic_release", { plan }, stripe);
    const settlement = financialStripe(stripe, supabaseAdmin, "automatic_release");
    let originalTransferId = payment.stripe_transfer_id || "";
    const originalLiberadoAhora = !pagoOriginalYaLiberado;
    const changeOrderTransferIds: string[] = [];
    // Execute the actual reserved parameters, never reconstruct a second instruction.
    for (const entry of plan) {
      const receipt = await settlement.transfer(entry.params as Stripe.TransferCreateParams);
      const now = new Date().toISOString();
      if (entry.source.changeOrderId) {
        changeOrderTransferIds.push(receipt.id);
        const existing = changeOrders.find(co => co.id === entry.source.changeOrderId);
        const { error } = await supabaseAdmin.from("change_orders").update({
          stripe_transfer_id: receipt.id, released_at: existing?.released_at || now, updated_at: now,
        }).eq("id", entry.source.changeOrderId);
        if (error) throw new Error("Stripe transfirió el adicional, pero falta registrar su liberación.");
      } else {
        if (!originalTransferId) originalTransferId = receipt.id;
        if (entry.source.fundingSourceId) {
          const existing = reassignmentFundingSources.find(source => source.id === entry.source.fundingSourceId);
          const { error } = await supabaseAdmin.from("payment_reassignment_funding_sources").update({
            stripe_transfer_id: receipt.id, transferred_at: existing?.transferred_at || now, updated_at: now,
          }).eq("id", entry.source.fundingSourceId);
          if (error) throw new Error("Stripe transfirió la fuente, pero falta registrar su liberación.");
        }
      }
    }
    const { error: releaseSaveError } = await supabaseAdmin.from("payments").update({
      released_at: payment.released_at || new Date().toISOString(), stripe_transfer_id: originalTransferId || null,
      last_release_error: null, status: "paid_out", updated_at: new Date().toISOString(),
    }).eq("id", payment.id);
    if (releaseSaveError) throw new Error("Stripe procesó la liberación, pero falta actualizar el pago.");

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
      status: transferError instanceof FinancialGuardError ? transferError.status : 500,
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
