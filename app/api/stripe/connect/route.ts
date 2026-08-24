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

export async function POST(
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
        role,
        full_name,
        email
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
            `No pudimos verificar tu cuenta: ${baseProfileError.message}`,
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
        business_name,
        verification_status,
        verified,
        active,
        stripe_account_id,
        stripe_onboarding_complete,
        stripe_charges_enabled,
        stripe_payouts_enabled
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
            `No pudimos cargar tu perfil profesional: ${providerError.message}`,
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

    const estaVerificado =
      providerProfile.verification_status ===
        "verified" &&
      providerProfile.verified ===
        true &&
      providerProfile.active ===
        true;

    if (
      !estaVerificado
    ) {
      return NextResponse.json(
        {
          error:
            "Debes tener una cuenta profesional verificada y activa antes de configurar tus pagos.",
        },
        {
          status: 403,
        }
      );
    }

    let stripeAccountId =
      providerProfile.stripe_account_id;

    if (
      stripeAccountId
    ) {
      try {
        await stripe.accounts.retrieve(
          stripeAccountId
        );
      } catch (error) {
        console.error(
          "La cuenta Stripe guardada no pudo consultarse:",
          error
        );

        return NextResponse.json(
          {
            error:
              "La cuenta Stripe Connect guardada no está disponible. Contacta a soporte de RELYDO antes de crear otra cuenta.",
          },
          {
            status: 409,
          }
        );
      }
    }

    if (
      !stripeAccountId
    ) {
      const account =
        await stripe.accounts.create(
          {
            type: "express",

            country: "US",

            email:
              user.email ||
              baseProfile.email ||
              undefined,

            capabilities: {
              transfers: {
                requested: true,
              },
            },

            business_profile: {
              product_description:
                "Servicios profesionales contratados mediante RELYDO",
            },

            metadata: {
              relydo_provider_id:
                user.id,

              business_name:
                providerProfile.business_name ||
                "",
            },
          },
          {
            idempotencyKey:
              `relydo_connect_account_${user.id}`,
          }
        );

      stripeAccountId =
        account.id;

      const {
        error:
          saveAccountError,
      } = await supabaseAdmin
        .from(
          "provider_profiles"
        )
        .update({
          stripe_account_id:
            stripeAccountId,

          stripe_onboarding_complete:
            false,

          stripe_charges_enabled:
            false,

          stripe_payouts_enabled:
            false,
        })
        .eq(
          "user_id",
          user.id
        );

      if (
        saveAccountError
      ) {
        console.error(
          "Stripe creó la cuenta, pero Supabase no pudo guardarla:",
          saveAccountError
        );

        return NextResponse.json(
          {
            error:
              `Stripe creó la cuenta, pero RELYDO no pudo guardarla: ${saveAccountError.message}`,
          },
          {
            status: 500,
          }
        );
      }
    }

    const origin =
      request.nextUrl.origin;

    const accountLink =
      await stripe.accountLinks.create(
        {
          account:
            stripeAccountId,

          refresh_url:
            `${origin}/panel-profesional?stripe=refresh`,

          return_url:
            `${origin}/panel-profesional?stripe=return`,

          type:
            "account_onboarding",
        }
      );

    return NextResponse.json(
      {
        success: true,

        url:
          accountLink.url,

        stripeAccountId,
      }
    );
  } catch (error) {
    console.error(
      "Error creando Stripe Connect:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo iniciar la configuración de pagos.",
      },
      {
        status: 500,
      }
    );
  }
}