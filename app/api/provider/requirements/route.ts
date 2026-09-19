import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getProviderRequirements } from "../../../lib/providerRequirements";

export const dynamic = "force-dynamic";

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

export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          error: "No encontramos una sesión válida.",
        },
        {
          status: 401,
        }
      );
    }

    const accessToken = authorization
      .slice("Bearer ".length)
      .trim();

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        {
          error: "Tu sesión no es válida o expiró.",
        },
        {
          status: 401,
        }
      );
    }

    const {
      data: provider,
      error: providerError,
    } = await supabaseAdmin
      .from("provider_profiles")
      .select(
        `
          user_id,
          trade,
          state,
          license_required,
          insured,
          bonded
        `
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (providerError) {
      return NextResponse.json(
        {
          error: providerError.message,
        },
        {
          status: 500,
        }
      );
    }

    if (!provider) {
      return NextResponse.json(
        {
          error: "No encontramos tu perfil profesional.",
        },
        {
          status: 404,
        }
      );
    }

    const requirements = getProviderRequirements({
      trade: provider.trade,
      state: provider.state,
      declaredLicenseRequired: provider.license_required,
      declaredInsured: provider.insured,
      declaredBonded: provider.bonded,
    });

    return NextResponse.json({
      success: true,

      jurisdiction: requirements.jurisdiction,

      requirements: {
        license: {
          level: requirements.license,
          required: requirements.effectiveLicenseRequired,
        },

        insurance: {
          level: requirements.insurance,
          required: requirements.effectiveInsuranceRequired,
        },

        bond: {
          level: requirements.bond,
          required: requirements.effectiveBondRequired,
        },
      },

      manualReview: requirements.manualReview,

      notes: {
        es: requirements.notesEs,
        en: requirements.notesEn,
      },
    });
  } catch (error) {
    console.error(
      "Error obteniendo requisitos del profesional:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No pudimos obtener tus requisitos profesionales.",
      },
      {
        status: 500,
      }
    );
  }
}