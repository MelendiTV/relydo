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

const settlement = financialStripe(stripe, supabaseAdmin, "customer_cancel");

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

async function loadLiveFundingSources(paymentId: string, ownRefunds: OwnRefund[] = []) {
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
    // Remove only ledger projections proven to belong to this resolution's receipts.
    const own = ownRefunds.find(receipt => receipt.id === refund.stripe_refund_id);
    if (own) {
      if (own.source.fundingSourceId !== refund.funding_source_id || own.source.paymentIntentId !== refund.stripe_payment_intent_id || own.amount !== cents(refund.refunded_amount)) {
        throw new FinancialGuardError("El ledger de reembolsos no coincide con su comprobante.");
      }
      continue;
    }
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

type OwnRefund = { id: string; amount: number; source: { paymentId: string | null; paymentIntentId: string | null; fundingSourceId: string | null } };
type PlanSources = Parameters<typeof financialPlan>[1];
type LiveSource = FundingSource & { refundedAmount: number; liveCustomerAmount: number };

/** Allocate refunds newest first, then compensation oldest first from retained funds. */
async function cancellationSources({ requestId, paymentId, sources, refundAmount, awardAmount = 0,
  providerId = "", destination = "", currency = "usd", stage, reason, penaltyPercent = 0, providerPercent = 0,
}: { requestId: string; paymentId: string; sources: LiveSource[]; refundAmount: number; awardAmount?: number;
  providerId?: string; destination?: string; currency?: string; stage: string; reason: string; penaltyPercent?: number; providerPercent?: number }) {
  let refundRemaining = cents(refundAmount), awardRemaining = cents(awardAmount);
  if (!Number.isSafeInteger(refundRemaining) || refundRemaining < 0 || !Number.isSafeInteger(awardRemaining) || awardRemaining < 0) {
    throw new FinancialGuardError("Los importes de cancelación no son válidos.");
  }
  const chronological = [...sources].sort((a, b) => {
    const time = (value: LiveSource) => value.created_at ? Date.parse(value.created_at) : 0;
    return time(a) - time(b) || a.id.localeCompare(b.id);
  });
  const allocations = new Map<string, { refund: number; retained: number }>();
  for (const source of [...chronological].reverse()) {
    const live = cents(source.liveCustomerAmount);
    if (!Number.isSafeInteger(live) || live < 0) throw new FinancialGuardError("La fuente tiene un saldo inválido.");
    const refund = Math.min(refundRemaining, live);
    allocations.set(source.id, { refund, retained: live - refund });
    refundRemaining -= refund;
  }
  if (refundRemaining) throw new FinancialGuardError("Las fuentes no cubren el reembolso.");
  const result: PlanSources = [];
  for (const source of chronological) {
    const allocation = allocations.get(source.id)!;
    const award = Math.min(awardRemaining, allocation.retained);
    awardRemaining -= award;
    if (!award && !allocation.refund) continue;
    const metadata = { request_id: requestId, payment_id: paymentId, funding_source_id: source.id, cancellation_stage: stage };
    const intent = await stripe.paymentIntents.retrieve(source.stripe_payment_intent_id);
    const charge = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
    result.push({ key: `funding:${source.id}`, paymentIntentId: source.stripe_payment_intent_id,
      transfer: award ? { amount: award, currency: currency.toLowerCase(), destination, source_transaction: charge,
        transfer_group: `relydo_request_${requestId}`, metadata: { ...metadata, professional_id: providerId,
          cancellation_penalty_percent: penaltyPercent.toFixed(2), cancellation_provider_percent: providerPercent.toFixed(2),
          cancellation_provider_amount: (award / 100).toFixed(2), payment_type: "customer_cancellation_reassignment" } } : null,
      refund: allocation.refund ? { payment_intent: source.stripe_payment_intent_id, amount: allocation.refund, reason: "requested_by_customer",
        metadata: { ...metadata, cancellation_reason: reason, customer_refund_amount: (allocation.refund / 100).toFixed(2),
          payment_type: "customer_cancellation_reassignment_refund" } } : null,
    });
  }
  if (awardRemaining) throw new FinancialGuardError("Las fuentes no cubren la compensación.");
  return result;
}

async function executeCancellationPlan(requestId: string, sources: PlanSources, baselineRefundedAmount?: number) {
  const plan = await financialPlan(stripe, sources);
  const decision = baselineRefundedAmount === undefined ? { plan } : { plan, baselineRefundedAmount };
  await reserveJobResolution(supabaseAdmin, requestId, "customer_cancel", decision, stripe);
  const transfers: string[] = [], refunds: string[] = [];
  // Preserve compensation-before-refund ordering using the same reserved entries.
  for (const entry of [...plan.filter(e => e.kind === "transfer"), ...plan.filter(e => e.kind === "refund")]) {
    const receipt = entry.kind === "transfer"
      ? await settlement.transfer(entry.params as Stripe.TransferCreateParams)
      : await settlement.refund(entry.params as Stripe.RefundCreateParams);
    (entry.kind === "transfer" ? transfers : refunds).push(receipt.id);
    if (entry.kind === "refund" && entry.source.fundingSourceId) {
      const { error } = await supabaseAdmin.from("payment_reassignment_source_refunds").upsert({
        funding_source_id: entry.source.fundingSourceId, stripe_payment_intent_id: entry.source.paymentIntentId,
        stripe_refund_id: receipt.id, refunded_amount: receipt.amount / 100, refund_reason: "customer_cancellation",
      }, { onConflict: "stripe_refund_id" });
      if (error) throw new FinancialGuardError("Stripe confirmó el reembolso, pero falta registrar su ledger. Reintenta la misma cancelación.");
    }
  }
  return { transfers, refunds };
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

    if (serviceRequest.status === "in_progress" && serviceRequest.job_stage === "working") {
      throw new FinancialGuardError("El trabajo ya fue iniciado. Debe gestionarse mediante un reclamo.");
    }
    const previousResolution = await readJobResolution(supabaseAdmin, requestId, "customer_cancel");
    let ownRefunds: OwnRefund[] = [];
    if (previousResolution) {
      // This only recovers receipts; it cannot create or replace a legacy plan.
      await reserveJobResolution(supabaseAdmin, requestId, "customer_cancel", previousResolution.decision, stripe);
      const recovered = await readJobResolution(supabaseAdmin, requestId, "customer_cancel");
      ownRefunds = (recovered?.receipts || []).filter((receipt: { kind: string }) => receipt.kind === "refund");
    }
    const baselineRefunded = (current: unknown, paymentId: string) => {
      const amount = dinero(current || 0);
      const baseline = previousResolution?.decision?.baselineRefundedAmount;
      if (baseline === undefined) return amount;
      const own = ownRefunds.filter(receipt => receipt.source.paymentId === paymentId && !receipt.source.fundingSourceId)
        .reduce((sum, receipt) => sum + receipt.amount, 0);
      if (cents(amount) !== cents(baseline) && cents(amount) !== cents(baseline) + own) {
        throw new FinancialGuardError("El reembolso registrado cambió fuera de esta cancelación. Requiere conciliación.");
      }
      return Number(baseline);
    };

   if (serviceRequest.status === "cancelled") {
  if (!previousResolution) throw new FinancialGuardError("La cancelación histórica requiere conciliación explícita.");
  const { data: settled, error: settleError } = await supabaseAdmin.rpc("settle_job_financial_resolution", {
    p_request_id: requestId, p_owner: "customer_cancel",
  });
  if (settleError || !settled?.settled) throw new FinancialGuardError("La cancelación conserva pasos pendientes de conciliación.");
  const now = new Date().toISOString();

  const { error: recoveryReassignmentError } =
    await supabaseAdmin
      .from("payment_reassignments")
      .update({
        status: "cancelled",
        updated_at: now,
      })
      .eq("request_id", requestId)
      .in("status", [
        "available",
        "pending_replacement",
        "applied",
      ]);

  if (recoveryReassignmentError) {
    return NextResponse.json(
      {
        error:
          "El trabajo ya estaba cancelado, pero RELYDO no pudo terminar de cerrar la reasignación financiera. No repitas manualmente la operación.",
        requestCancelled: true,
      },
      { status: 500 }
    );
  }

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
        const { data: payments, error } = await supabaseAdmin.from("payments")
          .select("id").eq("request_id", requestId).limit(1);
        if (error || payments?.length) {
          throw new FinancialGuardError("El trabajo abierto tiene un pago sin crédito de reasignación verificable. Requiere conciliación explícita.");
        }
        await executeCancellationPlan(requestId, []);
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
      } = await loadLiveFundingSources(originalPayment.id, ownRefunds);

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

        const sources = await cancellationSources({ requestId, paymentId: originalPayment.id, sources: liveSources,
          refundAmount: customerRefundAmount, stage: "open_after_provider_release", reason });
        stripeRefundIds = (await executeCancellationPlan(requestId, sources)).refunds;
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
        const alreadyRefunded = baselineRefunded(originalPayment.refunded_amount, originalPayment.id);

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

        const sources: PlanSources = customerRefundAmount > 0 ? [{ key: `payment:${originalPayment.id}`,
          paymentIntentId: originalPayment.provider_payment_id, refund: {
            payment_intent: originalPayment.provider_payment_id, amount: cents(customerRefundAmount), reason: "requested_by_customer",
            metadata: { request_id: requestId, payment_id: String(originalPayment.id), cancellation_stage: "open_after_provider_release",
              cancellation_reason: reason, customer_refund_amount: customerRefundAmount.toFixed(2), payment_type: "customer_cancellation_open_credit_refund" },
          } }] : [];
        stripeRefundIds = (await executeCancellationPlan(requestId, sources, alreadyRefunded)).refunds;

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
      ? await loadLiveFundingSources(payment.id, ownRefunds)
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

    let sources: PlanSources;
    let previousRefunded: number | undefined;
    if (esPagoReasignado) {
      sources = await cancellationSources({ requestId, paymentId: payment.id, sources: reassignmentSources,
        refundAmount: customerRefundAmount, awardAmount: providerAwardAmount, providerId: payment.provider_id,
        destination: providerAccountId || "", currency: payment.currency || settings.currency || "usd",
        stage: serviceRequest.job_stage || "contracted", reason, penaltyPercent, providerPercent: providerJobPercent });
    } else {
      previousRefunded = baselineRefunded(payment.refunded_amount, payment.id);
      if (!Number.isFinite(previousRefunded) || previousRefunded < 0 || previousRefunded > customerRefundAmount) {
        throw new FinancialGuardError("El reembolso previo no coincide con esta cancelación.");
      }
      const refundRemaining = dinero(customerRefundAmount - previousRefunded);
      const intent = await stripe.paymentIntents.retrieve(payment.provider_payment_id!);
      const charge = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
      const metadata = { request_id: requestId, payment_id: String(payment.id),
        cancellation_stage: serviceRequest.job_stage || "contracted", cancellation_penalty_percent: penaltyPercent.toFixed(2) };
      sources = [{ key: `payment:${payment.id}`, paymentIntentId: payment.provider_payment_id!,
        transfer: providerAwardAmount > 0 ? { amount: cents(providerAwardAmount), currency: (payment.currency || settings.currency || "usd").toLowerCase(),
          destination: providerAccountId!, source_transaction: charge, transfer_group: `relydo_request_${requestId}`,
          metadata: { ...metadata, professional_id: String(payment.provider_id), cancellation_provider_percent: providerJobPercent.toFixed(2),
            cancellation_provider_amount: providerAwardAmount.toFixed(2), payment_type: "customer_cancellation" } } : null,
        refund: refundRemaining > 0 ? { payment_intent: payment.provider_payment_id!, amount: cents(refundRemaining), reason: "requested_by_customer",
          metadata: { ...metadata, customer_refund_amount: customerRefundAmount.toFixed(2), payment_type: "customer_cancellation_refund" } } : null,
      }];
    }
    const effects = await executeCancellationPlan(requestId, sources, previousRefunded);
    const stripeTransferIds = effects.transfers, stripeRefundIds = effects.refunds;
    const stripeTransferId = stripeTransferIds[0] || null, stripeRefundId = stripeRefundIds[0] || null;
    const refundStatus = stripeRefundIds.length ? "succeeded" : null;

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
    if (error instanceof FinancialGuardError) return NextResponse.json({ error: error.message }, { status: error.status });
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
