import {
  NextRequest,
  NextResponse,
} from "next/server";
import Stripe from "stripe";
import {
  createClient,
} from "@supabase/supabase-js";
import { sendRelydoNotification } from "../../../lib/serverNotifications";

const stripe =
  new Stripe(
    process.env.STRIPE_SECRET_KEY!
  );

const supabaseAdmin =
  createClient(
    process.env
      .NEXT_PUBLIC_SUPABASE_URL!,
    process.env
      .SUPABASE_SECRET_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

function dinero(
  valor: number
) {
  return (
    Math.round(
      (valor +
        Number.EPSILON) *
        100
    ) / 100
  );
}

export async function POST(
  request: NextRequest
) {
  try {
    // ======================================================
    // 1. LEER TOKEN DEL CLIENTE
    // ======================================================

    const authorization =
      request.headers.get(
        "authorization"
      );

    if (
      !authorization ||
      !authorization.startsWith(
        "Bearer "
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Debes iniciar sesión como cliente para realizar este pago.",
        },
        {
          status: 401,
        }
      );
    }

    const accessToken =
      authorization.replace(
        "Bearer ",
        ""
      );

    const supabaseUser =
      createClient(
        process.env
          .NEXT_PUBLIC_SUPABASE_URL!,
        process.env
          .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          global: {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },
          },

          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        }
      );

    // ======================================================
    // 2. CONFIRMAR USUARIO
    // ======================================================

    const {
      data: {
        user,
      },
      error:
        userError,
    } =
      await supabaseUser
        .auth.getUser(
          accessToken
        );

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          error:
            "Tu sesión no es válida. Inicia sesión nuevamente.",
        },
        {
          status: 401,
        }
      );
    }

    // ======================================================
    // 3. LEER CHANGE ORDER
    // ======================================================

    const body =
      await request.json();

    const changeOrderId =
      String(
        body?.changeOrderId ||
          ""
      ).trim();

    const mobileReturnUrl =
      String(
        body?.mobileReturnUrl ||
          ""
      ).trim();

    const validMobileReturnUrl =
      mobileReturnUrl.startsWith("relydo://") ||
      mobileReturnUrl.startsWith("exp://")
        ? mobileReturnUrl
        : "";

    const paymentFlow =
      String(body?.paymentFlow || "").trim() === "payment_sheet"
        ? "payment_sheet"
        : "checkout";

    const action =
      String(body?.action || "create").trim() === "confirm"
        ? "confirm"
        : "create";

    const requestedPaymentIntentId =
      String(body?.paymentIntentId || "").trim();

    if (
      !changeOrderId
    ) {
      return NextResponse.json(
        {
          error:
            "Falta el ID del cambio de presupuesto.",
        },
        {
          status: 400,
        }
      );
    }

    // ======================================================
    // 4. BUSCAR CHANGE ORDER
    //
    // Usamos el cliente autenticado.
    // RLS también protege esta consulta.
    // ======================================================

    const {
      data:
        changeOrder,
      error:
        changeOrderError,
    } =
      await supabaseUser
        .from(
          "change_orders"
        )
        .select(`
          id,
          request_id,
          provider_id,
          customer_id,
          reason,
          description,
          original_amount,
          additional_amount,
          new_total_amount,
          status,
          accepted_at,
          rejected_at,
          created_at,
          payment_status,
          stripe_checkout_session_id,
          stripe_payment_intent_id,
          paid_at,
          updated_at
        `)
        .eq(
          "id",
          changeOrderId
        )
        .eq(
          "customer_id",
          user.id
        )
        .maybeSingle();

    if (
      changeOrderError
    ) {
      console.error(
        "Error buscando Change Order:",
        changeOrderError
      );

      return NextResponse.json(
        {
          error:
            "No pudimos consultar el cambio de presupuesto.",
        },
        {
          status: 500,
        }
      );
    }

    if (
      !changeOrder
    ) {
      return NextResponse.json(
        {
          error:
            "No encontramos este cambio de presupuesto o no tienes permiso para pagarlo.",
        },
        {
          status: 404,
        }
      );
    }

    // ======================================================
    // 5. DEBE HABER SIDO ACEPTADO
    // ======================================================

    if (
      changeOrder.status !==
      "accepted"
    ) {
      return NextResponse.json(
        {
          error:
            "Este cambio de presupuesto debe estar aceptado antes de pagarlo.",
        },
        {
          status: 400,
        }
      );
    }

    // ======================================================
    // 5B. EVITAR CHECKOUTS DUPLICADOS / DOBLE COBRO
    // ======================================================

    if (changeOrder.payment_status === "paid") {
      return NextResponse.json(
        {
          error: "Este cambio de presupuesto ya fue pagado.",
          alreadyPaid: true,
        },
        { status: 409 }
      );
    }

    if (paymentFlow === "checkout" && changeOrder.stripe_checkout_session_id) {
      try {
        const existingSession =
          await stripe.checkout.sessions.retrieve(
            changeOrder.stripe_checkout_session_id
          );

        if (
          existingSession.payment_status === "paid" ||
          existingSession.status === "complete"
        ) {
          return NextResponse.json(
            {
              error: "Este cambio de presupuesto ya tiene un pago completado en Stripe.",
              alreadyPaid: true,
              sessionId: existingSession.id,
            },
            { status: 409 }
          );
        }

        if (
          existingSession.status === "open" &&
          existingSession.url
        ) {
          return NextResponse.json({
            success: true,
            reused: true,
            url: existingSession.url,
            sessionId: existingSession.id,
            changeOrderId: changeOrder.id,
          });
        }
      } catch (existingSessionError) {
        console.warn(
          "No se pudo reutilizar la sesión previa de Stripe; se intentará crear una nueva:",
          existingSessionError
        );
      }
    }

    // ======================================================
    // 6. VALIDAR MONTO ADICIONAL
    // ======================================================

    const additionalAmount =
      dinero(
        Number(
          changeOrder
            .additional_amount
        )
      );

    if (
      !Number.isFinite(
        additionalAmount
      ) ||
      additionalAmount <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "El monto adicional del cambio de presupuesto no es válido.",
        },
        {
          status: 400,
        }
      );
    }

    // ======================================================
    // 7. VALIDAR EL TRABAJO
    // ======================================================

    const {
      data:
        serviceRequest,
      error:
        serviceRequestError,
    } =
      await supabaseAdmin
        .from(
          "service_requests"
        )
        .select(`
          id,
          title,
          customer_id,
          preferred_provider_id,
          status,
          job_stage
        `)
        .eq(
          "id",
          changeOrder.request_id
        )
        .maybeSingle();

    if (
      serviceRequestError
    ) {
      return NextResponse.json(
        {
          error:
            "No pudimos consultar el trabajo.",
        },
        {
          status: 500,
        }
      );
    }

    if (
      !serviceRequest
    ) {
      return NextResponse.json(
        {
          error:
            "No encontramos el trabajo correspondiente.",
        },
        {
          status: 404,
        }
      );
    }

    if (
      serviceRequest.customer_id !==
      user.id
    ) {
      return NextResponse.json(
        {
          error:
            "Este trabajo no pertenece a tu cuenta.",
        },
        {
          status: 403,
        }
      );
    }

    if (
      serviceRequest
        .preferred_provider_id !==
      changeOrder.provider_id
    ) {
      return NextResponse.json(
        {
          error:
            "El profesional de este cambio ya no coincide con el profesional contratado.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      serviceRequest.status !==
        "in_progress" ||
      !["arrived", "working"].includes(
        serviceRequest.job_stage || ""
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Este trabajo ya no está en una etapa válida para cobrar un cambio de presupuesto.",
        },
        {
          status: 400,
        }
      );
    }

    // ======================================================
    // 8. CARGAR CONFIGURACIÓN ACTUAL DE RELYDO
    // ======================================================

    const {
      data:
        paymentSettings,
      error:
        settingsError,
    } =
      await supabaseAdmin
        .from(
          "payment_settings"
        )
        .select(`
          id,
          provider_commission_percent,
          customer_service_fee_percent,
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
      !paymentSettings
    ) {
      return NextResponse.json(
        {
          error:
            settingsError
              ? "No pudimos cargar las tarifas de RELYDO."
              : "No existe una configuración activa de pagos.",
        },
        {
          status: 500,
        }
      );
    }

    // ======================================================
    // 9. CALCULAR MONTOS
    // ======================================================

    const customerFeePercent =
      dinero(
        Number(
          paymentSettings
            .customer_service_fee_percent ||
            0
        )
      );

    const providerCommissionPercent =
      dinero(
        Number(
          paymentSettings
            .provider_commission_percent ||
            0
        )
      );

    const customerFeeAmount =
      dinero(
        additionalAmount *
          (customerFeePercent /
            100)
      );

    const customerTotalAmount =
      dinero(
        additionalAmount +
          customerFeeAmount
      );

    const providerCommissionAmount =
      dinero(
        additionalAmount *
          (providerCommissionPercent /
            100)
      );

    const providerNetAmount =
      dinero(
        additionalAmount -
          providerCommissionAmount
      );

    const platformRevenueAmount =
      dinero(
        customerFeeAmount +
          providerCommissionAmount
      );

    const currency =
      (
        paymentSettings.currency ||
        "usd"
      ).toLowerCase();

    // ======================================================
    // 10. CONVERTIR A CENTAVOS
    // ======================================================

    const additionalCents =
      Math.round(
        additionalAmount *
          100
      );

    const customerFeeCents =
      Math.round(
        customerFeeAmount *
          100
      );

    const totalCents =
      Math.round(
        customerTotalAmount *
          100
      );

    if (
      totalCents <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "El total del pago adicional no es válido.",
        },
        {
          status: 400,
        }
      );
    }

    // ======================================================
    // 10B. PAYMENT SHEET NATIVO PARA APP MOVIL
    // ======================================================

    if (paymentFlow === "payment_sheet") {
      if (action === "confirm") {
        if (!requestedPaymentIntentId) {
          return NextResponse.json(
            { error: "Falta el Payment Intent del pago adicional." },
            { status: 400 }
          );
        }

        const paymentIntent =
          await stripe.paymentIntents.retrieve(requestedPaymentIntentId);

        if (paymentIntent.metadata?.payment_type !== "change_order") {
          return NextResponse.json(
            { error: "Este pago no corresponde a un cambio de presupuesto." },
            { status: 400 }
          );
        }

        if (paymentIntent.metadata?.change_order_id !== String(changeOrder.id)) {
          return NextResponse.json(
            { error: "El pago no corresponde a este cambio de presupuesto." },
            { status: 400 }
          );
        }

        if (paymentIntent.metadata?.customer_id !== String(user.id)) {
          return NextResponse.json(
            { error: "Este pago no pertenece a tu cuenta." },
            { status: 403 }
          );
        }

        if (paymentIntent.status !== "succeeded") {
          return NextResponse.json(
            {
              error: "Stripe todavía no confirma este pago adicional.",
              paymentStatus: paymentIntent.status,
            },
            { status: 400 }
          );
        }

        if (paymentIntent.amount !== totalCents) {
          return NextResponse.json(
            { error: "El monto pagado no coincide con el cambio de presupuesto." },
            { status: 400 }
          );
        }

        if (paymentIntent.currency.toLowerCase() !== currency) {
          return NextResponse.json(
            { error: "La moneda del pago no coincide con la configuración de RELYDO." },
            { status: 400 }
          );
        }

        const paidAt = new Date().toISOString();

        const { data: updated, error: updateError } =
          await supabaseAdmin
            .from("change_orders")
            .update({
              payment_status: "paid",
              stripe_payment_intent_id: paymentIntent.id,
              additional_customer_fee_percent: customerFeePercent,
              additional_customer_fee_amount: customerFeeAmount,
              additional_customer_total_amount: customerTotalAmount,
              additional_provider_commission_percent: providerCommissionPercent,
              additional_provider_commission_amount: providerCommissionAmount,
              additional_provider_net_amount: providerNetAmount,
              additional_platform_revenue_amount: platformRevenueAmount,
              paid_at: paidAt,
              updated_at: paidAt,
            })
            .eq("id", changeOrder.id)
            .eq("customer_id", user.id)
            .neq("payment_status", "paid")
            .select("id, request_id, payment_status, paid_at")
            .maybeSingle();

        if (updateError) {
          return NextResponse.json(
            {
              error: `Stripe cobró correctamente, pero RELYDO no pudo guardar el pago adicional: ${updateError.message}`,
            },
            { status: 500 }
          );
        }

        if (!updated) {
          const { data: alreadyUpdated } = await supabaseAdmin
            .from("change_orders")
            .select("id, request_id, payment_status, paid_at")
            .eq("id", changeOrder.id)
            .eq("customer_id", user.id)
            .maybeSingle();

          if (alreadyUpdated?.payment_status !== "paid") {
            return NextResponse.json(
              { error: "No pudimos registrar el pago adicional." },
              { status: 500 }
            );
          }
        } else {
          try {
            await sendRelydoNotification({
              userId: changeOrder.provider_id,
              type: "change_order_paid",
              title: "Pago adicional confirmado",
              titleEn: "Additional payment confirmed",
              message: `El cliente pagó el cambio de presupuesto. Monto adicional: $${additionalAmount.toFixed(
                2
              )}. Neto adicional para ti: $${providerNetAmount.toFixed(2)}.`,
              messageEn: `The customer paid the budget change. Additional amount: $${additionalAmount.toFixed(
                2
              )}. Additional net amount for you: $${providerNetAmount.toFixed(2)}.`,
              requestId: changeOrder.request_id,
              url: `/trabajos/${changeOrder.request_id}`,
            });
          } catch (notificationError) {
            console.warn(
              "El pago adicional quedó confirmado, pero no pudimos notificar al profesional:",
              notificationError
            );
          }
        }

        return NextResponse.json({
          success: true,
          changeOrderId: changeOrder.id,
          requestId: changeOrder.request_id,
          paymentStatus: "paid",
          paymentIntentId: paymentIntent.id,
        });
      }

      if (changeOrder.stripe_payment_intent_id) {
        try {
          const existingPaymentIntent =
            await stripe.paymentIntents.retrieve(
              changeOrder.stripe_payment_intent_id
            );

          if (
            existingPaymentIntent.status === "succeeded" &&
            existingPaymentIntent.metadata?.change_order_id === String(changeOrder.id)
          ) {
            const paidAt = new Date().toISOString();

            await supabaseAdmin
              .from("change_orders")
              .update({
                payment_status: "paid",
                additional_customer_fee_percent: customerFeePercent,
                additional_customer_fee_amount: customerFeeAmount,
                additional_customer_total_amount: customerTotalAmount,
                additional_provider_commission_percent: providerCommissionPercent,
                additional_provider_commission_amount: providerCommissionAmount,
                additional_provider_net_amount: providerNetAmount,
                additional_platform_revenue_amount: platformRevenueAmount,
                paid_at: paidAt,
                updated_at: paidAt,
              })
              .eq("id", changeOrder.id)
              .eq("customer_id", user.id);

            return NextResponse.json({
              success: true,
              alreadyPaid: true,
              changeOrderId: changeOrder.id,
              paymentIntentId: existingPaymentIntent.id,
            });
          }

          if (
            existingPaymentIntent.client_secret &&
            [
              "requires_payment_method",
              "requires_confirmation",
              "requires_action",
            ].includes(existingPaymentIntent.status) &&
            existingPaymentIntent.amount === totalCents &&
            existingPaymentIntent.currency.toLowerCase() === currency
          ) {
            return NextResponse.json({
              success: true,
              reused: true,
              paymentIntentClientSecret: existingPaymentIntent.client_secret,
              paymentIntentId: existingPaymentIntent.id,
              changeOrderId: changeOrder.id,
              amounts: {
                additionalAmount,
                customerFeePercent,
                customerFeeAmount,
                customerTotalAmount,
                providerCommissionPercent,
                providerCommissionAmount,
                providerNetAmount,
                platformRevenueAmount,
                currency: currency.toUpperCase(),
              },
            });
          }
        } catch (existingPaymentIntentError) {
          console.warn(
            "No se pudo reutilizar el Payment Intent previo; se creará uno nuevo:",
            existingPaymentIntentError
          );
        }
      }

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", user.id)
        .maybeSingle();

      const stripeCustomerId =
        typeof profile?.stripe_customer_id === "string" &&
        profile.stripe_customer_id.trim()
          ? profile.stripe_customer_id.trim()
          : undefined;

      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount: totalCents,
          currency,
          automatic_payment_methods: { enabled: true },
          customer: stripeCustomerId,
          transfer_group: `relydo_request_${changeOrder.request_id}`,
          metadata: {
            payment_type: "change_order",
            payment_flow: "payment_sheet",
            change_order_id: String(changeOrder.id),
            request_id: String(changeOrder.request_id),
            customer_id: String(changeOrder.customer_id),
            provider_id: String(changeOrder.provider_id),
            original_amount: Number(changeOrder.original_amount).toFixed(2),
            additional_amount: additionalAmount.toFixed(2),
            new_total_amount: Number(changeOrder.new_total_amount).toFixed(2),
            customer_fee_percent: customerFeePercent.toFixed(2),
            customer_fee_amount: customerFeeAmount.toFixed(2),
            customer_total_amount: customerTotalAmount.toFixed(2),
            provider_commission_percent: providerCommissionPercent.toFixed(2),
            provider_commission_amount: providerCommissionAmount.toFixed(2),
            provider_net_amount: providerNetAmount.toFixed(2),
            platform_revenue_amount: platformRevenueAmount.toFixed(2),
          },
        },
        {
          idempotencyKey: `relydo_change_order_payment_sheet_${changeOrder.id}_${changeOrder.updated_at || changeOrder.accepted_at || "accepted"}`,
        }
      );

      if (!paymentIntent.client_secret) {
        return NextResponse.json(
          { error: "Stripe no devolvió el secreto del Payment Intent." },
          { status: 500 }
        );
      }

      const { error: saveIntentError } = await supabaseAdmin
        .from("change_orders")
        .update({
          stripe_payment_intent_id: paymentIntent.id,
        })
        .eq("id", changeOrder.id)
        .eq("customer_id", user.id)
        .neq("payment_status", "paid");

      if (saveIntentError) {
        return NextResponse.json(
          { error: "No pudimos preparar el pago adicional. Intenta nuevamente." },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        paymentIntentClientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        changeOrderId: changeOrder.id,
        amounts: {
          additionalAmount,
          customerFeePercent,
          customerFeeAmount,
          customerTotalAmount,
          providerCommissionPercent,
          providerCommissionAmount,
          providerNetAmount,
          platformRevenueAmount,
          currency: currency.toUpperCase(),
        },
      });
    }

    // ======================================================
    // 11. URLs DE REGRESO
    // ======================================================

    const origin =
      request.nextUrl.origin;

    const returnSeparator =
      validMobileReturnUrl.includes("?")
        ? "&"
        : "?";

    const successUrl =
      validMobileReturnUrl
        ? `${validMobileReturnUrl}${returnSeparator}change_order_payment=success&change_order_id=${changeOrder.id}&session_id={CHECKOUT_SESSION_ID}`
        : `${origin}/mis-solicitudes/${changeOrder.request_id}` +
          `?change_order_payment=success` +
          `&change_order_id=${changeOrder.id}` +
          `&session_id={CHECKOUT_SESSION_ID}`;

    const cancelUrl =
      validMobileReturnUrl
        ? `${validMobileReturnUrl}${returnSeparator}change_order_payment=cancelled&change_order_id=${changeOrder.id}`
        : `${origin}/mis-solicitudes/${changeOrder.request_id}` +
          `?change_order_payment=cancelled` +
          `&change_order_id=${changeOrder.id}`;

    // ======================================================
    // 12. LINE ITEMS
    // ======================================================

    const lineItems:
      Stripe.Checkout.SessionCreateParams.LineItem[] =
      [
        {
          quantity: 1,

          price_data: {
            currency,

            unit_amount:
              additionalCents,

            product_data: {
              name:
                "Cambio de presupuesto",

              description:
                `Monto adicional aprobado para: ${serviceRequest.title}`,
            },
          },
        },
      ];

    if (
      customerFeeCents > 0
    ) {
      lineItems.push({
        quantity: 1,

        price_data: {
          currency,

          unit_amount:
            customerFeeCents,

          product_data: {
            name:
              "Tarifa de servicio RELYDO",

            description:
              `${customerFeePercent.toFixed(
                2
              )}% sobre el monto adicional`,
          },
        },
      });
    }

    // ======================================================
    // 13. CREAR STRIPE CHECKOUT
    //
    // IMPORTANTE:
    // NO transferimos todavía al profesional.
    // El dinero queda en RELYDO igual que el pago original.
    // ======================================================

    const session =
      await stripe
        .checkout
        .sessions
        .create(
          {
            mode:
              "payment",

            payment_method_types:
              [
                "card",
              ],

            line_items:
              lineItems,

            success_url:
              successUrl,

            cancel_url:
              cancelUrl,

            customer_email:
              user.email ||
              undefined,

            metadata: {
              payment_type:
                "change_order",

              change_order_id:
                String(
                  changeOrder.id
                ),

              request_id:
                String(
                  changeOrder.request_id
                ),

              customer_id:
                String(
                  changeOrder.customer_id
                ),

              provider_id:
                String(
                  changeOrder.provider_id
                ),

              original_amount:
                Number(
                  changeOrder.original_amount
                ).toFixed(2),

              additional_amount:
                additionalAmount.toFixed(
                  2
                ),

              new_total_amount:
                Number(
                  changeOrder.new_total_amount
                ).toFixed(2),

              customer_fee_percent:
                customerFeePercent.toFixed(
                  2
                ),

              customer_fee_amount:
                customerFeeAmount.toFixed(
                  2
                ),

              customer_total_amount:
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
            },

            payment_intent_data: {
              transfer_group:
                `relydo_request_${changeOrder.request_id}`,

              metadata: {
                payment_type:
                  "change_order",

                change_order_id:
                  String(
                    changeOrder.id
                  ),

                request_id:
                  String(
                    changeOrder.request_id
                  ),

                customer_id:
                  String(
                    changeOrder.customer_id
                  ),

                provider_id:
                  String(
                    changeOrder.provider_id
                  ),
              },
            },
          },
          {
            idempotencyKey:
              `relydo_change_order_checkout_${changeOrder.id}_${changeOrder.updated_at || changeOrder.accepted_at || "accepted"}`,
          }
        );

    if (
      !session.url
    ) {
      return NextResponse.json(
        {
          error:
            "Stripe creó la sesión pero no devolvió la URL de pago.",
        },
        {
          status: 500,
        }
      );
    }

    const { error: saveSessionError } =
      await supabaseAdmin
        .from("change_orders")
        .update({
          stripe_checkout_session_id: session.id,
        })
        .eq("id", changeOrder.id)
        .neq("payment_status", "paid");

    if (saveSessionError) {
      console.error(
        "Stripe creó la sesión, pero no se pudo guardar su ID:",
        saveSessionError
      );

      return NextResponse.json(
        {
          error: "No pudimos asegurar la sesión de pago. Intenta nuevamente.",
        },
        { status: 500 }
      );
    }

    // ======================================================
    // 14. RESPUESTA
    // ======================================================

    return NextResponse.json({
      success: true,

      url:
        session.url,

      sessionId:
        session.id,

      changeOrderId:
        changeOrder.id,

      amounts: {
        additionalAmount,

        customerFeePercent,

        customerFeeAmount,

        customerTotalAmount,

        providerCommissionPercent,

        providerCommissionAmount,

        providerNetAmount,

        platformRevenueAmount,

        currency:
          currency.toUpperCase(),
      },
    });
  } catch (error) {
    console.error(
      "Error creando checkout de Change Order:",
      error
    );

    return NextResponse.json(
      {
        error: "No pudimos iniciar el pago adicional.",
      },
      {
        status: 500,
      }
    );
  }
}