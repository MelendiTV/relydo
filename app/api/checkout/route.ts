import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "../../lib/serverAuth";
import { sendRelydoNotification } from "../../lib/serverNotifications";

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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return "Error desconocido.";
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


async function getOrCreateStripeCustomer(user: {
  id: string;
  email?: string | null;
}) {
  const { data: profile, error: profileError } =
    await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id, full_name, email")
      .eq("id", user.id)
      .maybeSingle();

  if (profileError) {
    console.error("CHECKOUT PROFILE ERROR:", profileError);
    throw new Error("No pudimos consultar el perfil de pagos.");
  }

  let stripeCustomerId = String(
    profile?.stripe_customer_id || ""
  ).trim();

  if (stripeCustomerId) {
    try {
      const existingCustomer =
        await stripe.customers.retrieve(stripeCustomerId);

      if (!existingCustomer.deleted) {
        return stripeCustomerId;
      }

      stripeCustomerId = "";
    } catch (error) {
      console.warn(
        "CHECKOUT STRIPE CUSTOMER LOOKUP ERROR:",
        error
      );
      stripeCustomerId = "";
    }
  }

  const customer = await stripe.customers.create({
    email: profile?.email || user.email || undefined,
    name: profile?.full_name || undefined,
    metadata: {
      relydo_user_id: user.id,
    },
  });

  const { error: saveCustomerError } =
    await supabaseAdmin
      .from("profiles")
      .update({
        stripe_customer_id: customer.id,
      })
      .eq("id", user.id);

  if (saveCustomerError) {
    console.error(
      "CHECKOUT SAVE STRIPE CUSTOMER ERROR:",
      saveCustomerError
    );

    throw new Error(
      "No pudimos vincular la cuenta de Stripe al perfil."
    );
  }

  return customer.id;
}

export async function POST(request: NextRequest) {
  try {
    // ============================================================
    // 1. AUTENTICACIÓN
    // ============================================================

    const auth = await getAuthenticatedUser(request);

    if (!auth.user) {
      return NextResponse.json(
        {
          error:
            "Debes iniciar sesión como cliente para realizar este pago.",
        },
        { status: 401 }
      );
    }

    const body = await request.json();

    const requestId = String(body?.requestId || "").trim();
    const offerId = String(body?.offerId || "").trim();
    const mobileReturnUrl = String(body?.mobileReturnUrl || "").trim();
    const paymentFlow = String(body?.paymentFlow || "").trim();

    const validMobileReturnUrl =
      mobileReturnUrl.startsWith("relydo://") ||
      mobileReturnUrl.startsWith("exp://")
        ? mobileReturnUrl
        : "";

    if (!requestId || !offerId) {
      return NextResponse.json(
        {
          error:
            "Faltan datos de la solicitud o de la oferta.",
        },
        { status: 400 }
      );
    }

    // ============================================================
    // 2. SOLICITUD
    // ============================================================

    const {
      data: serviceRequest,
      error: serviceRequestError,
    } = await supabaseAdmin
      .from("service_requests")
      .select(
        "id, title, customer_id, status, preferred_provider_id"
      )
      .eq("id", requestId)
      .eq("customer_id", auth.user.id)
      .maybeSingle();

    if (serviceRequestError) {
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
            "No encontramos la solicitud o no pertenece a tu cuenta.",
        },
        { status: 404 }
      );
    }

    if (serviceRequest.status !== "open") {
      return NextResponse.json(
        {
          error:
            "Esta solicitud ya no acepta nuevas contrataciones.",
        },
        { status: 409 }
      );
    }

    // ============================================================
    // 3. OFERTA
    // ============================================================

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
            "No encontramos la oferta seleccionada.",
        },
        { status: 404 }
      );
    }

    if (offer.status !== "pending") {
      return NextResponse.json(
        {
          error:
            "Esta oferta ya no está disponible para pago.",
        },
        { status: 409 }
      );
    }

    if (
      serviceRequest.preferred_provider_id &&
      serviceRequest.preferred_provider_id !==
        offer.professional_id
    ) {
      return NextResponse.json(
        {
          error:
            "Esta solicitud está dirigida a otro profesional.",
        },
        { status: 409 }
      );
    }

    // ============================================================
    // 4. COMPROBAR PAGO EXISTENTE PARA ESTA OFERTA
    // ============================================================

    const {
      data: existingPayment,
      error: existingPaymentError,
    } = await supabaseAdmin
      .from("payments")
      .select("id, status, provider_payment_id")
      .eq("offer_id", offerId)
      .maybeSingle();

    if (existingPaymentError) {
      return NextResponse.json(
        {
          error:
            "No pudimos comprobar pagos anteriores.",
        },
        { status: 500 }
      );
    }

    if (existingPayment?.provider_payment_id) {
      return NextResponse.json(
        {
          error:
            "Esta oferta ya tiene un pago registrado.",
        },
        { status: 409 }
      );
    }

    // ============================================================
    // 5. IMPORTES ACTUALES
    // ============================================================

    const professionalPrice = money(
      Number(offer.price)
    );

    if (
      !Number.isFinite(professionalPrice) ||
      professionalPrice <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "El precio de la oferta no es válido.",
        },
        { status: 400 }
      );
    }

    const {
      data: paymentSettings,
      error: settingsError,
    } = await supabaseAdmin
      .from("payment_settings")
      .select(
        "id, provider_commission_percent, customer_service_fee_percent, currency, active"
      )
      .eq("active", true)
      .order("created_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (settingsError || !paymentSettings) {
      return NextResponse.json(
        {
          error:
            "No pudimos cargar la configuración de pagos.",
        },
        { status: 500 }
      );
    }

    const customerFeePercent = Number(
      paymentSettings.customer_service_fee_percent || 0
    );

    const providerCommissionPercent = Number(
      paymentSettings.provider_commission_percent || 0
    );

    if (
      !Number.isFinite(customerFeePercent) ||
      customerFeePercent < 0 ||
      !Number.isFinite(providerCommissionPercent) ||
      providerCommissionPercent < 0
    ) {
      return NextResponse.json(
        {
          error:
            "La configuración de comisiones de RELYDO no es válida.",
        },
        { status: 500 }
      );
    }

    const customerFeeAmount = money(
      professionalPrice *
        (customerFeePercent / 100)
    );

    const customerTotalAmount = money(
      professionalPrice +
        customerFeeAmount
    );

    const providerCommissionAmount = money(
      professionalPrice *
        (providerCommissionPercent / 100)
    );

    const providerNetAmount = money(
      professionalPrice -
        providerCommissionAmount
    );

    const platformRevenueAmount = money(
      customerFeeAmount +
        providerCommissionAmount
    );

    const currency = String(
      paymentSettings.currency || "usd"
    ).toUpperCase();

    // ============================================================
    // 6. PROFESIONAL
    // ============================================================

    const { data: providerProfile } =
      await supabaseAdmin
        .from("provider_profiles")
        .select("business_name")
        .eq(
          "user_id",
          offer.professional_id
        )
        .maybeSingle();

    const configuredOrigin =
      process.env.RELYDO_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "";

    const origin =
      configuredOrigin.replace(/\/$/, "") ||
      request.nextUrl.origin;

    // ============================================================
    // 7. ¿EXISTE UNA REASIGNACIÓN ACTIVA?
    // ============================================================

    const {
      data: activeReassignment,
      error: reassignmentLookupError,
    } = await supabaseAdmin
      .from("payment_reassignments")
      .select(`
        id,
        request_id,
        original_payment_id,
        original_provider_id,
        replacement_offer_id,
        replacement_provider_id,
        available_credit,
        status,
        stripe_checkout_session_id,
        stripe_additional_payment_intent_id,
        replacement_payment_id
      `)
      .eq("request_id", requestId)
      .in("status", [
        "available",
        "pending_replacement",
      ])
      .order("created_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (reassignmentLookupError) {
      return NextResponse.json(
        {
          error:
            "No pudimos comprobar si este trabajo tiene crédito de reasignación.",
        },
        { status: 500 }
      );
    }

    // ============================================================
    // 8. FLUJO DE REASIGNACIÓN
    // ============================================================

    if (activeReassignment) {
      /*
       * Reservamos atómicamente el crédito para ESTA oferta.
       */
      const {
        data: prepared,
        error: prepareError,
      } = await supabaseAdmin.rpc(
        "prepare_payment_reassignment",
        {
          p_request_id: requestId,
          p_offer_id: offerId,
          p_customer_id: auth.user.id,
        }
      );

      if (prepareError) {
        console.error(
          "Error preparando reasignación:",
          prepareError
        );

        const message =
          String(prepareError.message || "");

        if (
          message.includes(
            "REASSIGNMENT_ALREADY_RESERVED"
          )
        ) {
          return NextResponse.json(
            {
              error:
                "Este crédito ya está reservado para otra oferta.",
            },
            { status: 409 }
          );
        }

        return NextResponse.json(
          {
            error:
              "No pudimos reservar de forma segura el crédito del pago anterior.",
          },
          { status: 409 }
        );
      }

      const reassignmentId = String(
        prepared?.reassignment_id ||
          activeReassignment.id
      );

      const originalPaymentId = String(
        prepared?.original_payment_id ||
          activeReassignment.original_payment_id
      );

      /*
       * Volvemos a leer la reasignación después de reservarla.
       */
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
          available_credit,
          status,
          stripe_checkout_session_id,
          stripe_additional_payment_intent_id,
          replacement_payment_id
        `)
        .eq("id", reassignmentId)
        .maybeSingle();

      if (
        reassignmentError ||
        !reassignment
      ) {
        return NextResponse.json(
          {
            error:
              "La reasignación fue reservada, pero no pudimos volver a consultarla.",
          },
          { status: 500 }
        );
      }

      if (
        reassignment.replacement_offer_id !==
          offerId ||
        reassignment.replacement_provider_id !==
          offer.professional_id
      ) {
        return NextResponse.json(
          {
            error:
              "La reasignación está reservada para otra oferta.",
          },
          { status: 409 }
        );
      }

      /*
       * Consultamos el payment del Pro que liberó.
       *
       * Puede ser un pago Stripe original (con provider_payment_id)
       * o un payment creado por una reasignación anterior, cuyas
       * fuentes físicas viven en payment_reassignment_funding_sources.
       */
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

      if (
        originalPaymentError ||
        !originalPayment
      ) {
        return NextResponse.json(
          {
            error:
              "No pudimos consultar el pago retenido de la contratación anterior.",
          },
          { status: 500 }
        );
      }

      if (
        originalPayment.request_id !==
          requestId ||
        originalPayment.provider_id !==
          reassignment.original_provider_id
      ) {
        return NextResponse.json(
          {
            error:
              "El pago retenido no coincide con esta reasignación.",
          },
          { status: 409 }
        );
      }

      if (
        originalPayment.payment_provider !==
          "stripe" ||
        !originalPayment.paid_at ||
        originalPayment.released_at ||
        originalPayment.stripe_transfer_id
      ) {
        return NextResponse.json(
          {
            error:
              "El pago anterior ya no puede utilizarse como crédito para esta reasignación.",
          },
          { status: 409 }
        );
      }

      if (
        ![
          "paid",
          "ready_for_payout",
          "partially_refunded",
        ].includes(
          String(originalPayment.status)
        )
      ) {
        return NextResponse.json(
          {
            error:
              "El estado del pago anterior no permite utilizarlo como crédito.",
          },
          { status: 409 }
        );
      }

      /*
       * Buscar fuentes heredadas.
       */
      const {
        data: inheritedFundingSources,
        error: inheritedFundingSourcesError,
      } = await supabaseAdmin
        .from(
          "payment_reassignment_funding_sources"
        )
        .select(`
          id,
          stripe_payment_intent_id,
          allocated_customer_amount,
          created_at
        `)
        .eq("payment_id", originalPayment.id)
        .is("transferred_at", null)
        .is("stripe_transfer_id", null)
        .order("created_at", {
          ascending: true,
        });

      if (inheritedFundingSourcesError) {
        console.error(
          "Error consultando fuentes heredadas:",
          inheritedFundingSourcesError
        );

        return NextResponse.json(
          {
            error:
              "No pudimos comprobar las fuentes Stripe retenidas de esta reasignación.",
          },
          { status: 500 }
        );
      }

      const fundingSources =
        inheritedFundingSources || [];

      const hasInheritedFunding =
        fundingSources.length > 0;

      /*
       * Si no hay fuentes heredadas, este debe ser un pago
       * Stripe normal y sí debe tener provider_payment_id.
       */
      if (
        !hasInheritedFunding &&
        !originalPayment.provider_payment_id
      ) {
        return NextResponse.json(
          {
            error:
              "El pago anterior no tiene una fuente Stripe válida para esta reasignación.",
          },
          { status: 409 }
        );
      }

      /*
       * Reembolsos ya registrados por cada fuente heredada.
       */
      const refundedByFundingSource =
        new Map<string, number>();

      if (hasInheritedFunding) {
        const fundingSourceIds =
          fundingSources.map((source) =>
            String(source.id)
          );

        const {
          data: sourceRefunds,
          error: sourceRefundsError,
        } = await supabaseAdmin
          .from(
            "payment_reassignment_source_refunds"
          )
          .select(
            "funding_source_id, refunded_amount"
          )
          .in(
            "funding_source_id",
            fundingSourceIds
          );

        if (sourceRefundsError) {
          console.error(
            "Error consultando refunds por fuente:",
            sourceRefundsError
          );

          return NextResponse.json(
            {
              error:
                "No pudimos comprobar los reembolsos asociados al crédito retenido.",
            },
            { status: 500 }
          );
        }

        for (const row of sourceRefunds || []) {
          const sourceId = String(
            row.funding_source_id
          );

          refundedByFundingSource.set(
            sourceId,
            money(
              (refundedByFundingSource.get(
                sourceId
              ) || 0) +
                Number(row.refunded_amount || 0)
            )
          );
        }
      }

      /*
       * Crédito congelado cuando el Pro liberó.
       */
      const storedAvailableCredit = money(
        Number(
          reassignment.available_credit || 0
        )
      );

      if (
        !Number.isFinite(storedAvailableCredit) ||
        storedAvailableCredit <= 0
      ) {
        return NextResponse.json(
          {
            error:
              "Este trabajo ya no tiene crédito disponible para reasignar.",
          },
          { status: 409 }
        );
      }

      /*
       * Crédito físico que sigue vivo AHORA.
       */
      let liveAvailableCredit = 0;

      if (hasInheritedFunding) {
        liveAvailableCredit = money(
          fundingSources.reduce(
            (total, source) => {
              const allocated = money(
                Number(
                  source.allocated_customer_amount ||
                    0
                )
              );

              const refunded = money(
                refundedByFundingSource.get(
                  String(source.id)
                ) || 0
              );

              return (
                total +
                Math.max(
                  0,
                  money(allocated - refunded)
                )
              );
            },
            0
          )
        );
      } else {
        const originalCustomerTotal = money(
          Number(
            originalPayment.customer_total_amount ||
              0
          )
        );

        const alreadyRefunded = money(
          Number(
            originalPayment.refunded_amount || 0
          )
        );

        liveAvailableCredit = money(
          Math.max(
            0,
            originalCustomerTotal -
              alreadyRefunded
          )
        );
      }

      if (
        !Number.isFinite(liveAvailableCredit) ||
        liveAvailableCredit <= 0
      ) {
        return NextResponse.json(
          {
            error:
              "El crédito retenido ya no está disponible.",
          },
          { status: 409 }
        );
      }

      /*
       * La economía de la reasignación se calcula con el crédito
       * congelado al liberar el Pro. Esto mantiene idempotencia si
       * un refund Stripe ya se procesó y el usuario vuelve a intentar.
       */
      const creditUsedAmount = money(
        Math.min(
          storedAvailableCredit,
          customerTotalAmount
        )
      );

      const additionalChargeAmount = money(
        Math.max(
          0,
          customerTotalAmount -
            storedAvailableCredit
        )
      );

      const refundAmount = money(
        Math.max(
          0,
          storedAvailableCredit -
            customerTotalAmount
        )
      );

      /*
       * Nunca podemos haber reembolsado por debajo del crédito que
       * necesita la nueva contratación.
       */
      if (
        liveAvailableCredit + 0.009 <
        creditUsedAmount
      ) {
        return NextResponse.json(
          {
            error:
              "El crédito Stripe retenido ya no coincide con el importe reservado para esta contratación.",
          },
          { status: 409 }
        );
      }

      /*
       * En el escenario de cobro adicional no debería existir ningún
       * refund parcial previo de esta reasignación.
       */
      if (
        additionalChargeAmount > 0 &&
        Math.abs(
          liveAvailableCredit -
            storedAvailableCredit
        ) > 0.009
      ) {
        return NextResponse.json(
          {
            error:
              "El crédito retenido cambió antes de completar el pago adicional. No se realizó un nuevo cobro.",
          },
          { status: 409 }
        );
      }

      // ==========================================================
      // 8A. EL CRÉDITO CUBRE TODO
      //
      // No creamos una nueva Checkout Session.
      //
      // Si sobra dinero:
      // - pago directo: refund al PaymentIntent original.
      // - pago heredado: refund distribuido entre las fuentes
      //   Stripe reales y registrado por funding_source_id.
      // ==========================================================

      if (additionalChargeAmount <= 0) {
        const refundIds: string[] = [];

        /*
         * En reintentos puede haberse procesado una parte del refund
         * antes de un error posterior. Solo devolvemos lo que todavía
         * sobra físicamente.
         */
        const remainingRefundAmount = money(
          Math.max(
            0,
            liveAvailableCredit -
              creditUsedAmount
          )
        );

        if (
          remainingRefundAmount > 0 &&
          hasInheritedFunding
        ) {
          let refundRemaining =
            remainingRefundAmount;

          /*
           * Reembolsamos primero las fuentes más recientes.
           * El orden es determinista y evita mezclar cantidades.
           */
          const refundableSources =
            [...fundingSources]
              .map((source) => {
                const allocated = money(
                  Number(
                    source.allocated_customer_amount ||
                      0
                  )
                );

                const refunded = money(
                  refundedByFundingSource.get(
                    String(source.id)
                  ) || 0
                );

                return {
                  ...source,
                  available: money(
                    Math.max(
                      0,
                      allocated - refunded
                    )
                  ),
                };
              })
              .filter(
                (source) => source.available > 0
              )
              .sort((a, b) =>
                String(b.created_at).localeCompare(
                  String(a.created_at)
                )
              );

          for (const source of refundableSources) {
            if (refundRemaining <= 0) {
              break;
            }

            const refundPart = money(
              Math.min(
                source.available,
                refundRemaining
              )
            );

            const refundCents = Math.round(
              refundPart * 100
            );

            if (refundCents <= 0) {
              continue;
            }

            try {
              const refund =
                await stripe.refunds.create(
                  {
                    payment_intent:
                      String(
                        source.stripe_payment_intent_id
                      ),
                    amount: refundCents,
                    reason:
                      "requested_by_customer",
                    metadata: {
                      payment_type:
                        "provider_reassignment_source_refund",
                      reassignment_id:
                        reassignment.id,
                      request_id:
                        requestId,
                      original_payment_id:
                        originalPayment.id,
                      funding_source_id:
                        String(source.id),
                      replacement_offer_id:
                        offerId,
                      customer_id:
                        auth.user.id,
                      refund_amount:
                        refundPart.toFixed(2),
                    },
                  },
                  {
                    idempotencyKey:
                      `relydo_reassignment_source_refund_${reassignment.id}_${source.id}_${refundCents}`,
                  }
                );

              const {
                error: saveRefundError,
              } = await supabaseAdmin
                .from(
                  "payment_reassignment_source_refunds"
                )
                .upsert(
                  {
                    funding_source_id:
                      source.id,
                    stripe_payment_intent_id:
                      String(
                        source.stripe_payment_intent_id
                      ),
                    stripe_refund_id:
                      refund.id,
                    refunded_amount:
                      refundPart,
                    refund_reason:
                      "provider_reassignment_excess",
                  },
                  {
                    onConflict:
                      "stripe_refund_id",
                  }
                );

              if (saveRefundError) {
                console.error(
                  "Stripe reembolsó una fuente, pero no pudimos registrar el refund:",
                  saveRefundError
                );

                return NextResponse.json(
                  {
                    error:
                      "Stripe procesó parte del reembolso, pero RELYDO no pudo registrar el movimiento. Puedes volver a intentarlo de forma segura.",
                    retryable: true,
                  },
                  { status: 500 }
                );
              }

              refundIds.push(refund.id);

              refundRemaining = money(
                refundRemaining - refundPart
              );
            } catch (refundError) {
              console.error(
                "Error reembolsando fuente heredada:",
                refundError
              );

              return NextResponse.json(
                {
                  error:
                    "No pudimos completar de forma segura el reembolso del crédito excedente. La contratación no fue completada.",
                  retryable: true,
                },
                { status: 500 }
              );
            }
          }

          if (refundRemaining > 0.009) {
            return NextResponse.json(
              {
                error:
                  "Las fuentes Stripe retenidas no alcanzan para completar el reembolso calculado. La contratación no fue completada.",
              },
              { status: 409 }
            );
          }
        } else if (
          remainingRefundAmount > 0
        ) {
          const refundCents = Math.round(
            refundAmount * 100
          );

          if (
            refundCents > 0 &&
            originalPayment.provider_payment_id
          ) {
            try {
              const refund =
                await stripe.refunds.create(
                  {
                    payment_intent:
                      originalPayment.provider_payment_id,
                    amount: refundCents,
                    reason:
                      "requested_by_customer",
                    metadata: {
                      payment_type:
                        "provider_reassignment_refund",
                      reassignment_id:
                        reassignment.id,
                      request_id:
                        requestId,
                      original_payment_id:
                        originalPayment.id,
                      replacement_offer_id:
                        offerId,
                      customer_id:
                        auth.user.id,
                      refund_amount:
                        refundAmount.toFixed(2),
                    },
                  },
                  {
                    idempotencyKey:
                      `relydo_reassignment_refund_${reassignment.id}_${refundCents}`,
                  }
                );

              refundIds.push(refund.id);
            } catch (refundError) {
              console.error(
                "Error reembolsando excedente de reasignación:",
                refundError
              );

              return NextResponse.json(
                {
                  error:
                    "No pudimos reembolsar de forma segura el excedente del pago anterior. La contratación no fue completada.",
                },
                { status: 500 }
              );
            }
          }
        }

        /*
         * Stripe ya está resuelto.
         * PostgreSQL confirma el nuevo payment, sus fuentes y la
         * contratación en una sola operación.
         */
        const {
          data: finalized,
          error: finalizeError,
        } = await supabaseAdmin.rpc(
          "finalize_payment_reassignment",
          {
            p_reassignment_id:
              reassignment.id,
            p_customer_id:
              auth.user.id,
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
              null,
            p_stripe_customer_id:
              null,
          }
        );

        if (finalizeError) {
          console.error(
            "Stripe quedó resuelto, pero no pudimos finalizar la reasignación:",
            finalizeError
          );

          return NextResponse.json(
            {
              error:
                "El movimiento de Stripe fue procesado, pero RELYDO no pudo finalizar la reasignación. Puedes volver a intentarlo de forma segura.",
              retryable: true,
            },
            { status: 500 }
          );
        }

        await notifyProviderHired({
          providerId:
            offer.professional_id,
          requestId,
          title:
            serviceRequest.title,
        });

        return NextResponse.json({
          success: true,
          reassignmentApplied: true,
          stripeCheckoutRequired: false,
          requestId,
          offerId,
          professionalId:
            offer.professional_id,
          reassignmentId:
            reassignment.id,
          refundId:
            refundIds[0] || null,
          refundIds,
          amounts: {
            professionalPrice,
            customerFeePercent,
            serviceFee:
              customerFeeAmount,
            total:
              customerTotalAmount,
            providerCommissionPercent,
            providerCommissionAmount,
            providerNetAmount,
            platformRevenueAmount,
            availableCredit:
              storedAvailableCredit,
            creditUsedAmount,
            additionalChargeAmount: 0,
            refundAmount,
          },
          reassignment:
            finalized,
        });
      }

      // ==========================================================
      // 8B. EL NUEVO TRABAJO CUESTA MÁS
      //
      // Stripe cobra EXCLUSIVAMENTE la diferencia.
      // ==========================================================

      /*
       * Si ya existe una Checkout Session de esta reasignación,
       * intentamos reutilizarla.
       */
      if (
        reassignment.stripe_checkout_session_id
      ) {
        try {
          const existingSession =
            await stripe.checkout.sessions.retrieve(
              reassignment.stripe_checkout_session_id
            );

          if (
            existingSession.payment_status ===
              "unpaid" &&
            existingSession.status ===
              "open" &&
            existingSession.url
          ) {
            return NextResponse.json({
              success: true,
              reassignment: true,
              stripeCheckoutRequired: true,
              url: existingSession.url,
              sessionId:
                existingSession.id,
              amounts: {
                professionalPrice,
                customerFeePercent,
                serviceFee:
                  customerFeeAmount,
                total:
                  customerTotalAmount,
                providerCommissionPercent,
                providerCommissionAmount,
                providerNetAmount,
                platformRevenueAmount,
                availableCredit:
                  storedAvailableCredit,
                creditUsedAmount,
                additionalChargeAmount,
                refundAmount: 0,
              },
            });
          }

          if (
            existingSession.payment_status ===
            "paid"
          ) {
            return NextResponse.json(
              {
                error:
                  "El pago adicional ya fue confirmado por Stripe y está siendo aplicado por RELYDO. Actualiza la solicitud en unos segundos.",
                paymentAlreadyCompleted: true,
              },
              { status: 409 }
            );
          }
        } catch (existingSessionError) {
          console.warn(
            "No pudimos reutilizar la Checkout Session anterior de la reasignación:",
            existingSessionError
          );
        }
      }

      const additionalAmountInCents =
        Math.round(
          additionalChargeAmount * 100
        );

      if (additionalAmountInCents <= 0) {
        return NextResponse.json(
          {
            error:
              "El importe adicional calculado para Stripe no es válido.",
          },
          { status: 500 }
        );
      }

      const session =
        await stripe.checkout.sessions.create(
          {
            mode: "payment",
            payment_method_types: [
              "card",
            ],
            client_reference_id:
              requestId,

            line_items: [
              {
                price_data: {
                  currency:
                    currency.toLowerCase(),
                  product_data: {
                    name:
                      serviceRequest.title ||
                      "Servicio RELYDO",
                    description:
                      providerProfile?.business_name
                        ? `Diferencia de reasignación para servicio realizado por ${providerProfile.business_name}`
                        : "Diferencia de reasignación de servicio RELYDO",
                  },
                  unit_amount:
                    additionalAmountInCents,
                },
                quantity: 1,
              },
            ],

            metadata: {
              payment_type:
                "replacement_job_additional",
              reassignment_id:
                reassignment.id,
              request_id:
                requestId,
              offer_id:
                offerId,
              original_payment_id:
                originalPayment.id,
              customer_id:
                auth.user.id,
              professional_id:
                String(
                  offer.professional_id
                ),
              payment_settings_id:
                String(
                  paymentSettings.id
                ),
              professional_price:
                professionalPrice.toFixed(2),
              customer_fee_percent:
                customerFeePercent.toFixed(2),
              customer_fee_amount:
                customerFeeAmount.toFixed(2),
              customer_total:
                customerTotalAmount.toFixed(2),
              provider_commission_percent:
                providerCommissionPercent.toFixed(2),
              provider_commission_amount:
                providerCommissionAmount.toFixed(2),
              provider_net_amount:
                providerNetAmount.toFixed(2),
              platform_revenue_amount:
                platformRevenueAmount.toFixed(2),
              available_credit:
                storedAvailableCredit.toFixed(2),
              credit_used_amount:
                creditUsedAmount.toFixed(2),
              additional_charge_amount:
                additionalChargeAmount.toFixed(2),
              refund_amount:
                "0.00",
              currency,
            },

            payment_intent_data: {
              transfer_group:
                `relydo_request_${requestId}`,
              metadata: {
                payment_type:
                  "replacement_job_additional",
                reassignment_id:
                  reassignment.id,
                request_id:
                  requestId,
                offer_id:
                  offerId,
                customer_id:
                  auth.user.id,
                professional_id:
                  String(
                    offer.professional_id
                  ),
              },
            },

            success_url:
              `${origin}/checkout/${requestId}?offer=${offerId}&payment=success&session_id={CHECKOUT_SESSION_ID}`,

            cancel_url:
              `${origin}/checkout/${requestId}?offer=${offerId}&payment=cancelled`,
          },
          {
            idempotencyKey:
              `relydo-reassignment-checkout-${reassignment.id}-${offerId}`,
          }
        );

      if (!session.url) {
        return NextResponse.json(
          {
            error:
              "Stripe no devolvió una URL para el pago adicional.",
          },
          { status: 500 }
        );
      }

      /*
       * Guardamos la sesión.
       * Todavía NO aplicamos la reasignación.
       */
      const {
        error: saveSessionError,
      } = await supabaseAdmin
        .from("payment_reassignments")
        .update({
          stripe_checkout_session_id:
            session.id,
          replacement_customer_total:
            customerTotalAmount,
          credit_used_amount:
            creditUsedAmount,
          additional_charge_amount:
            additionalChargeAmount,
          refund_amount: 0,
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          reassignment.id
        )
        .eq(
          "status",
          "pending_replacement"
        )
        .eq(
          "replacement_offer_id",
          offerId
        );

      if (saveSessionError) {
        console.error(
          "No pudimos guardar la sesión adicional de reasignación:",
          saveSessionError
        );

        return NextResponse.json(
          {
            error:
              "Stripe creó la sesión de pago, pero RELYDO no pudo registrar la reasignación.",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        reassignment: true,
        stripeCheckoutRequired: true,
        url: session.url,
        sessionId:
          session.id,
        amounts: {
          professionalPrice,
          customerFeePercent,
          serviceFee:
            customerFeeAmount,
          total:
            customerTotalAmount,
          providerCommissionPercent,
          providerCommissionAmount,
          providerNetAmount,
          platformRevenueAmount,
          availableCredit:
            storedAvailableCredit,
          creditUsedAmount,
          additionalChargeAmount,
          refundAmount: 0,
        },
      });
    }

    // ============================================================
    // 9. CHECKOUT NORMAL

    //
    // IMPORTANTE:
    // Si NO existe reasignación activa, mantenemos el flujo
    // normal de RELYDO.
    // ============================================================

    const amountInCents =
      Math.round(
        customerTotalAmount * 100
      );

    if (paymentFlow === "payment_sheet") {
      if (amountInCents <= 0) {
        return NextResponse.json(
          {
            error:
              "El importe calculado para Stripe no es válido.",
          },
          { status: 500 }
        );
      }

      const stripeCustomerId =
        await getOrCreateStripeCustomer({
          id: auth.user.id,
          email: auth.user.email,
        });

      const paymentIntent =
        await stripe.paymentIntents.create(
          {
            amount: amountInCents,
            currency: currency.toLowerCase(),
            customer: stripeCustomerId,
            payment_method_types: ["card"],
            setup_future_usage: "off_session",
            transfer_group:
              `relydo_request_${requestId}`,
            metadata: {
              payment_type: "initial_job",
              payment_flow: "payment_sheet",
              request_id: requestId,
              offer_id: offerId,
              customer_id: auth.user.id,
              professional_id: String(
                offer.professional_id
              ),
              payment_settings_id: String(
                paymentSettings.id
              ),
              professional_price:
                professionalPrice.toFixed(2),
              customer_fee_percent:
                customerFeePercent.toFixed(2),
              customer_fee_amount:
                customerFeeAmount.toFixed(2),
              customer_total:
                customerTotalAmount.toFixed(2),
              provider_commission_percent:
                providerCommissionPercent.toFixed(2),
              provider_commission_amount:
                providerCommissionAmount.toFixed(2),
              provider_net_amount:
                providerNetAmount.toFixed(2),
              platform_revenue_amount:
                platformRevenueAmount.toFixed(2),
              currency,
            },
          },
          {
            idempotencyKey:
              `relydo-payment-sheet-${requestId}-${offerId}`,
          }
        );

      if (!paymentIntent.client_secret) {
        return NextResponse.json(
          {
            error:
              "Stripe no devolvió un PaymentIntent válido.",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        paymentFlow: "payment_sheet",
        stripeCheckoutRequired: false,
        paymentIntentId: paymentIntent.id,
        paymentIntentClientSecret:
          paymentIntent.client_secret,
        stripeCustomerId,
        amounts: {
          professionalPrice,
          customerFeePercent,
          serviceFee:
            customerFeeAmount,
          total:
            customerTotalAmount,
          providerCommissionPercent,
          providerCommissionAmount,
          providerNetAmount,
          platformRevenueAmount,
        },
      });
    }

    const session =
      await stripe.checkout.sessions.create(
        {
          mode: "payment",
          payment_method_types: [
            "card",
          ],

          client_reference_id:
            requestId,

          line_items: [
            {
              price_data: {
                currency:
                  currency.toLowerCase(),

                product_data: {
                  name:
                    serviceRequest.title ||
                    "Servicio RELYDO",

                  description:
                    providerProfile?.business_name
                      ? `Servicio realizado por ${providerProfile.business_name}`
                      : "Servicio contratado mediante RELYDO",
                },

                unit_amount:
                  amountInCents,
              },

              quantity: 1,
            },
          ],

          metadata: {
            payment_type:
              "initial_job",

            request_id:
              requestId,

            offer_id:
              offerId,

            customer_id:
              auth.user.id,

            professional_id:
              String(
                offer.professional_id
              ),

            payment_settings_id:
              String(
                paymentSettings.id
              ),

            professional_price:
              professionalPrice.toFixed(
                2
              ),

            customer_fee_percent:
              customerFeePercent.toFixed(
                2
              ),

            customer_fee_amount:
              customerFeeAmount.toFixed(
                2
              ),

            customer_total:
              customerTotalAmount.toFixed(
                2
              ),

            provider_commission_percent:
              providerCommissionPercent.toFixed(
                2
              ),

            provider_commission_amount:
              providerCommissionAmount.toFixed(
                2
              ),

            provider_net_amount:
              providerNetAmount.toFixed(
                2
              ),

            platform_revenue_amount:
              platformRevenueAmount.toFixed(
                2
              ),

            currency,
          },

          success_url:
            validMobileReturnUrl
              ? `${validMobileReturnUrl}${validMobileReturnUrl.includes("?") ? "&" : "?"}payment=success&session_id={CHECKOUT_SESSION_ID}`
              : `${origin}/checkout/${requestId}?offer=${offerId}&payment=success&session_id={CHECKOUT_SESSION_ID}`,

          cancel_url:
            validMobileReturnUrl
              ? `${validMobileReturnUrl}${validMobileReturnUrl.includes("?") ? "&" : "?"}payment=cancelled`
              : `${origin}/checkout/${requestId}?offer=${offerId}&payment=cancelled`,
        },
        {
          idempotencyKey:
            `relydo-checkout-${requestId}-${offerId}-${
              validMobileReturnUrl ? "mobile" : "web"
            }`,
        }
      );

    if (!session.url) {
      return NextResponse.json(
        {
          error:
            "Stripe no devolvió una URL de pago.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      url: session.url,
      stripeCheckoutRequired: true,

      amounts: {
        professionalPrice,
        customerFeePercent,
        serviceFee:
          customerFeeAmount,
        total:
          customerTotalAmount,
        providerCommissionPercent,
        providerCommissionAmount,
        providerNetAmount,
        platformRevenueAmount,
      },
    });
  } catch (error) {
    console.error(
      "Error creando Stripe Checkout:",
      error
    );

    return NextResponse.json(
      {
        error:
          "No se pudo crear la sesión de pago.",
        detail:
          process.env.NODE_ENV ===
          "development"
            ? getErrorMessage(error)
            : undefined,
      },
      { status: 500 }
    );
  }
}