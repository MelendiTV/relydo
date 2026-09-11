import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

import { getAuthenticatedUser } from "../../../../lib/serverAuth";

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
    const auth = await getAuthenticatedUser(request);

    if (!auth.user) {
      return NextResponse.json(
        {
          error:
            "Debes iniciar sesión para guardar un método de pago.",
        },
        { status: 401 }
      );
    }

    const userId = auth.user.id;

    const { data: profile, error: profileError } =
      await supabaseAdmin
        .from("profiles")
        .select(
          "stripe_customer_id, full_name, email"
        )
        .eq("id", userId)
        .maybeSingle();

    if (profileError) {
      console.error(
        "PAYMENT METHODS PROFILE ERROR:",
        profileError
      );

      return NextResponse.json(
        {
          error:
            "No pudimos consultar tu perfil.",
        },
        { status: 500 }
      );
    }

    let stripeCustomerId = String(
      profile?.stripe_customer_id || ""
    ).trim();

    if (stripeCustomerId) {
      try {
        const existingCustomer =
          await stripe.customers.retrieve(
            stripeCustomerId
          );

        if (existingCustomer.deleted) {
          stripeCustomerId = "";
        }
      } catch (error) {
        console.error(
          "RETRIEVE STRIPE CUSTOMER ERROR:",
          error
        );

        stripeCustomerId = "";
      }
    }

    if (!stripeCustomerId) {
      const customer =
        await stripe.customers.create({
          email:
            profile?.email ||
            auth.user.email ||
            undefined,
          name:
            profile?.full_name ||
            undefined,
          metadata: {
            relydo_user_id: userId,
          },
        });

      stripeCustomerId = customer.id;

      const { error: updateError } =
        await supabaseAdmin
          .from("profiles")
          .update({
            stripe_customer_id:
              stripeCustomerId,
          })
          .eq("id", userId);

      if (updateError) {
        console.error(
          "SAVE STRIPE CUSTOMER ERROR:",
          updateError
        );

        return NextResponse.json(
          {
            error:
              "No pudimos vincular tu cuenta de pagos.",
          },
          { status: 500 }
        );
      }
    }

    const setupIntent =
      await stripe.setupIntents.create({
        customer: stripeCustomerId,
        payment_method_types: ["card"],
        usage: "off_session",
        metadata: {
          relydo_user_id: userId,
        },
      });

    if (!setupIntent.client_secret) {
      return NextResponse.json(
        {
          error:
            "Stripe no devolvió un SetupIntent válido.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      setupIntentClientSecret:
        setupIntent.client_secret,
      stripeCustomerId,
    });
  } catch (error) {
    console.error(
      "CREATE SETUP INTENT ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "No pudimos preparar Stripe.",
      },
      { status: 500 }
    );
  }
}