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

  return Math.round((numero + Number.EPSILON) * 100) / 100;
}

function cents(valor: unknown) {
  const amount = dinero(valor);
  if (!Number.isFinite(amount)) return NaN;
  return Math.round(amount * 100);
}

type FundingSource = {
  id: string;
  payment_id: string | null;
  source_type: string;
  stripe_payment_intent_id: string;
  allocated_customer_amount: number | string;
  allocated_provider_amount: number | string;
  stripe_transfer_id: string | null;
  transferred_at: string | null;
  created_at?: string | null;
};

type FundingSourceRefund = {
  funding_source_id: string;
  stripe_payment_intent_id: string;
  stripe_refund_id: string;
  refunded_amount: number | string;
};

async function loadLiveFundingSources(paymentId: string) {
  const { data: sources, error: sourceError } = await supabaseAdmin
    .from("payment_reassignment_funding_sources")
    .select(`
      id,
      payment_id,
      source_type,
      stripe_payment_intent_id,
      allocated_customer_amount,
      allocated_provider_amount,
      stripe_transfer_id,
      transferred_at,
      created_at
    `)
    .eq("payment_id", paymentId)
    .is("transferred_at", null)
    .order("created_at", { ascending: true });

  if (sourceError) {
    throw new Error(
      `No pudimos consultar las fuentes de fondos del pago reasignado: ${sourceError.message}`
    );
  }

  const fundingSources = (sources || []) as FundingSource[];

  if (fundingSources.length === 0) {
    return {
      sources: [] as Array<
        FundingSource & {
          refundedAmount: number;
          liveCustomerAmount: number;
        }
      >,
      liveCustomerTotal: 0,
    };
  }

  const sourceIds = fundingSources.map((source) => source.id);

  const { data: refunds, error: refundsError } = await supabaseAdmin
    .from("payment_reassignment_source_refunds")
    .select(`
      funding_source_id,
      stripe_payment_intent_id,
      stripe_refund_id,
      refunded_amount
    `)
    .in("funding_source_id", sourceIds);

  if (refundsError) {
    throw new Error(
      `No pudimos consultar los reembolsos de las fuentes de fondos: ${refundsError.message}`
    );
  }

  const refundedBySource = new Map<string, number>();

  for (const refund of (refunds || []) as FundingSourceRefund[]) {
    const current = refundedBySource.get(refund.funding_source_id) || 0;
    const amount = dinero(refund.refunded_amount);

    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error(
        `La fuente ${refund.funding_source_id} tiene un reembolso registrado inválido.`
      );
    }

    refundedBySource.set(
      refund.funding_source_id,
      dinero(current + amount)
    );
  }

  const liveSources = fundingSources.map((source) => {
    const allocated = dinero(source.allocated_customer_amount);
    const refundedAmount = dinero(refundedBySource.get(source.id) || 0);

    if (
      !Number.isFinite(allocated) ||
      allocated < 0 ||
      !Number.isFinite(refundedAmount) ||
      refundedAmount < 0 ||
      refundedAmount > allocated
    ) {
      throw new Error(
        `La fuente de fondos ${source.id} tiene importes inconsistentes.`
      );
    }

    return {
      ...source,
      refundedAmount,
      liveCustomerAmount: dinero(
        Math.max(0, allocated - refundedAmount)
      ),
    };
  });

  const liveCustomerTotal = dinero(
    liveSources.reduce(
      (total, source) => total + source.liveCustomerAmount,
      0
    )
  );

  return {
    sources: liveSources,
    liveCustomerTotal,
  };
}

async function refundAcrossFundingSources({
  requestId,
  paymentId,
  sources,
  amountToRefund,
  cancellationStage,
  reason,
}: {
  requestId: string;
  paymentId: string;
  sources: Array<
    FundingSource & {
      refundedAmount: number;
      liveCustomerAmount: number;
    }
  >;
  amountToRefund: number;
  cancellationStage: string;
  reason: string;
}) {
  let remainingCents = cents(amountToRefund);

  if (!Number.isFinite(remainingCents) || remainingCents < 0) {
    throw new Error("El importe de reembolso solicitado no es válido.");
  }

  const refundIds: string[] = [];

  // Reembolsamos primero las fuentes más recientes. Esto hace el reparto
  // determinista y mantiene el comportamiento usado en la reasignación.
  const orderedSources = [...sources].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });

  for (const source of orderedSources) {
    if (remainingCents <= 0) break;

    const liveCents = cents(source.liveCustomerAmount);

    if (!Number.isFinite(liveCents) || liveCents < 0) {
      throw new Error(
        `La fuente ${source.id} tiene un crédito vivo inválido.`
      );
    }

    if (liveCents === 0) continue;

    const refundCents = Math.min(remainingCents, liveCents);

    const refund = await stripe.refunds.create(
      {
        payment_intent: source.stripe_payment_intent_id,
        amount: refundCents,
        reason: "requested_by_customer",
        metadata: {
          request_id: String(requestId),
          payment_id: String(paymentId),
          funding_source_id: String(source.id),
          cancellation_stage: String(cancellationStage),
          cancellation_reason: String(reason),
          customer_refund_amount: (refundCents / 100).toFixed(2),
          payment_type: "customer_cancellation_reassignment_refund",
        },
      },
      {
        idempotencyKey:
          `relydo_customer_cancel_source_refund_${paymentId}_${source.id}_${refundCents}`,
      }
    );

    const { error: refundLedgerError } = await supabaseAdmin
      .from("payment_reassignment_source_refunds")
      .upsert(
        {
          funding_source_id: source.id,
          stripe_payment_intent_id: source.stripe_payment_intent_id,
          stripe_refund_id: refund.id,
          refunded_amount: refundCents / 100,
          refund_reason: "customer_cancellation",
        },
        {
          onConflict: "stripe_refund_id",
        }
      );

    if (refundLedgerError) {
      throw new Error(
        `Stripe creó el reembolso ${refund.id}, pero RELYDO no pudo registrarlo: ${refundLedgerError.message}`
      );
    }

    refundIds.push(refund.id);
    remainingCents -= refundCents;
  }

  if (remainingCents !== 0) {
    throw new Error(
      `Las fuentes de fondos no alcanzan para completar el reembolso. Faltan $${(
        remainingCents / 100
      ).toFixed(2)}.`
    );
  }

  return refundIds;
}

async function transferCancellationAwardAcrossFundingSources({
  requestId,
  paymentId,
  providerId,
  providerAccountId,
  currency,
  sources,
  providerAwardAmount,
  customerRefundAmount,
  cancellationStage,
  penaltyPercent,
  providerJobPercent,
}: {
  requestId: string;
  paymentId: string;
  providerId: string;
  providerAccountId: string;
  currency: string;
  sources: Array<
    FundingSource & {
      refundedAmount: number;
      liveCustomerAmount: number;
    }
  >;
  providerAwardAmount: number;
  customerRefundAmount: number;
  cancellationStage: string;
  penaltyPercent: number;
  providerJobPercent: number;
}) {
  const providerAwardCents = cents(providerAwardAmount);
  const refundCents = cents(customerRefundAmount);

  if (
    !Number.isFinite(providerAwardCents) ||
    providerAwardCents < 0 ||
    !Number.isFinite(refundCents) ||
    refundCents < 0
  ) {
    throw new Error("Los importes de cancelación no son válidos.");
  }

  if (providerAwardCents === 0) {
    return [] as string[];
  }

  // Calculamos cuánto quedará vivo por PI DESPUÉS del reembolso.
  // El mismo orden de refundAcrossFundingSources (más reciente primero)
  // garantiza que nunca intentemos transferir desde una parte que será reembolsada.
  let simulatedRefundRemaining = refundCents;

  const newestFirst = [...sources].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });

  const retainedBySource = new Map<string, number>();

  for (const source of newestFirst) {
    const liveCents = cents(source.liveCustomerAmount);

    if (!Number.isFinite(liveCents) || liveCents < 0) {
      throw new Error(
        `La fuente ${source.id} tiene un crédito vivo inválido.`
      );
    }

    const simulatedRefund = Math.min(
      simulatedRefundRemaining,
      liveCents
    );

    retainedBySource.set(
      source.id,
      liveCents - simulatedRefund
    );

    simulatedRefundRemaining -= simulatedRefund;
  }

  if (simulatedRefundRemaining !== 0) {
    throw new Error(
      "No hay fondos suficientes para calcular la compensación del profesional."
    );
  }

  const transferGroup = `relydo_request_${requestId}`;

  const existingTransfers = await stripe.transfers.list({
    transfer_group: transferGroup,
    limit: 100,
  });

  const cancellationTransfersForPayment =
    existingTransfers.data.filter((transfer) => {
      const samePayment =
        transfer.metadata?.payment_id === String(paymentId);
      const sameProvider =
        transfer.metadata?.professional_id === String(providerId);
      const active =
        transfer.amount > transfer.amount_reversed;

      const looksLikeCancellation =
        transfer.metadata?.payment_type ===
          "customer_cancellation_reassignment" ||
        Boolean(transfer.metadata?.cancellation_stage);

      return samePayment && sameProvider && active && looksLikeCancellation;
    });

  const existingActiveCents =
    cancellationTransfersForPayment.reduce(
      (total, transfer) =>
        total +
        (transfer.amount - transfer.amount_reversed),
      0
    );

  if (
    existingActiveCents > 0 &&
    existingActiveCents !== providerAwardCents
  ) {
    throw new Error(
      "Ya existe una compensación diferente para este pago. No se hará otra transferencia automática."
    );
  }

  if (existingActiveCents === providerAwardCents) {
    return cancellationTransfersForPayment.map(
      (transfer) => transfer.id
    );
  }

  let remainingProviderCents = providerAwardCents;
  const transferIds: string[] = [];

  // Para transferir usamos primero las fuentes más antiguas entre los
  // saldos que quedarán retenidos después del refund.
  const oldestFirst = [...sources].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return aTime - bTime;
  });

  for (const source of oldestFirst) {
    if (remainingProviderCents <= 0) break;

    const retainedCents = retainedBySource.get(source.id) || 0;
    if (retainedCents <= 0) continue;

    const transferCents = Math.min(
      remainingProviderCents,
      retainedCents
    );

    const paymentIntent = await stripe.paymentIntents.retrieve(
      source.stripe_payment_intent_id,
      {
        expand: ["latest_charge"],
      }
    );

    const latestCharge = paymentIntent.latest_charge;
    const chargeId =
      typeof latestCharge === "string"
        ? latestCharge
        : latestCharge?.id;

    if (!chargeId) {
      throw new Error(
        `No encontramos el cargo de Stripe de la fuente ${source.id}.`
      );
    }

    const transfer = await stripe.transfers.create(
      {
        amount: transferCents,
        currency: currency.toLowerCase(),
        destination: providerAccountId,
        source_transaction: chargeId,
        transfer_group: transferGroup,
        metadata: {
          request_id: String(requestId),
          payment_id: String(paymentId),
          funding_source_id: String(source.id),
          professional_id: String(providerId),
          cancellation_stage: String(cancellationStage),
          cancellation_penalty_percent: penaltyPercent.toFixed(2),
          cancellation_provider_percent: providerJobPercent.toFixed(2),
          cancellation_provider_amount: (
            transferCents / 100
          ).toFixed(2),
          payment_type: "customer_cancellation_reassignment",
        },
      },
      {
        idempotencyKey:
          `relydo_customer_cancel_reassignment_transfer_${paymentId}_${source.id}_${transferCents}`,
      }
    );

    transferIds.push(transfer.id);
    remainingProviderCents -= transferCents;
  }

  if (remainingProviderCents !== 0) {
    throw new Error(
      `No se pudo distribuir toda la compensación del profesional. Faltan $${(
        remainingProviderCents / 100
      ).toFixed(2)}.`
    );
  }

  return transferIds;
}

export async function POST(request: NextRequest) {
  try {
    // ======================================================
    // 1. VERIFICAR SESIÓN DEL CLIENTE
    // ======================================================

    const authorization =
      request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          error: "No estás autenticado.",
        },
        { status: 401 }
      );
    }

    const accessToken = authorization
      .replace("Bearer ", "")
      .trim();

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        {
          error: "No pudimos verificar tu sesión.",
        },
        { status: 401 }
      );
    }

    // Cliente autenticado para ejecutar el RPC cancel_job
    // conservando auth.uid().
    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    // ======================================================
    // 2. DATOS DE LA CANCELACIÓN
    // ======================================================

    const body = await request.json();

    const requestId = String(body.requestId || "").trim();
    const reason = String(body.reason || "").trim();

    if (!requestId) {
      return NextResponse.json(
        {
          error: "Falta el ID de la solicitud.",
        },
        { status: 400 }
      );
    }

    if (!reason) {
      return NextResponse.json(
        {
          error: "Debes indicar el motivo de la cancelación.",
        },
        { status: 400 }
      );
    }

    // ======================================================
    // 3. BUSCAR EL TRABAJO REAL
    // ======================================================

    const { data: serviceRequest, error: requestError } =
      await supabaseAdmin
        .from("service_requests")
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
          error: "No encontramos esta solicitud.",
        },
        { status: 404 }
      );
    }

    if (serviceRequest.customer_id !== user.id) {
      return NextResponse.json(
        {
          error:
            "No tienes permiso para cancelar esta solicitud.",
        },
        { status: 403 }
      );
    }

    if (serviceRequest.status === "cancelled") {
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
      serviceRequest.status !== "open" &&
      serviceRequest.status !== "in_progress"
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
      serviceRequest.status === "in_progress" &&
      serviceRequest.job_stage === "working"
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
    // 4. SOLICITUD ABIERTA
    //
    // Antes: open significaba automáticamente "sin pago".
    // Ahora puede existir crédito retenido porque uno o varios Pros
    // liberaron el trabajo.
    //
    // Política RELYDO para open_after_provider_release:
    // - NO aplicamos penalización de cancelación al cliente.
    // - El service fee original de RELYDO NO es reembolsable.
    // - Reembolsamos únicamente el importe del trabajo que siga vivo.
    // ======================================================

    if (serviceRequest.status === "open") {
      const {
        data: activeReassignment,
        error: activeReassignmentError,
      } = await supabaseAdmin
        .from("payment_reassignments")
        .select(`
          id,
          status,
          original_payment_id,
          available_credit
        `)
        .eq("request_id", requestId)
        .in("status", ["available", "pending_replacement"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeReassignmentError) {
        return NextResponse.json(
          {
            error:
              "No pudimos comprobar si existen fondos retenidos para esta solicitud.",
          },
          { status: 500 }
        );
      }

      // OPEN REALMENTE SIN DINERO
      if (!activeReassignment) {
        const { error: cancelError } =
          await supabaseUser.rpc("cancel_job", {
            p_request_id: requestId,
            p_reason: reason,
          });

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
          cancellationStage: "open",
          penaltyPercent: 0,
          penaltyAmount: 0,
          providerAwardAmount: 0,
          relydoCancellationAmount: 0,
          customerRefundAmount: 0,
        });
      }

      const {
        data: originalPayment,
        error: originalPaymentError,
      } = await supabaseAdmin
        .from("payments")
        .select(`
          id,
          request_id,
          customer_id,
          provider_id,
          customer_total_amount,
          refunded_amount,
          currency,
          status,
          payment_provider,
          provider_payment_id
        `)
        .eq("id", activeReassignment.original_payment_id)
        .maybeSingle();

      if (originalPaymentError || !originalPayment) {
        return NextResponse.json(
          {
            error:
              "Existe crédito retenido, pero no pudimos localizar su pago de origen.",
          },
          { status: 500 }
        );
      }

      if (originalPayment.customer_id !== user.id) {
        return NextResponse.json(
          {
            error:
              "El pago retenido no pertenece a este cliente.",
          },
          { status: 409 }
        );
      }

      if (originalPayment.payment_provider !== "stripe") {
        return NextResponse.json(
          {
            error:
              "El crédito retenido no pertenece a Stripe.",
          },
          { status: 400 }
        );
      }

      const {
        sources: liveSources,
        liveCustomerTotal,
      } = await loadLiveFundingSources(originalPayment.id);

      let customerRefundAmount = 0;
      let stripeRefundIds: string[] = [];

      // El service fee que conserva RELYDO es el del pago ORIGINAL
      // del cliente, no el fee de un reemplazo posterior.
      const {
        data: originalEconomicPayment,
        error: originalEconomicPaymentError,
      } = await supabaseAdmin
        .from("payments")
        .select(`
          id,
          job_amount,
          customer_fee_amount,
          customer_total_amount
        `)
        .eq("request_id", requestId)
        .eq("customer_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (
        originalEconomicPaymentError ||
        !originalEconomicPayment
      ) {
        return NextResponse.json(
          {
            error:
              "No pudimos localizar el pago original para calcular el service fee no reembolsable.",
          },
          { status: 500 }
        );
      }

      const originalJobAmount = dinero(
        originalEconomicPayment.job_amount
      );

      const originalEconomicTotal = dinero(
        originalEconomicPayment.customer_total_amount
      );

      const originalServiceFeeAmount = dinero(
        originalEconomicPayment.customer_fee_amount ??
          Math.max(
            0,
            originalEconomicTotal - originalJobAmount
          )
      );

      if (
        !Number.isFinite(originalJobAmount) ||
        originalJobAmount < 0 ||
        !Number.isFinite(originalEconomicTotal) ||
        originalEconomicTotal < 0 ||
        !Number.isFinite(originalServiceFeeAmount) ||
        originalServiceFeeAmount < 0 ||
        originalServiceFeeAmount > originalEconomicTotal
      ) {
        return NextResponse.json(
          {
            error:
              "Los importes económicos originales no son válidos.",
          },
          { status: 409 }
        );
      }

      if (liveSources.length > 0) {
        customerRefundAmount = dinero(
          Math.max(
            0,
            liveCustomerTotal - originalServiceFeeAmount
          )
        );

        if (customerRefundAmount > 0) {
          stripeRefundIds =
            await refundAcrossFundingSources({
              requestId,
              paymentId: originalPayment.id,
              sources: liveSources,
              amountToRefund: customerRefundAmount,
              cancellationStage:
                "open_after_provider_release",
              reason,
            });
        }
      } else {
        if (!originalPayment.provider_payment_id) {
          return NextResponse.json(
            {
              error:
                "Existe crédito retenido, pero no encontramos sus fuentes físicas de Stripe.",
            },
            { status: 409 }
          );
        }

        const paymentTotal = dinero(
          originalPayment.customer_total_amount
        );
        const alreadyRefunded = dinero(
          originalPayment.refunded_amount || 0
        );

        if (
          !Number.isFinite(paymentTotal) ||
          paymentTotal < 0 ||
          !Number.isFinite(alreadyRefunded) ||
          alreadyRefunded < 0 ||
          alreadyRefunded > paymentTotal
        ) {
          return NextResponse.json(
            {
              error:
                "Los importes del pago retenido no son válidos.",
            },
            { status: 409 }
          );
        }

        customerRefundAmount = dinero(
          Math.max(
            0,
            paymentTotal -
              alreadyRefunded -
              originalServiceFeeAmount
          )
        );

        if (customerRefundAmount > 0) {
          const refundCents = cents(
            customerRefundAmount
          );

          const refund = await stripe.refunds.create(
            {
              payment_intent:
                originalPayment.provider_payment_id,
              amount: refundCents,
              reason: "requested_by_customer",
              metadata: {
                request_id: String(requestId),
                payment_id: String(originalPayment.id),
                cancellation_stage:
                  "open_after_provider_release",
                cancellation_reason: String(reason),
                customer_refund_amount:
                  customerRefundAmount.toFixed(2),
                payment_type:
                  "customer_cancellation_open_credit_refund",
              },
            },
            {
              idempotencyKey:
                `relydo_customer_cancel_open_credit_refund_${originalPayment.id}_${refundCents}`,
            }
          );

          stripeRefundIds = [refund.id];
        }

        const now = new Date().toISOString();

        const { error: updateOriginalPaymentError } =
          await supabaseAdmin
            .from("payments")
            .update({
              refunded_amount: dinero(
                alreadyRefunded +
                  customerRefundAmount
              ),
              status:
                dinero(
                  alreadyRefunded +
                    customerRefundAmount
                ) >= paymentTotal
                  ? "refunded"
                  : "partially_refunded",
              cancellation_stage:
                "open_after_provider_release",
              cancellation_penalty_percent: 0,
              cancellation_penalty_amount: 0,
              cancellation_provider_amount: 0,
              cancellation_platform_amount:
                originalServiceFeeAmount,
              cancellation_processed_at: now,
              updated_at: now,
            })
            .eq("id", originalPayment.id);

        if (updateOriginalPaymentError) {
          return NextResponse.json(
            {
              error:
                "Stripe procesó el reembolso, pero RELYDO no pudo actualizar el pago de origen. No repitas manualmente la operación.",
              stripeRefundIds,
            },
            { status: 500 }
          );
        }
      }

      const { error: cancelError } =
        await supabaseUser.rpc("cancel_job", {
          p_request_id: requestId,
          p_reason: reason,
        });

      if (cancelError) {
        return NextResponse.json(
          {
            error:
              "Stripe procesó el reembolso, pero RELYDO no pudo marcar la solicitud como cancelada. El reembolso está protegido contra duplicados; revisa el estado antes de reintentar.",
            stripeRefundIds,
          },
          { status: 500 }
        );
      }

      const now = new Date().toISOString();

      const { error: closeReassignmentError } =
        await supabaseAdmin
          .from("payment_reassignments")
          .update({
            status: "cancelled",
            updated_at: now,
          })
          .eq("id", activeReassignment.id);

      if (closeReassignmentError) {
        return NextResponse.json(
          {
            error:
              "La solicitud y el reembolso ya se procesaron, pero RELYDO no pudo cerrar la reasignación. No repitas manualmente la operación.",
            requestCancelled: true,
            stripeRefundIds,
          },
          { status: 500 }
        );
      }

      // Reflejamos también el resultado económico en el payment lógico
      // que originó la reasignación cuando el crédito era heredado.
      if (liveSources.length > 0) {
        const previousRefunded = dinero(
          originalPayment.refunded_amount || 0
        );

        const { error: updateInheritedPaymentError } =
          await supabaseAdmin
            .from("payments")
            .update({
              refunded_amount: dinero(
                previousRefunded +
                  customerRefundAmount
              ),
              status:
                dinero(
                  previousRefunded +
                    customerRefundAmount
                ) >=
                dinero(
                  originalPayment.customer_total_amount
                )
                  ? "refunded"
                  : "partially_refunded",
              cancellation_stage:
                "open_after_provider_release",
              cancellation_penalty_percent: 0,
              cancellation_penalty_amount: 0,
              cancellation_provider_amount: 0,
              cancellation_platform_amount:
                originalServiceFeeAmount,
              cancellation_processed_at: now,
              updated_at: now,
            })
            .eq("id", originalPayment.id);

        if (updateInheritedPaymentError) {
          return NextResponse.json(
            {
              error:
                "La solicitud y Stripe ya quedaron resueltos, pero RELYDO no pudo actualizar el pago lógico. No repitas manualmente la operación.",
              requestCancelled: true,
              stripeRefundIds,
            },
            { status: 500 }
          );
        }
      }

      return NextResponse.json({
        success: true,
        requestId,
        cancellationStage:
          "open_after_provider_release",
        penaltyPercent: 0,
        penaltyAmount: 0,
        providerAwardAmount: 0,
        relydoCancellationAmount:
          originalServiceFeeAmount,
        customerRefundAmount,
        stripeRefundId:
          stripeRefundIds[0] || null,
        stripeRefundIds,
      });
    }

    // ======================================================
    // 5. CONFIGURACIÓN ACTIVA DE CANCELACIONES
    // ======================================================

    const { data: settings, error: settingsError } =
      await supabaseAdmin
        .from("payment_settings")
        .select(`
          id,
          customer_cancel_on_the_way_percent,
          customer_cancel_arrived_percent,
          cancellation_provider_percent,
          currency,
          active
        `)
        .eq("active", true)
        .order("created_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

    if (settingsError || !settings) {
      return NextResponse.json(
        {
          error: settingsError
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
    let penaltyPercent = 0;
    let providerJobPercent = 0;
    let relydoStagePercent = 0;

    if (
      serviceRequest.status === "in_progress" &&
      !serviceRequest.job_stage
    ) {
      penaltyPercent = 5;
      providerJobPercent = 0;
      relydoStagePercent = 5;
    }

    if (serviceRequest.job_stage === "on_the_way") {
      penaltyPercent = 12.5;
      providerJobPercent = 5.5;
      relydoStagePercent = 7;
    }

    if (serviceRequest.job_stage === "arrived") {
      penaltyPercent = 23.5;
      providerJobPercent = 12;
      relydoStagePercent = 11.5;
    }

    if (
      !Number.isFinite(penaltyPercent) ||
      penaltyPercent < 0 ||
      penaltyPercent > 100 ||
      !Number.isFinite(providerJobPercent) ||
      providerJobPercent < 0 ||
      providerJobPercent > 100 ||
      !Number.isFinite(relydoStagePercent) ||
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

    const { data: payment, error: paymentError } =
      await supabaseAdmin
        .from("payments")
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
        .eq("request_id", requestId)
        .eq("customer_id", user.id)
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

    if (payment.payment_provider !== "stripe") {
      return NextResponse.json(
        {
          error:
            "Este pago no pertenece a Stripe.",
        },
        { status: 400 }
      );
    }

    // Detectar si el pago actual fue creado por una reasignación.
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
      .in("status", ["applied", "cancelled"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentReassignmentError) {
      return NextResponse.json(
        {
          error:
            "No pudimos comprobar si este pago pertenece a una reasignación.",
        },
        { status: 500 }
      );
    }

    const esPagoReasignado =
      Boolean(paymentReassignment);

    const {
      sources: reassignmentSources,
      liveCustomerTotal:
        reassignmentLiveCustomerTotal,
    } = esPagoReasignado
      ? await loadLiveFundingSources(payment.id)
      : {
          sources: [],
          liveCustomerTotal: 0,
        };

    if (
      esPagoReasignado &&
      reassignmentSources.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "El pago reasignado no tiene registradas sus fuentes físicas de fondos.",
        },
        { status: 409 }
      );
    }

    if (
      !esPagoReasignado &&
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

    const jobAmount = dinero(payment.job_amount);
    const customerTotal = dinero(
      payment.customer_total_amount
    );

    if (
      !Number.isFinite(jobAmount) ||
      jobAmount <= 0 ||
      !Number.isFinite(customerTotal) ||
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

    if (
      esPagoReasignado &&
      dinero(reassignmentLiveCustomerTotal) !==
        dinero(customerTotal)
    ) {
      return NextResponse.json(
        {
          error:
            "Las fuentes físicas del pago reasignado no coinciden con el total económico del trabajo. No se procesó ninguna cancelación.",
        },
        { status: 409 }
      );
    }

    // ======================================================
    // 7. CALCULAR DISTRIBUCIÓN
    // ======================================================

    const serviceFeeAmount = dinero(
      payment.customer_fee_amount ??
        Math.max(0, customerTotal - jobAmount)
    );

    const penaltyAmount = dinero(
      jobAmount * (penaltyPercent / 100)
    );

    const providerAwardAmount = dinero(
      jobAmount * (providerJobPercent / 100)
    );

    const relydoStageAmount = dinero(
      jobAmount * (relydoStagePercent / 100)
    );

    const relydoCancellationAmount = dinero(
      serviceFeeAmount + relydoStageAmount
    );

    const customerRefundAmount = dinero(
      Math.max(0, jobAmount - penaltyAmount)
    );

    if (
      !Number.isFinite(serviceFeeAmount) ||
      serviceFeeAmount < 0 ||
      !Number.isFinite(penaltyAmount) ||
      !Number.isFinite(providerAwardAmount) ||
      !Number.isFinite(relydoStageAmount) ||
      !Number.isFinite(relydoCancellationAmount) ||
      !Number.isFinite(customerRefundAmount)
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
    // 8. PREVALIDAR STRIPE CONNECT DEL PROFESIONAL
    // ======================================================

    let providerAccountId: string | null = null;

    if (providerAwardAmount > 0) {
      const {
        data: providerProfile,
        error: providerProfileError,
      } = await supabaseAdmin
        .from("provider_profiles")
        .select(`
          user_id,
          stripe_account_id
        `)
        .eq("user_id", payment.provider_id)
        .maybeSingle();

      if (providerProfileError) {
        return NextResponse.json(
          {
            error:
              "No pudimos consultar la configuración de pagos del profesional.",
          },
          { status: 500 }
        );
      }

      if (!providerProfile?.stripe_account_id) {
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
        account.capabilities?.transfers !== "active"
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
    }

    // ======================================================
    // 9. COMPENSAR AL PROFESIONAL
    // ======================================================

    let stripeTransferId: string | null = null;
    let stripeTransferIds: string[] = [];

    if (providerAwardAmount > 0) {
      if (
        esPagoReasignado &&
        providerAccountId
      ) {
        stripeTransferIds =
          await transferCancellationAwardAcrossFundingSources(
            {
              requestId,
              paymentId: payment.id,
              providerId: payment.provider_id,
              providerAccountId,
              currency:
                payment.currency ||
                settings.currency ||
                "usd",
              sources: reassignmentSources,
              providerAwardAmount,
              customerRefundAmount,
              cancellationStage:
                serviceRequest.job_stage ||
                "contracted",
              penaltyPercent,
              providerJobPercent,
            }
          );

        stripeTransferId =
          stripeTransferIds[0] || null;
      } else if (
        !esPagoReasignado &&
        providerAccountId &&
        payment.provider_payment_id
      ) {
        const transferGroup =
          `relydo_request_${requestId}`;

        const existingTransfers =
          await stripe.transfers.list({
            transfer_group: transferGroup,
            limit: 100,
          });

        const matchingTransfers =
          existingTransfers.data.filter(
            (transfer) => {
              const samePayment =
                transfer.metadata?.payment_id ===
                String(payment.id);
              const sameProvider =
                transfer.metadata
                  ?.professional_id ===
                String(payment.provider_id);
              const active =
                transfer.amount >
                transfer.amount_reversed;
              const looksLikeCancellation =
                Boolean(
                  transfer.metadata
                    ?.cancellation_stage
                );

              return (
                samePayment &&
                sameProvider &&
                active &&
                looksLikeCancellation
              );
            }
          );

        const activeTransferredCents =
          matchingTransfers.reduce(
            (total, transfer) =>
              total +
              (transfer.amount -
                transfer.amount_reversed),
            0
          );

        const expectedProviderCents =
          cents(providerAwardAmount);

        if (
          activeTransferredCents > 0 &&
          activeTransferredCents !==
            expectedProviderCents
        ) {
          return NextResponse.json(
            {
              error:
                "Ya existe una transferencia diferente para este pago. No se hará una distribución automática para evitar duplicar dinero.",
            },
            { status: 409 }
          );
        }

        if (
          activeTransferredCents ===
            expectedProviderCents &&
          matchingTransfers.length > 0
        ) {
          stripeTransferIds =
            matchingTransfers.map(
              (transfer) => transfer.id
            );
          stripeTransferId =
            stripeTransferIds[0] || null;
        } else {
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
              : latestCharge?.id || null;

          if (!chargeId) {
            return NextResponse.json(
              {
                error:
                  "No encontramos el cargo original de Stripe.",
              },
              { status: 500 }
            );
          }

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
                    String(requestId),
                  payment_id:
                    String(payment.id),
                  professional_id:
                    String(payment.provider_id),
                  cancellation_stage:
                    String(
                      serviceRequest.job_stage ||
                        "contracted"
                    ),
                  cancellation_penalty_percent:
                    penaltyPercent.toFixed(2),
                  cancellation_provider_percent:
                    providerJobPercent.toFixed(
                      2
                    ),
                  cancellation_provider_amount:
                    providerAwardAmount.toFixed(
                      2
                    ),
                  payment_type:
                    "customer_cancellation",
                },
              },
              {
                idempotencyKey:
                  `relydo_customer_cancel_transfer_${payment.id}_${expectedProviderCents}`,
              }
            );

          stripeTransferId = transfer.id;
          stripeTransferIds = [
            transfer.id,
          ];
        }
      }
    }

    // ======================================================
    // 10. REEMBOLSAR AL CLIENTE
    // ======================================================

    let stripeRefundId: string | null = null;
    let stripeRefundIds: string[] = [];
    let refundStatus: string | null = null;

    if (esPagoReasignado) {
      if (customerRefundAmount > 0) {
        stripeRefundIds =
          await refundAcrossFundingSources({
            requestId,
            paymentId: payment.id,
            sources: reassignmentSources,
            amountToRefund:
              customerRefundAmount,
            cancellationStage:
              serviceRequest.job_stage ||
              "contracted",
            reason,
          });

        stripeRefundId =
          stripeRefundIds[0] || null;
        refundStatus =
          stripeRefundIds.length > 0
            ? "succeeded"
            : null;
      }
    } else {
      const previousRefunded = dinero(
        payment.refunded_amount || 0
      );

      if (
        !Number.isFinite(previousRefunded) ||
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

      const refundRemaining = dinero(
        customerRefundAmount -
          previousRefunded
      );

      if (refundRemaining > 0) {
        const refund =
          await stripe.refunds.create(
            {
              payment_intent:
                payment.provider_payment_id!,
              amount:
                cents(refundRemaining),
              reason:
                "requested_by_customer",
              metadata: {
                request_id:
                  String(requestId),
                payment_id:
                  String(payment.id),
                cancellation_stage:
                  String(
                    serviceRequest.job_stage ||
                      "contracted"
                  ),
                cancellation_penalty_percent:
                  penaltyPercent.toFixed(2),
                customer_refund_amount:
                  customerRefundAmount.toFixed(
                    2
                  ),
                payment_type:
                  "customer_cancellation_refund",
              },
            },
            {
              idempotencyKey:
                `relydo_customer_cancel_refund_${payment.id}_${cents(
                  customerRefundAmount
                )}`,
            }
          );

        stripeRefundId = refund.id;
        stripeRefundIds = [refund.id];
        refundStatus = refund.status;
      }
    }

    // ======================================================
    // 11. CANCELAR LA SOLICITUD EN SUPABASE
    // ======================================================

    const { error: cancelError } =
      await supabaseUser.rpc("cancel_job", {
        p_request_id: requestId,
        p_reason: reason,
      });

    if (cancelError) {
      return NextResponse.json(
        {
          error:
            "Stripe procesó la distribución, pero RELYDO no pudo marcar la solicitud como cancelada. Las operaciones económicas están protegidas contra duplicados; revisa el estado antes de reintentar.",
          stripeTransferId,
          stripeTransferIds,
          stripeRefundId,
          stripeRefundIds,
        },
        { status: 500 }
      );
    }

    // ======================================================
    // 12. GUARDAR RESULTADO ECONÓMICO
    // ======================================================

    const now = new Date().toISOString();

    const { error: updatePaymentError } =
      await supabaseAdmin
        .from("payments")
        .update({
          status: "cancelled",
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
          updated_at: now,
        })
        .eq("id", payment.id);

    if (updatePaymentError) {
      return NextResponse.json(
        {
          error:
            "La solicitud ya quedó cancelada y Stripe procesó la distribución, pero RELYDO no pudo actualizar payments. No repitas manualmente la operación.",
          requestCancelled: true,
          stripeTransferId,
          stripeTransferIds,
          stripeRefundId,
          stripeRefundIds,
        },
        { status: 500 }
      );
    }

    if (paymentReassignment) {
      const {
        error:
          updateReassignmentError,
      } = await supabaseAdmin
        .from("payment_reassignments")
        .update({
          status: "cancelled",
          updated_at: now,
        })
        .eq("id", paymentReassignment.id);

      if (updateReassignmentError) {
        return NextResponse.json(
          {
            error:
              "La solicitud, Stripe y el pago ya quedaron resueltos, pero RELYDO no pudo cerrar la reasignación. No repitas manualmente la operación.",
            requestCancelled: true,
            stripeTransferId,
            stripeTransferIds,
            stripeRefundId,
            stripeRefundIds,
          },
          { status: 500 }
        );
      }
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
          title:
            "Trabajo cancelado por el cliente",
          titleEn:
            "Job cancelled by the customer",
          message: `${
            serviceRequest.title ||
            "Trabajo RELYDO"
          }: el cliente canceló el trabajo.${
            providerAwardAmount > 0
              ? ` Compensación por cancelación: $${providerAwardAmount.toFixed(
                  2
                )}.`
              : ""
          }`,
          messageEn: `${
            serviceRequest.title ||
            "RELYDO job"
          }: the customer cancelled the job.${
            providerAwardAmount > 0
              ? ` Cancellation compensation: $${providerAwardAmount.toFixed(
                  2
                )}.`
              : ""
          }`,
          requestId,
          url: `/trabajos/${requestId}`,
        });
      } catch (notificationError) {
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
      stripeTransferIds,
      stripeRefundId,
      stripeRefundIds,
      refundStatus,
    });
  } catch (error) {
    console.error(
      "Error procesando cancelación del cliente:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo procesar la cancelación.",
      },
      { status: 500 }
    );
  }
}
