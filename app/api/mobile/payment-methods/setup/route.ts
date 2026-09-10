import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

import { getAuthenticatedUser } from "../../../../lib/serverAuth";

const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY!
);

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

export async function GET(
  request: NextRequest
) {
  try {
    const auth =
      await getAuthenticatedUser(request);

    if (!auth.user) {
      return NextResponse.json(
        {
          error:
            "Debes iniciar sesión para consultar tus métodos de pago.",
        },
        { status: 401 }
      );
    }

    const {
      data: profile,
      error: profileError,
    } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", auth.user.id)
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

    const stripeCustomerId =
      String(
        profile?.stripe_customer_id || ""
      ).trim();

    if (!stripeCustomerId) {
      return NextResponse.json({
        success: true,
        paymentMethods: [],
      });
    }

    const customer =
      await stripe.customers.retrieve(
        stripeCustomerId
      );

    if (customer.deleted) {
      return NextResponse.json({
        success: true,
        paymentMethods: [],
      });
    }

    const paymentMethods =
      await stripe.paymentMethods.list({
        customer: stripeCustomerId,
        type: "card",
      });

    const safePaymentMethods =
      paymentMethods.data.map(
        (paymentMethod) => ({
          id: paymentMethod.id,
          type: paymentMethod.type,

          card: paymentMethod.card
            ? {
                brand:
                  paymentMethod.card.brand,

                last4:
                  paymentMethod.card.last4,

                expMonth:
                  paymentMethod.card.exp_month,

                expYear:
                  paymentMethod.card.exp_year,
              }
            : null,
        })
      );

    return NextResponse.json({
      success: true,
      paymentMethods:
        safePaymentMethods,
    });
  } catch (error) {
    console.error(
      "GET PAYMENT METHODS ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "No pudimos consultar tus métodos de pago.",
      },
      { status: 500 }
    );
  }
}