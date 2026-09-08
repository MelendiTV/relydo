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

async function notifyProviderHired({
  providerId,
  requestId,
  title,
}: {
  providerId: string;
  requestId: string;
  title: string | null;
}) {
  try {
    await sendRelydoNotification({
      userId: providerId,
      type: "provider_hired",
      title: "¡Has sido contratado!",
      titleEn: "You have been hired!",
      message: `${
        title || "Trabajo RELYDO"
      }: el cliente confirmó el pago y te contrató para realizar este trabajo.`,
      messageEn: `${
        title || "RELYDO job"
      }: the customer confirmed payment and hired you for this job.`,
      requestId,
      url: `/trabajos/${requestId}`,
    });
  } catch (notificationError) {
    console.warn(
      "La contratación quedó confirmada, pero no pudimos notificar al profesional:",
      notificationError
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // ============================================================
    // 1. AUTENTICACIÓN
    // ============================================================

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

    // ============================================================
    // 2. CHECKOUT SESSION
    // ============================================================

    const body = await request.json();

    const sessionId = String(
      body?.sessionId || ""
    ).trim();

    if (!sessionId) {
      return NextResponse.json(
        {
          error:
            "Falta el ID de la sesión de Stripe.",
        },
        { status: 400 }
      );
    }

    const session =
      await stripe.checkout.sessions.retrieve(
        sessionId,
        {
          expand: ["payment_intent"],
        }
      );

    if (session.payment_status !== "paid") {
      return NextResponse.json(
        {
          error:
            "Stripe todavía no confirma este pago.",
          paymentStatus:
            session.payment_status,
        },
        { status: 400 }
      );
    }

    const paymentType =
      session.metadata?.payment_type ||
      "initial_job";

    if (
      paymentType !== "initial_job" &&
      paymentType !==
        "replacement_job_additional"
    ) {
      return NextResponse.json(
        {
          error:
            "Esta sesión de Stripe no corresponde a un pago de trabajo compatible con este endpoint.",
        },
        { status: 400 }
      );
    }

    // ============================================================
    // 3. DATOS COMUNES
    // ============================================================

    const requestId =
      session.metadata?.request_id;

    const offerId =
      session.metadata?.offer_id;

    const metadataCustomerId =
      session.metadata?.customer_id;

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

    const paymentIntent =
      session.payment_intent;

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

    const stripeCustomerId =
      typeof session.customer === "string"
        ? session.customer
        : null;

    // ============================================================
    // 4. REASIGNACIÓN CON COBRO ADICIONAL
    // ============================================================

    if (
      paymentType ===
      "replacement_job_additional"
    ) {
      const reassignmentId =
        session.metadata?.reassignment_id;

      const originalPaymentId =
        session.metadata?.original_payment_id;

      if (
        !reassignmentId ||
        !originalPaymentId
      ) {
        const refund =
          await refundUnexpectedPayment(
            paymentIntentId,
            session.id
          );

        return NextResponse.json(
          {
            error: refund.ok
              ? "La sesión de reasignación estaba incompleta. El cobro adicional fue reembolsado automáticamente."
              : "La sesión de reasignación estaba incompleta y no pudimos reembolsar automáticamente el cobro adicional.",
            refunded: refund.ok,
            refundId: refund.refundId,
          },
          {
            status: refund.ok
              ? 409
              : 500,
          }
        );
      }

      // ----------------------------------------------------------
      // 4A. IMPORTES CONGELADOS EN STRIPE
      // ----------------------------------------------------------

      const jobAmount = money(
        Number(
          session.metadata
            ?.professional_price || 0
        )
      );

      const customerFeePercent = money(
        Number(
          session.metadata
            ?.customer_fee_percent || 0
        )
      );

      const customerFeeAmount = money(
        Number(
          session.metadata
            ?.customer_fee_amount || 0
        )
      );

      const customerTotalAmount = money(
        Number(
          session.metadata
            ?.customer_total || 0
        )
      );

      const providerCommissionPercent =
        money(
          Number(
            session.metadata
              ?.provider_commission_percent ||
              0
          )
        );

      const providerCommissionAmount =
        money(
          Number(
            session.metadata
              ?.provider_commission_amount ||
              0
          )
        );

      const providerNetAmount = money(
        Number(
          session.metadata
            ?.provider_net_amount || 0
        )
      );

      const platformRevenueAmount =
        money(
          Number(
            session.metadata
              ?.platform_revenue_amount ||
              0
          )
        );

      const availableCredit = money(
        Number(
          session.metadata
            ?.available_credit || 0
        )
      );

      const creditUsedAmount = money(
        Number(
          session.metadata
            ?.credit_used_amount || 0
        )
      );

      const additionalChargeAmount =
        money(
          Number(
            session.metadata
              ?.additional_charge_amount ||
              0
          )
        );

      const refundAmount = money(
        Number(
          session.metadata
            ?.refund_amount || 0
        )
      );

      const currency = String(
        session.metadata?.currency ||
          session.currency ||
          "usd"
      ).toUpperCase();

      const financialValues = [
        jobAmount,
        customerFeePercent,
        customerFeeAmount,
        customerTotalAmount,
        providerCommissionPercent,
        providerCommissionAmount,
        providerNetAmount,
        platformRevenueAmount,
        availableCredit,
        creditUsedAmount,
        additionalChargeAmount,
        refundAmount,
      ];

      if (
        financialValues.some(
          (value) =>
            !Number.isFinite(value)
        ) ||
        jobAmount <= 0 ||
        customerTotalAmount <= 0 ||
        providerNetAmount <= 0 ||
        availableCredit <= 0 ||
        creditUsedAmount <= 0 ||
        additionalChargeAmount <= 0 ||
        refundAmount !== 0
      ) {
        const refund =
          await refundUnexpectedPayment(
            paymentIntentId,
            session.id
          );

        return NextResponse.json(
          {
            error: refund.ok
              ? "Los importes de la reasignación no son válidos. El cobro adicional fue reembolsado automáticamente."
              : "Los importes de la reasignación no son válidos y el reembolso automático falló.",
            refunded: refund.ok,
            refundId: refund.refundId,
          },
          {
            status: refund.ok
              ? 409
              : 500,
          }
        );
      }

      // Stripe debe haber cobrado SOLAMENTE la diferencia.
      const stripeTotal =
        typeof session.amount_total ===
        "number"
          ? money(
              session.amount_total / 100
            )
          : null;

      if (
        stripeTotal === null ||
        Math.abs(
          stripeTotal -
            additionalChargeAmount
        ) > 0.01
      ) {
        const refund =
          await refundUnexpectedPayment(
            paymentIntentId,
            session.id
          );

        return NextResponse.json(
          {
            error: refund.ok
              ? "El importe cobrado por Stripe no coincide con la diferencia de la reasignación. El cobro fue reembolsado."
              : "El importe cobrado por Stripe no coincide con la reasignación y el reembolso automático falló.",
            refunded: refund.ok,
            refundId: refund.refundId,
          },
          {
            status: refund.ok
              ? 409
              : 500,
          }
        );
      }

      // ----------------------------------------------------------
      // 4B. REASIGNACIÓN
      // ----------------------------------------------------------

      const {
        data: reassignment,
        error: reassignmentError,
      } = await supabaseAdmin
        .from("payment_reassignments")
        .select(`
          id,
          request_id,
          original_payment_id,
          original_provider_id,
          replacement_offer_id,
          replacement_provider_id,
          replacement_payment_id,
          available_credit,
          credit_used_amount,
          additional_charge_amount,
          refund_amount,
          status,
          stripe_checkout_session_id,
          stripe_additional_payment_intent_id,
          applied_at
        `)
        .eq("id", reassignmentId)
        .maybeSingle();

      if (
        reassignmentError ||
        !reassignment
      ) {
        const refund =
          await refundUnexpectedPayment(
            paymentIntentId,
            session.id
          );

        return NextResponse.json(
          {
            error: refund.ok
              ? "No encontramos la reasignación correspondiente. El cobro adicional fue reembolsado."
              : "No encontramos la reasignación y el reembolso automático falló.",
            refunded: refund.ok,
            refundId: refund.refundId,
          },
          {
            status: refund.ok
              ? 409
              : 500,
          }
        );
      }

      // ----------------------------------------------------------
      // 4C. IDEMPOTENCIA: YA APLICADA
      // ----------------------------------------------------------

      if (
        reassignment.status ===
        "applied"
      ) {
        if (
          reassignment
            .stripe_additional_payment_intent_id ===
          paymentIntentId
        ) {
          return NextResponse.json({
            success: true,
            paymentConfirmed: true,
            reassignmentApplied: true,
            alreadyProcessed: true,
            fundsReleasedToProvider:
              false,
            requestId,
            offerId,
            professionalId:
              metadataProfessionalId,
            reassignmentId,
            paymentStatus:
              session.payment_status,
          });
        }

        const refund =
          await refundUnexpectedPayment(
            paymentIntentId,
            session.id
          );

        return NextResponse.json(
          {
            error: refund.ok
              ? "Esta reasignación ya había sido completada con otro pago. El cobro duplicado fue reembolsado."
              : "Esta reasignación ya había sido completada y no pudimos reembolsar automáticamente el cobro duplicado.",
            duplicatePayment: true,
            refunded: refund.ok,
            refundId: refund.refundId,
          },
          {
            status: refund.ok
              ? 409
              : 500,
          }
        );
      }

      if (
        reassignment.status !==
          "pending_replacement" ||
        reassignment.request_id !==
          requestId ||
        reassignment.original_payment_id !==
          originalPaymentId ||
        reassignment.replacement_offer_id !==
          offerId ||
        reassignment.replacement_provider_id !==
          metadataProfessionalId ||
        reassignment
          .stripe_checkout_session_id !==
          session.id
      ) {
        const refund =
          await refundUnexpectedPayment(
            paymentIntentId,
            session.id
          );

        return NextResponse.json(
          {
            error: refund.ok
              ? "La reasignación cambió antes de confirmar el pago. El cobro adicional fue reembolsado automáticamente."
              : "La reasignación cambió antes de confirmar el pago y el reembolso automático falló.",
            refunded: refund.ok,
            refundId: refund.refundId,
          },
          {
            status: refund.ok
              ? 409
              : 500,
          }
        );
      }

      // ----------------------------------------------------------
      // 4D. OFERTA
      // ----------------------------------------------------------

      const {
        data: replacementOffer,
        error: replacementOfferError,
      } = await supabaseAdmin
        .from("offers")
        .select(
          "id, request_id, professional_id, price, status"
        )
        .eq("id", offerId)
        .eq("request_id", requestId)
        .maybeSingle();

      if (
        replacementOfferError ||
        !replacementOffer
      ) {
        const refund =
          await refundUnexpectedPayment(
            paymentIntentId,
            session.id
          );

        return NextResponse.json(
          {
            error: refund.ok
              ? "La oferta sustituta ya no está disponible. El cobro adicional fue reembolsado."
              : "La oferta sustituta ya no está disponible y el reembolso automático falló.",
            refunded: refund.ok,
            refundId: refund.refundId,
          },
          {
            status: refund.ok
              ? 409
              : 500,
          }
        );
      }

      if (
        replacementOffer.professional_id !==
          metadataProfessionalId ||
        replacementOffer.status !==
          "pending" ||
        Math.abs(
          money(
            Number(
              replacementOffer.price
            )
          ) - jobAmount
        ) > 0.01
      ) {
        const refund =
          await refundUnexpectedPayment(
            paymentIntentId,
            session.id
          );

        return NextResponse.json(
          {
            error: refund.ok
              ? "La oferta sustituta cambió antes de confirmar el pago. El cobro adicional fue reembolsado."
              : "La oferta sustituta cambió y el reembolso automático falló.",
            refunded: refund.ok,
            refundId: refund.refundId,
          },
          {
            status: refund.ok
              ? 409
              : 500,
          }
        );
      }

      // ----------------------------------------------------------
      // 4E. SOLICITUD
      // ----------------------------------------------------------

      const {
        data: replacementRequest,
        error: replacementRequestError,
      } = await supabaseAdmin
        .from("service_requests")
        .select(
          "id, title, customer_id, status, preferred_provider_id"
        )
        .eq("id", requestId)
        .maybeSingle();

      if (
        replacementRequestError ||
        !replacementRequest
      ) {
        const refund =
          await refundUnexpectedPayment(
            paymentIntentId,
            session.id
          );

        return NextResponse.json(
          {
            error: refund.ok
              ? "La solicitud ya no está disponible. El cobro adicional fue reembolsado."
              : "La solicitud ya no está disponible y el reembolso automático falló.",
            refunded: refund.ok,
            refundId: refund.refundId,
          },
          {
            status: refund.ok
              ? 409
              : 500,
          }
        );
      }

      if (
        replacementRequest.customer_id !==
          metadataCustomerId ||
        replacementRequest.status !==
          "open" ||
        replacementRequest
          .preferred_provider_id !==
          null
      ) {
        const refund =
          await refundUnexpectedPayment(
            paymentIntentId,
            session.id
          );

        return NextResponse.json(
          {
            error: refund.ok
              ? "La solicitud cambió antes de confirmar la reasignación. El cobro adicional fue reembolsado."
              : "La solicitud cambió y el reembolso automático falló.",
            refunded: refund.ok,
            refundId: refund.refundId,
          },
          {
            status: refund.ok
              ? 409
              : 500,
          }
        );
      }

      // ----------------------------------------------------------
      // 4F. PAGO ORIGINAL / FUENTES HEREDADAS
      // ----------------------------------------------------------

      const {
        data: originalPayment,
        error: originalPaymentError,
      } = await supabaseAdmin
        .from("payments")
        .select(`
          id,
          request_id,
          provider_id,
          customer_total_amount,
          refunded_amount,
          status,
          payment_provider,
          provider_payment_id,
          paid_at,
          released_at,
          stripe_transfer_id
        `)
        .eq("id", originalPaymentId)
        .maybeSingle();

      if (originalPaymentError || !originalPayment) {
        const refund =
          await refundUnexpectedPayment(
            paymentIntentId,
            session.id
          );

        return NextResponse.json(
          {
            error: refund.ok
              ? "No encontramos el pago original retenido. El cobro adicional fue reembolsado."
              : "No encontramos el pago original retenido y el reembolso automático falló.",
            refunded: refund.ok,
            refundId: refund.refundId,
          },
          { status: refund.ok ? 409 : 500 }
        );
      }

      /*
       * Un payment creado por una reasignación anterior puede no tener
       * provider_payment_id. En ese caso sus dólares físicos viven en
       * payment_reassignment_funding_sources.
       */
      const {
        data: inheritedSources,
        error: inheritedSourcesError,
      } = await supabaseAdmin
        .from("payment_reassignment_funding_sources")
        .select(`
          id,
          stripe_payment_intent_id,
          allocated_customer_amount,
          stripe_transfer_id,
          transferred_at
        `)
        .eq("payment_id", originalPayment.id)
        .is("stripe_transfer_id", null)
        .is("transferred_at", null);

      if (inheritedSourcesError) {
        console.error(
          "RELYDO: no pudimos leer las fuentes heredadas de la reasignación:",
          inheritedSourcesError
        );

        const refund =
          await refundUnexpectedPayment(
            paymentIntentId,
            session.id
          );

        return NextResponse.json(
          {
            error: refund.ok
              ? "No pudimos verificar el crédito anterior. El cobro adicional fue reembolsado."
              : "No pudimos verificar el crédito anterior y el reembolso automático falló.",
            refunded: refund.ok,
            refundId: refund.refundId,
          },
          { status: refund.ok ? 409 : 500 }
        );
      }

      const hasInheritedSources =
        Array.isArray(inheritedSources) &&
        inheritedSources.length > 0;

      if (
        originalPayment.request_id !== requestId ||
        originalPayment.provider_id !==
          reassignment.original_provider_id ||
        originalPayment.payment_provider !== "stripe" ||
        (!originalPayment.provider_payment_id &&
          !hasInheritedSources) ||
        !originalPayment.paid_at ||
        originalPayment.released_at ||
        originalPayment.stripe_transfer_id ||
        ![
          "paid",
          "ready_for_payout",
          "partially_refunded",
        ].includes(String(originalPayment.status))
      ) {
        const refund =
          await refundUnexpectedPayment(
            paymentIntentId,
            session.id
          );

        return NextResponse.json(
          {
            error: refund.ok
              ? "El crédito del pago anterior ya no puede utilizarse. El nuevo cobro fue reembolsado."
              : "El crédito anterior ya no puede utilizarse y el reembolso automático falló.",
            refunded: refund.ok,
            refundId: refund.refundId,
          },
          { status: refund.ok ? 409 : 500 }
        );
      }

      // ----------------------------------------------------------
      // 4G. REVALIDAR EL CRÉDITO REAL
      // ----------------------------------------------------------

      const storedAvailableCredit = money(
        Number(reassignment.available_credit || 0)
      );

      let liveAvailableCredit = 0;

      if (hasInheritedSources) {
        const sourceIds = inheritedSources.map(
          (source) => source.id
        );

        const {
          data: sourceRefunds,
          error: sourceRefundsError,
        } = await supabaseAdmin
          .from("payment_reassignment_source_refunds")
          .select("funding_source_id, refunded_amount")
          .in("funding_source_id", sourceIds);

        if (sourceRefundsError) {
          console.error(
            "RELYDO: no pudimos leer los refunds de las fuentes heredadas:",
            sourceRefundsError
          );

          const refund =
            await refundUnexpectedPayment(
              paymentIntentId,
              session.id
            );

          return NextResponse.json(
            {
              error: refund.ok
                ? "No pudimos verificar los reembolsos del crédito anterior. El cobro adicional fue reembolsado."
                : "No pudimos verificar los reembolsos del crédito anterior y el reembolso automático falló.",
              refunded: refund.ok,
              refundId: refund.refundId,
            },
            { status: refund.ok ? 409 : 500 }
          );
        }

        const refundedBySource = new Map<string, number>();

        for (const row of sourceRefunds || []) {
          const sourceId = String(row.funding_source_id);
          refundedBySource.set(
            sourceId,
            money(
              (refundedBySource.get(sourceId) || 0) +
                Number(row.refunded_amount || 0)
            )
          );
        }

        liveAvailableCredit = money(
          inheritedSources.reduce(
            (sum, source) =>
              sum +
              Math.max(
                0,
                Number(
                  source.allocated_customer_amount || 0
                ) -
                  (refundedBySource.get(
                    String(source.id)
                  ) || 0)
              ),
            0
          )
        );
      } else {
        const originalCustomerTotal = money(
          Number(
            originalPayment.customer_total_amount || 0
          )
        );

        const alreadyRefunded = money(
          Number(originalPayment.refunded_amount || 0)
        );

        liveAvailableCredit = money(
          Math.max(
            0,
            originalCustomerTotal - alreadyRefunded
          )
        );
      }

      const currentAvailableCredit = money(
        Math.min(
          storedAvailableCredit,
          liveAvailableCredit
        )
      );

      const expectedCreditUsed =
        money(
          Math.min(
            currentAvailableCredit,
            customerTotalAmount
          )
        );

      const expectedAdditionalCharge =
        money(
          Math.max(
            0,
            customerTotalAmount -
              currentAvailableCredit
          )
        );

      const expectedRefundAmount =
        money(
          Math.max(
            0,
            currentAvailableCredit -
              customerTotalAmount
          )
        );

      if (
        expectedAdditionalCharge <= 0 ||
        expectedRefundAmount !== 0 ||
        Math.abs(
          expectedCreditUsed -
            creditUsedAmount
        ) > 0.01 ||
        Math.abs(
          expectedAdditionalCharge -
            additionalChargeAmount
        ) > 0.01
      ) {
        const refund =
          await refundUnexpectedPayment(
            paymentIntentId,
            session.id
          );

        return NextResponse.json(
          {
            error: refund.ok
              ? "El crédito disponible cambió antes de finalizar el pago. El cobro adicional fue reembolsado."
              : "El crédito disponible cambió y el reembolso automático falló.",
            refunded: refund.ok,
            refundId: refund.refundId,
          },
          {
            status: refund.ok
              ? 409
              : 500,
          }
        );
      }

      // ----------------------------------------------------------
      // 4H. FINALIZAR ATÓMICAMENTE
      // ----------------------------------------------------------

      const {
        data: finalized,
        error: finalizeError,
      } = await supabaseAdmin.rpc(
        "finalize_payment_reassignment",
        {
          p_reassignment_id:
            reassignmentId,

          p_customer_id:
            metadataCustomerId,

          p_customer_fee_percent:
            customerFeePercent,

          p_customer_fee_amount:
            customerFeeAmount,

          p_customer_total_amount:
            customerTotalAmount,

          p_provider_commission_percent:
            providerCommissionPercent,

          p_provider_commission_amount:
            providerCommissionAmount,

          p_provider_net_amount:
            providerNetAmount,

          p_platform_revenue_amount:
            platformRevenueAmount,

          p_currency:
            currency,

          p_additional_payment_intent_id:
            paymentIntentId,

          p_stripe_customer_id:
            stripeCustomerId,
        }
      );

      if (finalizeError) {
        console.error(
          "RELYDO: Stripe confirmó el pago adicional, pero finalize_payment_reassignment devolvió error:",
          finalizeError
        );

        /*
         * Antes de devolver el dinero comprobamos si la transacción
         * realmente llegó a aplicarse.
         *
         * Esto protege contra un retry o una respuesta incierta
         * después de que PostgreSQL ya haya hecho COMMIT.
         */
        const {
          data: currentReassignment,
          error:
            currentReassignmentError,
        } = await supabaseAdmin
          .from(
            "payment_reassignments"
          )
          .select(`
            id,
            status,
            stripe_additional_payment_intent_id,
            replacement_payment_id
          `)
          .eq(
            "id",
            reassignmentId
          )
          .maybeSingle();

        if (
          !currentReassignmentError &&
          currentReassignment?.status ===
            "applied" &&
          currentReassignment
            .stripe_additional_payment_intent_id ===
            paymentIntentId
        ) {
          return NextResponse.json({
            success: true,
            paymentConfirmed: true,
            reassignmentApplied: true,
            alreadyProcessed: true,
            fundsReleasedToProvider:
              false,
            requestId,
            offerId,
            professionalId:
              metadataProfessionalId,
            reassignmentId,
            replacementPaymentId:
              currentReassignment
                .replacement_payment_id,
            paymentStatus:
              session.payment_status,
          });
        }

        /*
         * Si PostgreSQL NO aplicó la reasignación,
         * el cobro adicional no debe quedarse retenido.
         */
        const refund =
          await refundUnexpectedPayment(
            paymentIntentId,
            session.id
          );

        return NextResponse.json(
          {
            error: refund.ok
              ? "Stripe confirmó el cobro adicional, pero RELYDO no pudo finalizar la reasignación. El cobro adicional fue reembolsado automáticamente."
              : "Stripe confirmó el cobro adicional, RELYDO no pudo finalizar la reasignación y el reembolso automático también falló. Requiere revisión administrativa.",
            reassignmentFinalizationFailed:
              true,
            refunded: refund.ok,
            refundId: refund.refundId,
          },
          {
            status: refund.ok
              ? 409
              : 500,
          }
        );
      }

      const alreadyApplied =
        Boolean(
          finalized?.already_applied
        );

      if (!alreadyApplied) {
        await notifyProviderHired({
          providerId:
            metadataProfessionalId,
          requestId,
          title:
            replacementRequest.title,
        });
      }

      return NextResponse.json({
        success: true,
        paymentConfirmed: true,
        reassignmentApplied: true,
        alreadyProcessed:
          alreadyApplied,
        fundsReleasedToProvider: false,
        requestId,
        offerId,
        professionalId:
          metadataProfessionalId,
        reassignmentId,
        replacementPaymentId:
          finalized
            ?.replacement_payment_id ||
          null,
        paymentStatus:
          session.payment_status,

        amounts: {
          jobAmount,
          customerFeeAmount,
          customerTotalAmount,
          providerCommissionAmount,
          providerNetAmount,
          platformRevenueAmount,
          availableCredit:
            currentAvailableCredit,
          creditUsedAmount:
            expectedCreditUsed,
          additionalChargeAmount:
            expectedAdditionalCharge,
          refundAmount: 0,
        },
      });
    }

    // ============================================================
    // 5. FLUJO NORMAL: INITIAL_JOB
    //
    // A partir de aquí conservamos el comportamiento existente.
    // ============================================================

    const {
      data: offer,
      error: offerError,
    } = await supabaseAdmin
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
          error:
            "No pudimos consultar la oferta.",
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

    if (
      offer.professional_id !==
      metadataProfessionalId
    ) {
      return NextResponse.json(
        {
          error:
            "El profesional de la sesión de Stripe no coincide con la oferta.",
        },
        { status: 400 }
      );
    }

    const {
      data: serviceRequest,
      error: requestError,
    } = await supabaseAdmin
      .from("service_requests")
      .select(
        "id, title, customer_id, status, preferred_provider_id"
      )
      .eq("id", requestId)
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
            "No encontramos la solicitud correspondiente.",
        },
        { status: 404 }
      );
    }

    if (
      serviceRequest.customer_id !==
        metadataCustomerId ||
      (!isStripeWebhook &&
        serviceRequest.customer_id !==
          auth.user!.id)
    ) {
      return NextResponse.json(
        {
          error:
            "Este pago no corresponde a una solicitud de tu cuenta.",
        },
        { status: 403 }
      );
    }

    // ============================================================
    // 6. IMPORTES CONGELADOS DEL CHECKOUT NORMAL
    // ============================================================

    const jobAmount = money(
      Number(
        session.metadata
          ?.professional_price || 0
      )
    );

    const customerFeePercent =
      money(
        Number(
          session.metadata
            ?.customer_fee_percent || 0
        )
      );

    const customerFeeAmount =
      money(
        Number(
          session.metadata
            ?.customer_fee_amount ||
            session.metadata
              ?.service_fee ||
            0
        )
      );

    const customerTotalAmount =
      money(
        Number(
          session.metadata
            ?.customer_total || 0
        )
      );

    const providerCommissionPercent =
      money(
        Number(
          session.metadata
            ?.provider_commission_percent ||
            0
        )
      );

    const providerCommissionAmount =
      money(
        Number(
          session.metadata
            ?.provider_commission_amount ||
            0
        )
      );

    const providerNetAmount =
      money(
        Number(
          session.metadata
            ?.provider_net_amount || 0
        )
      );

    const platformRevenueAmount =
      money(
        Number(
          session.metadata
            ?.platform_revenue_amount ||
            0
        )
      );

    const currency = String(
      session.metadata?.currency ||
        session.currency ||
        "usd"
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
        (value) =>
          !Number.isFinite(value)
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
      typeof session.amount_total ===
      "number"
        ? money(
            session.amount_total / 100
          )
        : null;

    if (
      stripeTotal === null ||
      Math.abs(
        stripeTotal -
          customerTotalAmount
      ) > 0.01
    ) {
      return NextResponse.json(
        {
          error:
            "El importe confirmado por Stripe no coincide con el checkout original de RELYDO.",
        },
        { status: 400 }
      );
    }

    // ============================================================
    // 7. PAGO EXISTENTE
    // ============================================================

    const {
      data: existingPayment,
      error: existingPaymentError,
    } = await supabaseAdmin
      .from("payments")
      .select(
        "id, status, provider_payment_id"
      )
      .eq("offer_id", offerId)
      .limit(1)
      .maybeSingle();

    if (existingPaymentError) {
      return NextResponse.json(
        {
          error:
            "No pudimos comprobar el registro del pago.",
        },
        { status: 500 }
      );
    }

    if (
      existingPayment
        ?.provider_payment_id &&
      existingPayment
        .provider_payment_id !==
        paymentIntentId
    ) {
      const refund =
        await refundUnexpectedPayment(
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
        {
          status: refund.ok
            ? 409
            : 500,
        }
      );
    }

    const paymentAlreadyRecorded =
      existingPayment
        ?.provider_payment_id ===
      paymentIntentId;

    const jobAlreadyMatchesPayment =
      serviceRequest
        .preferred_provider_id ===
        offer.professional_id &&
      offer.status === "selected";

    const canClaimOpenRequest =
      serviceRequest.status ===
        "open" &&
      (!serviceRequest
        .preferred_provider_id ||
        serviceRequest
          .preferred_provider_id ===
          offer.professional_id) &&
      offer.status === "pending";

    if (
      !canClaimOpenRequest &&
      !jobAlreadyMatchesPayment
    ) {
      if (!paymentAlreadyRecorded) {
        const refund =
          await refundUnexpectedPayment(
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
          {
            status: refund.ok
              ? 409
              : 500,
          }
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

    // ============================================================
    // 8. RECLAMAR SOLICITUD NORMAL
    // ============================================================

    if (canClaimOpenRequest) {
      let claimQuery =
        supabaseAdmin
          .from(
            "service_requests"
          )
          .update({
            status:
              "in_progress",
            preferred_provider_id:
              offer.professional_id,
          })
          .eq(
            "id",
            requestId
          )
          .eq(
            "status",
            "open"
          );

      claimQuery =
        serviceRequest
          .preferred_provider_id
          ? claimQuery.eq(
              "preferred_provider_id",
              offer.professional_id
            )
          : claimQuery.is(
              "preferred_provider_id",
              null
            );

      const {
        data: claimedRequest,
        error: claimError,
      } = await claimQuery
        .select("id")
        .maybeSingle();

      if (claimError) {
        return NextResponse.json(
          {
            error:
              "Stripe confirmó el pago, pero no pudimos reservar el trabajo.",
          },
          { status: 500 }
        );
      }

      if (!claimedRequest) {
        const {
          data: currentRequest,
        } = await supabaseAdmin
          .from(
            "service_requests"
          )
          .select(
            "status, preferred_provider_id"
          )
          .eq(
            "id",
            requestId
          )
          .maybeSingle();

        const anotherRetryWon =
          currentRequest
            ?.preferred_provider_id ===
          offer.professional_id;

        if (!anotherRetryWon) {
          const refund =
            await refundUnexpectedPayment(
              paymentIntentId,
              session.id
            );

          return NextResponse.json(
            {
              error: refund.ok
                ? "Otra contratación se confirmó antes. El cobro de esta sesión fue reembolsado automáticamente."
                : "Otra contratación se confirmó antes y el reembolso automático falló. Requiere revisión administrativa.",
              refunded:
                refund.ok,
              refundId:
                refund.refundId,
            },
            {
              status: refund.ok
                ? 409
                : 500,
            }
          );
        }
      }
    }

    // ============================================================
    // 9. SELECCIONAR OFERTA NORMAL
    // ============================================================

    const {
      error: selectedOfferError,
    } = await supabaseAdmin
      .from("offers")
      .update({
        status: "selected",
      })
      .eq("id", offerId)
      .in("status", [
        "pending",
        "selected",
      ]);

    if (selectedOfferError) {
      return NextResponse.json(
        {
          error:
            "Stripe confirmó el pago, pero no pudimos seleccionar la oferta.",
        },
        { status: 500 }
      );
    }

    const {
      error: rejectedOffersError,
    } = await supabaseAdmin
      .from("offers")
      .update({
        status: "rejected",
      })
      .eq(
        "request_id",
        requestId
      )
      .eq(
        "status",
        "pending"
      )
      .neq("id", offerId);

    if (rejectedOffersError) {
      console.warn(
        "RELYDO: no pudimos rechazar todas las ofertas restantes; el webhook volverá a intentarlo:",
        rejectedOffersError
      );
    }

    // ============================================================
    // 10. REGISTRAR PAGO NORMAL
    // ============================================================

    const paymentData = {
      request_id: requestId,
      offer_id: offerId,
      customer_id:
        serviceRequest.customer_id,
      provider_id:
        offer.professional_id,

      job_amount:
        jobAmount,

      customer_fee_percent:
        customerFeePercent,

      customer_fee_amount:
        customerFeeAmount,

      customer_total_amount:
        customerTotalAmount,

      provider_commission_percent:
        providerCommissionPercent,

      provider_commission_amount:
        providerCommissionAmount,

      provider_net_amount:
        providerNetAmount,

      platform_revenue_amount:
        platformRevenueAmount,

      currency,

      status:
        "ready_for_payout",

      payment_provider:
        "stripe",

      provider_payment_id:
        paymentIntentId,

      provider_customer_id:
        stripeCustomerId,

      refunded_amount: 0,

      paid_at:
        new Date().toISOString(),

      updated_at:
        new Date().toISOString(),
    };

    let paymentCreatedNow =
      false;

    if (!existingPayment) {
      const {
        error: insertPaymentError,
      } = await supabaseAdmin
        .from("payments")
        .insert(paymentData);

      if (insertPaymentError) {
        if (
          insertPaymentError.code !==
          "23505"
        ) {
          return NextResponse.json(
            {
              error:
                "Stripe confirmó el pago, pero RELYDO no pudo registrar el pago.",
            },
            { status: 500 }
          );
        }

        const {
          data:
            concurrentPayment,
          error:
            concurrentError,
        } = await supabaseAdmin
          .from("payments")
          .select(
            "id, provider_payment_id"
          )
          .eq(
            "offer_id",
            offerId
          )
          .maybeSingle();

        if (
          concurrentError ||
          !concurrentPayment
        ) {
          return NextResponse.json(
            {
              error:
                "Se detectó un pago concurrente y no pudimos verificarlo con seguridad.",
            },
            { status: 500 }
          );
        }

        if (
          concurrentPayment
            .provider_payment_id &&
          concurrentPayment
            .provider_payment_id !==
            paymentIntentId
        ) {
          const refund =
            await refundUnexpectedPayment(
              paymentIntentId,
              session.id
            );

          return NextResponse.json(
            {
              error: refund.ok
                ? "Se detectó un segundo cobro y fue reembolsado automáticamente."
                : "Se detectó un segundo cobro y el reembolso automático falló. Requiere revisión administrativa.",
              refunded:
                refund.ok,
              refundId:
                refund.refundId,
            },
            {
              status: refund.ok
                ? 409
                : 500,
            }
          );
        }
      } else {
        paymentCreatedNow =
          true;
      }
    } else if (
      !paymentAlreadyRecorded
    ) {
      const {
        error: updatePaymentError,
      } = await supabaseAdmin
        .from("payments")
        .update(paymentData)
        .eq(
          "id",
          existingPayment.id
        )
        .or(
          `provider_payment_id.is.null,provider_payment_id.eq.${paymentIntentId}`
        );

      if (updatePaymentError) {
        return NextResponse.json(
          {
            error:
              "Stripe confirmó el pago, pero RELYDO no pudo completar el registro del pago.",
          },
          { status: 500 }
        );
      }

      paymentCreatedNow =
        true;
    }

    // ============================================================
    // 11. NOTIFICACIÓN
    // ============================================================

    if (paymentCreatedNow) {
      await notifyProviderHired({
        providerId:
          offer.professional_id,
        requestId,
        title:
          serviceRequest.title,
      });
    }

    // ============================================================
    // 12. RESPUESTA NORMAL
    // ============================================================

    return NextResponse.json({
      success: true,
      paymentConfirmed: true,
      alreadyProcessed:
        paymentAlreadyRecorded,
      fundsReleasedToProvider:
        false,
      requestId,
      offerId,
      professionalId:
        offer.professional_id,
      paymentStatus:
        session.payment_status,

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
    console.error(
      "Error verificando pago:",
      error
    );

    return NextResponse.json(
      {
        error:
          "No se pudo verificar el pago.",
      },
      { status: 500 }
    );
  }
}