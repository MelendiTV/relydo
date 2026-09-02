import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "../../lib/serverAuth";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (!auth.user) {
      return NextResponse.json(
        { error: "Debes iniciar sesión como cliente para realizar este pago." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const requestId = String(body?.requestId || "").trim();
    const offerId = String(body?.offerId || "").trim();

    if (!requestId || !offerId) {
      return NextResponse.json(
        { error: "Faltan datos de la solicitud o de la oferta." },
        { status: 400 }
      );
    }

    const { data: serviceRequest, error: serviceRequestError } =
      await supabaseAdmin
        .from("service_requests")
        .select("id, title, customer_id, status, preferred_provider_id")
        .eq("id", requestId)
        .eq("customer_id", auth.user.id)
        .maybeSingle();

    if (serviceRequestError) {
      return NextResponse.json(
        { error: "No pudimos consultar la solicitud." },
        { status: 500 }
      );
    }

    if (!serviceRequest) {
      return NextResponse.json(
        { error: "No encontramos la solicitud o no pertenece a tu cuenta." },
        { status: 404 }
      );
    }

    if (serviceRequest.status !== "open") {
      return NextResponse.json(
        { error: "Esta solicitud ya no acepta nuevas contrataciones." },
        { status: 409 }
      );
    }

    const { data: offer, error: offerError } = await supabaseAdmin
      .from("offers")
      .select("id, request_id, professional_id, price, status")
      .eq("id", offerId)
      .eq("request_id", requestId)
      .maybeSingle();

    if (offerError) {
      return NextResponse.json(
        { error: "No pudimos consultar el presupuesto." },
        { status: 500 }
      );
    }

    if (!offer) {
      return NextResponse.json(
        { error: "No encontramos la oferta seleccionada." },
        { status: 404 }
      );
    }

    if (offer.status !== "pending") {
      return NextResponse.json(
        { error: "Esta oferta ya no está disponible para pago." },
        { status: 409 }
      );
    }

    if (
      serviceRequest.preferred_provider_id &&
      serviceRequest.preferred_provider_id !== offer.professional_id
    ) {
      return NextResponse.json(
        { error: "Esta solicitud está dirigida a otro profesional." },
        { status: 409 }
      );
    }

    const { data: existingPayment, error: existingPaymentError } =
      await supabaseAdmin
        .from("payments")
        .select("id, status, provider_payment_id")
        .eq("offer_id", offerId)
        .maybeSingle();

    if (existingPaymentError) {
      return NextResponse.json(
        { error: "No pudimos comprobar pagos anteriores." },
        { status: 500 }
      );
    }

    if (existingPayment?.provider_payment_id) {
      return NextResponse.json(
        { error: "Esta oferta ya tiene un pago registrado." },
        { status: 409 }
      );
    }

    const professionalPrice = money(Number(offer.price));
    if (!Number.isFinite(professionalPrice) || professionalPrice <= 0) {
      return NextResponse.json({ error: "El precio de la oferta no es válido." }, { status: 400 });
    }

    const { data: paymentSettings, error: settingsError } = await supabaseAdmin
      .from("payment_settings")
      .select("id, provider_commission_percent, customer_service_fee_percent, currency, active")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (settingsError || !paymentSettings) {
      return NextResponse.json(
        { error: "No pudimos cargar la configuración de pagos." },
        { status: 500 }
      );
    }

    const customerFeePercent = Number(paymentSettings.customer_service_fee_percent || 0);
    const providerCommissionPercent = Number(paymentSettings.provider_commission_percent || 0);

    if (
      !Number.isFinite(customerFeePercent) || customerFeePercent < 0 ||
      !Number.isFinite(providerCommissionPercent) || providerCommissionPercent < 0
    ) {
      return NextResponse.json(
        { error: "La configuración de comisiones de RELYDO no es válida." },
        { status: 500 }
      );
    }

    const customerFeeAmount = money(professionalPrice * (customerFeePercent / 100));
    const customerTotalAmount = money(professionalPrice + customerFeeAmount);
    const providerCommissionAmount = money(professionalPrice * (providerCommissionPercent / 100));
    const providerNetAmount = money(professionalPrice - providerCommissionAmount);
    const platformRevenueAmount = money(customerFeeAmount + providerCommissionAmount);
    const amountInCents = Math.round(customerTotalAmount * 100);

    const { data: providerProfile } = await supabaseAdmin
      .from("provider_profiles")
      .select("business_name")
      .eq("user_id", offer.professional_id)
      .maybeSingle();

    const configuredOrigin =
      process.env.RELYDO_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "";
    const origin = configuredOrigin.replace(/\/$/, "") || request.nextUrl.origin;

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        client_reference_id: requestId,
        line_items: [
          {
            price_data: {
              currency: String(paymentSettings.currency || "usd").toLowerCase(),
              product_data: {
                name: serviceRequest.title || "Servicio RELYDO",
                description: providerProfile?.business_name
                  ? `Servicio realizado por ${providerProfile.business_name}`
                  : "Servicio contratado mediante RELYDO",
              },
              unit_amount: amountInCents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          payment_type: "initial_job",
          request_id: requestId,
          offer_id: offerId,
          customer_id: auth.user.id,
          professional_id: String(offer.professional_id),
          payment_settings_id: String(paymentSettings.id),
          professional_price: professionalPrice.toFixed(2),
          customer_fee_percent: customerFeePercent.toFixed(2),
          customer_fee_amount: customerFeeAmount.toFixed(2),
          customer_total: customerTotalAmount.toFixed(2),
          provider_commission_percent: providerCommissionPercent.toFixed(2),
          provider_commission_amount: providerCommissionAmount.toFixed(2),
          provider_net_amount: providerNetAmount.toFixed(2),
          platform_revenue_amount: platformRevenueAmount.toFixed(2),
          currency: String(paymentSettings.currency || "usd").toUpperCase(),
        },
        success_url:
          `${origin}/checkout/${requestId}?offer=${offerId}&payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:
          `${origin}/checkout/${requestId}?offer=${offerId}&payment=cancelled`,
      },
      {
        idempotencyKey: `relydo-checkout-${requestId}-${offerId}`,
      }
    );

    if (!session.url) {
      return NextResponse.json({ error: "Stripe no devolvió una URL de pago." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      url: session.url,
      amounts: {
        professionalPrice,
        customerFeePercent,
        serviceFee: customerFeeAmount,
        total: customerTotalAmount,
        providerCommissionPercent,
        providerCommissionAmount,
        providerNetAmount,
        platformRevenueAmount,
      },
    });
  } catch (error) {
    console.error("Error creando Stripe Checkout:", error);
    return NextResponse.json(
      { error: "No se pudo crear la sesión de pago." },
      { status: 500 }
    );
  }
}
