import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

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
            "No encontramos una sesión válida.",
        },
        {
          status: 401,
        }
      );
    }

    const accessToken =
      authorization
        .replace(
          "Bearer ",
          ""
        )
        .trim();

    const {
      data: {
        user,
      },
      error:
        userError,
    } =
      await supabaseAdmin.auth.getUser(
        accessToken
      );

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          error:
            "Tu sesión no es válida o expiró.",
        },
        {
          status: 401,
        }
      );
    }

    const {
      data:
        baseProfile,
      error:
        baseProfileError,
    } = await supabaseAdmin
      .from("profiles")
      .select(`
        id,
        role
      `)
      .eq(
        "id",
        user.id
      )
      .maybeSingle();

    if (
      baseProfileError
    ) {
      return NextResponse.json(
        {
          error:
            baseProfileError.message,
        },
        {
          status: 500,
        }
      );
    }

    if (
      !baseProfile ||
      baseProfile.role !==
        "provider"
    ) {
      return NextResponse.json(
        {
          error:
            "Esta cuenta no pertenece a un profesional.",
        },
        {
          status: 403,
        }
      );
    }

    const {
      data:
        providerProfile,
      error:
        providerError,
    } = await supabaseAdmin
      .from(
        "provider_profiles"
      )
      .select(`
        user_id,
        stripe_account_id
      `)
      .eq(
        "user_id",
        user.id
      )
      .maybeSingle();

    if (
      providerError
    ) {
      return NextResponse.json(
        {
          error:
            providerError.message,
        },
        {
          status: 500,
        }
      );
    }

    if (
      !providerProfile
    ) {
      return NextResponse.json(
        {
          error:
            "No encontramos tu perfil profesional.",
        },
        {
          status: 404,
        }
      );
    }

    if (
      !providerProfile.stripe_account_id
    ) {
      return NextResponse.json({
        success: true,

        connected: false,

        readyForPayments:
          false,

        onboardingComplete:
          false,

        chargesEnabled:
          false,

        payoutsEnabled:
          false,

        detailsSubmitted:
          false,

        transfersCapability:
          null,

        disabledReason:
          null,

        currentlyDue: [],

        eventuallyDue: [],

        pastDue: [],

        pendingVerification: [],

        requirementErrors: [],

        futureCurrentlyDue: [],

        futureEventuallyDue: [],

        futurePastDue: [],

        futurePendingVerification: [],
      });
    }

    const account =
      await stripe.accounts.retrieve(
        providerProfile.stripe_account_id
      );

    const chargesEnabled =
      account.charges_enabled ===
      true;

    const payoutsEnabled =
      account.payouts_enabled ===
      true;

    const detailsSubmitted =
      account.details_submitted ===
      true;

    const transfersCapability =
      account.capabilities?.transfers ||
      null;

    const currentlyDue =
      account.requirements?.currently_due ||
      [];

    const eventuallyDue =
      account.requirements?.eventually_due ||
      [];

    const pastDue =
      account.requirements?.past_due ||
      [];

    const pendingVerification =
      account.requirements?.pending_verification ||
      [];

    const disabledReason =
      account.requirements?.disabled_reason ||
      null;

    const requirementErrors =
      account.requirements?.errors ||
      [];

    const futureCurrentlyDue =
      account.future_requirements?.currently_due ||
      [];

    const futureEventuallyDue =
      account.future_requirements?.eventually_due ||
      [];

    const futurePastDue =
      account.future_requirements?.past_due ||
      [];

    const futurePendingVerification =
      account.future_requirements?.pending_verification ||
      [];

    const onboardingComplete =
      detailsSubmitted ===
        true &&
      currentlyDue.length ===
        0 &&
      pastDue.length ===
        0 &&
      pendingVerification.length ===
        0;

    const readyForPayments =
      onboardingComplete ===
        true &&
      payoutsEnabled ===
        true &&
      transfersCapability ===
        "active";

    const {
      error:
        updateError,
    } = await supabaseAdmin
      .from(
        "provider_profiles"
      )
      .update({
        stripe_onboarding_complete:
          onboardingComplete,

        stripe_charges_enabled:
          chargesEnabled,

        stripe_payouts_enabled:
          payoutsEnabled,
      })
      .eq(
        "user_id",
        user.id
      );

    if (
      updateError
    ) {
      return NextResponse.json(
        {
          error:
            `Stripe respondió correctamente, pero no pudimos actualizar RELYDO: ${updateError.message}`,
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,

      connected: true,

      readyForPayments,

      stripeAccountId:
        account.id,

      onboardingComplete,

      chargesEnabled,

      payoutsEnabled,

      detailsSubmitted,

      transfersCapability,

      disabledReason,

      currentlyDue,

      eventuallyDue,

      pastDue,

      pendingVerification,

      requirementErrors,

      futureCurrentlyDue,

      futureEventuallyDue,

      futurePastDue,

      futurePendingVerification,
    });
  } catch (error) {
    console.error(
      "Error consultando estado Stripe:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No pudimos consultar el estado de Stripe.",
      },
      {
        status: 500,
      }
    );
  }
}