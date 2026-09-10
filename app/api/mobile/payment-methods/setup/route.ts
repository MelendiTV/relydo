import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "../../../../lib/serverAuth";

export const dynamic = "force-dynamic";

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

export async function POST(request: NextRequest) {
  try {
    // 1. Autenticar usuario RELYDO
    const auth = await getAuthenticatedUser(request);

    if (!auth.user) {
      return NextResponse.json(
        {
          error: "Debes iniciar sesión para administrar tus métodos de pago.",
        },
        { status: 401 }
      );
    }

    // 2. Obtener perfil y Stripe Customer existente
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, stripe_customer_id")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (profileError) {
      console.error(
        "Error consultando perfil para Stripe:",
        profileError
      );

      return NextResponse.json(
        {
          error: "No pudimos consultar tu perfil.",
        },
        { status: 500 }
      );
    }

    if (!profile) {
      return NextResponse.json(
        {
          error: "No encontramos tu perfil de RELYDO.",
        },
        { status: 404 }
      );
    }

    let stripeCustomerId =
      typeof profile.stripe_customer_id === "string"
        ? profile.stripe_customer_id.trim()
        : "";

    // 3. Validar Customer existente
    if (stripeCustomerId) {
      try {
        const existingCustomer =
          await stripe.customers.retrieve(stripeCustomerId);

        if (existingCustomer.deleted) {
          stripeCustomerId = "";
        }
      } catch (stripeError) {
        console.warn(
          "Stripe Customer guardado ya no es válido:",
          stripeError
        );

        stripeCustomerId = "";
      }
    }

    // 4. Crear Customer si todavía no existe
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create(
        {
          email:
            profile.email ||
            auth.user.email ||
            undefined,

          name:
            profile.full_name ||
            auth.user.user_metadata?.full_name ||
            undefined,

          metadata: {
            relydo_user_id: auth.user.id,
          },
        },
        {
          idempotencyKey: `relydo-customer-${auth.user.id}`,
        }
      );

      stripeCustomerId = customer.id;

      const { error: saveCustomerError } =
        await supabaseAdmin
          .from("profiles")
          .update({
            stripe_customer_id: stripeCustomerId,
          })
          .eq("id", auth.user.id);

      if (saveCustomerError) {
        console.error(
          "Stripe Customer creado pero no guardado en RELYDO:",
          saveCustomerError
        );

        return NextResponse.json(
          {
            error:
              "Stripe creó tu perfil de pago, pero RELYDO no pudo guardarlo.",
          },
          { status: 500 }
        );
      }
    }

    // 5. Crear SetupIntent.
    // No cobra dinero: solamente prepara una tarjeta para uso futuro.
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      usage: "off_session",

      metadata: {
        relydo_user_id: auth.user.id,
        purpose: "saved_payment_method",
      },
    });

    if (!setupIntent.client_secret) {
      return NextResponse.json(
        {
          error:
            "Stripe no devolvió la información necesaria para configurar el método de pago.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      customerId: stripeCustomerId,
      setupIntentClientSecret: setupIntent.client_secret,
    });
  } catch (error) {
    console.error(
      "Error preparando método de pago Stripe:",
      error
    );

    return NextResponse.json(
      {
        error:
          "No pudimos preparar tu método de pago.",
      },
      { status: 500 }
    );
  }
}