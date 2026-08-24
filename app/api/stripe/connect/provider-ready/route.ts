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

    const providerId =
      request.nextUrl.searchParams
        .get("providerId")
        ?.trim();

    if (!providerId) {
      return NextResponse.json(
        {
          error:
            "Falta providerId.",
        },
        {
          status: 400,
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
        verification_status,
        verified,
        active,
        stripe_account_id
      `)
      .eq(
        "user_id",
        providerId
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
            "No encontramos este profesional.",
        },
        {
          status: 404,
        }
      );
    }

    const providerVerified =
      providerProfile.verification_status ===
        "verified" &&
      providerProfile.verified ===
        true &&
      providerProfile.active ===
        true;

    if (
      !providerVerified
    ) {
      return NextResponse.json({
        success: true,
        providerReady: false,
        reason:
          "provider_not_verified",
      });
    }

    if (
      !providerProfile.stripe_account_id
    ) {
      return NextResponse.json({
        success: true,
        providerReady: false,
        reason:
          "stripe_not_connected",
      });
    }

    const account =
      await stripe.accounts.retrieve(
        providerProfile.stripe_account_id
      );

    const onboardingComplete =
      account.details_submitted ===
        true &&
      (account.requirements?.currently_due ||
        []).length ===
        0 &&
      (account.requirements?.past_due ||
        []).length ===
        0 &&
      (account.requirements
        ?.pending_verification ||
        []).length ===
        0;

    const payoutsEnabled =
      account.payouts_enabled ===
      true;

    const transfersCapability =
      account.capabilities?.transfers ||
      null;

    const providerReady =
      onboardingComplete ===
        true &&
      payoutsEnabled ===
        true &&
      transfersCapability ===
        "active";

    await supabaseAdmin
      .from(
        "provider_profiles"
      )
      .update({
        stripe_onboarding_complete:
          onboardingComplete,
        stripe_charges_enabled:
          account.charges_enabled ===
          true,
        stripe_payouts_enabled:
          payoutsEnabled,
      })
      .eq(
        "user_id",
        providerId
      );

    return NextResponse.json({
      success: true,
      providerReady,
      reason:
        providerReady
          ? null
          : "stripe_not_ready",
      onboardingComplete,
      payoutsEnabled,
      transfersCapability,
    });
  } catch (error) {
    console.error(
      "Error comprobando pagos del profesional:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No pudimos comprobar los pagos del profesional.",
      },
      {
        status: 500,
      }
    );
  }
}