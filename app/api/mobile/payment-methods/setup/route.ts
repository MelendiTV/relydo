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

async function getStripeCustomerId(userId: string) {
  const { data: profile, error: profileError } =
    await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();

  if (profileError) {
    console.error(
      "PAYMENT METHODS PROFILE ERROR:",
      profileError
    );

    throw new Error("PROFILE_LOOKUP_FAILED");
  }

  return String(
    profile?.stripe_customer_id || ""
  ).trim();
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);

    if (!auth.user) {
      return NextResponse.json(
        {
          error:
            "Debes iniciar sesión para consultar tus métodos de pago.",
        },
        { status: 401 }
      );
    }

    const stripeCustomerId =
      await getStripeCustomerId(auth.user.id);

    if (!stripeCustomerId) {
      return NextResponse.json({
        success: true,
        paymentMethods: [],
      });
    }

    const customer = await stripe.customers.retrieve(
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
      paymentMethods.data.map((paymentMethod) => ({
        id: paymentMethod.id,
        type: paymentMethod.type,
        card: paymentMethod.card
          ? {
              brand: paymentMethod.card.brand,
              last4: paymentMethod.card.last4,
              expMonth: paymentMethod.card.exp_month,
              expYear: paymentMethod.card.exp_year,
            }
          : null,
      }));

    return NextResponse.json({
      success: true,
      paymentMethods: safePaymentMethods,
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

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);

    if (!auth.user) {
      return NextResponse.json(
        {
          error:
            "Debes iniciar sesión para eliminar un método de pago.",
        },
        { status: 401 }
      );
    }

    const body = await request
      .json()
      .catch(() => ({}));

    const paymentMethodId = String(
      body?.paymentMethodId || ""
    ).trim();

    if (!paymentMethodId) {
      return NextResponse.json(
        {
          error:
            "El método de pago es obligatorio.",
        },
        { status: 400 }
      );
    }

    const stripeCustomerId =
      await getStripeCustomerId(auth.user.id);

    if (!stripeCustomerId) {
      return NextResponse.json(
        {
          error:
            "No encontramos una cuenta de pagos asociada a tu perfil.",
        },
        { status: 404 }
      );
    }

    let paymentMethod: Stripe.PaymentMethod;

    try {
      paymentMethod =
        await stripe.paymentMethods.retrieve(
          paymentMethodId
        );
    } catch (error) {
      console.error(
        "RETRIEVE PAYMENT METHOD ERROR:",
        error
      );

      return NextResponse.json(
        {
          error:
            "No encontramos ese método de pago.",
        },
        { status: 404 }
      );
    }

    if (
      paymentMethod.customer !==
      stripeCustomerId
    ) {
      return NextResponse.json(
        {
          error:
            "No tienes permiso para eliminar este método de pago.",
        },
        { status: 403 }
      );
    }

    await stripe.paymentMethods.detach(
      paymentMethodId
    );

    return NextResponse.json({
      success: true,
      paymentMethodId,
    });
  } catch (error) {
    console.error(
      "DELETE PAYMENT METHOD ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "No pudimos eliminar este método de pago.",
      },
      { status: 500 }
    );
  }
}
