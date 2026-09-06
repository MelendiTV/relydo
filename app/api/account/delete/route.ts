import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SECRET_KEY!;

const ACTIVE_REQUEST_STATUSES = ["open", "in_progress"];
const ACTIVE_CLAIM_STATUSES = ["open", "reviewing", "in_review"];

export async function DELETE(request: NextRequest) {
  try {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      console.error(
        "Account deletion: missing Supabase environment variables."
      );

      return NextResponse.json(
        { error: "Account deletion is not configured." },
        { status: 500 }
      );
    }

    const authorization =
      request.headers.get("authorization") || "";

    const accessToken = authorization.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : "";

    if (!accessToken) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    // Validamos al usuario con la clave pública.
    // La clave secreta nunca llega al navegador.
    const authClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data: userData, error: userError } =
      await authClient.auth.getUser(accessToken);

    const user = userData.user;

    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401 }
      );
    }

    const admin = createClient(
      supabaseUrl,
      supabaseServiceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const pending: string[] = [];

    // =========================================================
    // PERFIL / ROL ACTUAL
    // =========================================================
    //
    // Se usa únicamente para saber si además de las
    // comprobaciones generales del cliente debemos comprobar
    // obligaciones activas como profesional.
    // =========================================================

    const {
      data: profile,
      error: profileLookupError,
    } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileLookupError) {
      throw profileLookupError;
    }

    // =========================================================
    // 1. TRABAJOS ACTIVOS COMO CLIENTE
    // =========================================================

    const {
      count: activeJobs,
      error: activeJobsError,
    } = await admin
      .from("service_requests")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("customer_id", user.id)
      .in("status", ACTIVE_REQUEST_STATUSES);

    if (activeJobsError) {
      throw activeJobsError;
    }

    if ((activeJobs || 0) > 0) {
      pending.push(`Active jobs: ${activeJobs}`);
    }

    // =========================================================
    // 2. RECLAMOS ACTIVOS COMO CLIENTE
    // =========================================================

    const {
      count: activeClaims,
      error: activeClaimsError,
    } = await admin
      .from("job_claims")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("customer_id", user.id)
      .in("status", ACTIVE_CLAIM_STATUSES);

    if (activeClaimsError) {
      throw activeClaimsError;
    }

    if ((activeClaims || 0) > 0) {
      pending.push(`Open claims: ${activeClaims}`);
    }

    // =========================================================
    // 3. OBLIGACIONES ACTIVAS COMO PROFESIONAL
    // =========================================================
    //
    // Si la cuenta es Provider, además comprobamos el lado Pro.
    //
    // No contamos solicitudes "open" como trabajos activos del
    // profesional. Una solicitud abierta puede estar disponible
    // nuevamente y ya no ser responsabilidad de ese Pro.
    // =========================================================

    if (profile?.role === "provider") {
      const {
        count: activeProviderJobs,
        error: activeProviderJobsError,
      } = await admin
        .from("service_requests")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("preferred_provider_id", user.id)
        .eq("status", "in_progress");

      if (activeProviderJobsError) {
        throw activeProviderJobsError;
      }

      if ((activeProviderJobs || 0) > 0) {
        pending.push(
          `Active professional jobs: ${activeProviderJobs}`
        );
      }

      const {
        count: activeProviderClaims,
        error: activeProviderClaimsError,
      } = await admin
        .from("job_claims")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("provider_id", user.id)
        .in("status", ACTIVE_CLAIM_STATUSES);

      if (activeProviderClaimsError) {
        throw activeProviderClaimsError;
      }

      if ((activeProviderClaims || 0) > 0) {
        pending.push(
          `Open professional claims: ${activeProviderClaims}`
        );
      }
    }

    // Si tiene algo pendiente, no eliminamos todavía.
    if (pending.length > 0) {
      return NextResponse.json(
        {
          error: "Account has unresolved items.",
          pending,
        },
        { status: 409 }
      );
    }

    // =========================================================
    // 4. ELIMINAR AVATAR DEL STORAGE
    // =========================================================

    const {
      data: avatarFiles,
      error: avatarListError,
    } = await admin.storage
      .from("customer-avatars")
      .list(user.id, {
        limit: 1000,
      });

    if (avatarListError) {
      console.warn(
        "Account deletion: avatar list failed",
        avatarListError
      );
    } else if (avatarFiles?.length) {
      const paths = avatarFiles.map(
        (file) => `${user.id}/${file.name}`
      );

      const { error: avatarRemoveError } =
        await admin.storage
          .from("customer-avatars")
          .remove(paths);

      if (avatarRemoveError) {
        throw avatarRemoveError;
      }
    }

    // =========================================================
    // 5. ANONIMIZAR PERFIL
    // =========================================================
    //
    // Conservamos el UUID para no romper referencias históricas,
    // pero eliminamos los datos personales del usuario.
    //
    // IMPORTANTE:
    // Esto permite que en el futuro el usuario pueda volver a
    // registrarse con el mismo correo como una cuenta nueva.
    // =========================================================

    const { error: profileError } = await admin
      .from("profiles")
      .update({
        full_name: "Deleted user",

        email: null,
        phone: null,

        avatar_url: null,

        city: null,
        state: null,

        zip_code: null,
        zip: null,

        address_line1: null,
        address_line2: null,
        address: null,
      })
      .eq("id", user.id);

    if (profileError) {
      console.warn(
        "Account deletion: profile anonymization failed",
        profileError
      );

      // No eliminamos Auth si no pudimos anonimizar
      // correctamente los datos personales.
      throw profileError;
    }

    // =========================================================
    // 6. ELIMINAR CUENTA DE SUPABASE AUTH
    // =========================================================

    const { error: deleteUserError } =
      await admin.auth.admin.deleteUser(
        user.id,
        false
      );

    if (deleteUserError) {
      throw deleteUserError;
    }

    // =========================================================
    // ÉXITO
    // =========================================================

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error(
      "Account deletion failed:",
      error
    );

    return NextResponse.json(
      {
        error: "We could not delete the account.",
      },
      { status: 500 }
    );
  }
}