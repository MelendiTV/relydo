import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createClient,
} from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL!;

const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY!;

type JwtPayload = {
  session_id?: string;
};

function crearAuthClient() {
  return createClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function crearAdminClient() {
  return createClient(
    supabaseUrl,
    supabaseSecretKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function decodeJwtPayload(
  token: string
): JwtPayload | null {
  try {
    const parts = token.split(".");

    if (parts.length !== 3) {
      return null;
    }

    const base64 = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const padded =
      base64 +
      "=".repeat((4 - (base64.length % 4)) % 4);

    const decoded = Buffer.from(
      padded,
      "base64"
    ).toString("utf8");

    return JSON.parse(decoded) as JwtPayload;
  } catch {
    return null;
  }
}

function obtenerIp(
  request: NextRequest
) {
  const forwarded =
    request.headers.get("x-forwarded-for");

  if (forwarded) {
    const firstIp = forwarded
      .split(",")[0]
      .trim();

    return firstIp || null;
  }

  return (
    request.headers.get("x-real-ip") ||
    null
  );
}

async function obtenerUsuario(
  request: NextRequest
) {
  const authorization =
    request.headers.get("authorization") || "";

  const accessToken =
    authorization.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : "";

  if (!accessToken) {
    return {
      user: null,
      accessToken: null,
      error: "Unauthorized.",
    };
  }

  const authClient =
    crearAuthClient();

  const {
    data,
    error,
  } =
    await authClient.auth.getUser(
      accessToken
    );

  if (
    error ||
    !data.user
  ) {
    return {
      user: null,
      accessToken: null,
      error: "Unauthorized.",
    };
  }

  return {
    user: data.user,
    accessToken,
    error: null,
  };
}

function obtenerNombre(
  metadata: Record<string, unknown>
) {
  const candidatos = [
    metadata.full_name,
    metadata.name,
    metadata.display_name,
  ];

  for (
    const candidato of candidatos
  ) {
    if (
      typeof candidato === "string" &&
      candidato.trim()
    ) {
      return candidato.trim();
    }
  }

  return "RELYDO professional";
}

function obtenerAvatar(
  metadata: Record<string, unknown>
) {
  const candidatos = [
    metadata.avatar_url,
    metadata.picture,
  ];

  for (
    const candidato of candidatos
  ) {
    if (
      typeof candidato === "string" &&
      candidato.trim()
    ) {
      return candidato.trim();
    }
  }

  return null;
}

export async function POST(
  request: NextRequest
) {
  try {
    if (
      !supabaseUrl ||
      !supabasePublishableKey ||
      !supabaseSecretKey
    ) {
      return NextResponse.json(
        {
          error:
            "Google professional authentication is not configured.",
        },
        {
          status: 500,
        }
      );
    }

    const {
      user,
      accessToken,
      error: userError,
    } =
      await obtenerUsuario(
        request
      );

    if (
      userError ||
      !user ||
      !accessToken
    ) {
      return NextResponse.json(
        {
          error:
            userError ||
            "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    const admin =
      crearAdminClient();

    const {
      data: existingProfile,
      error: profileReadError,
    } =
      await admin
        .from("profiles")
        .select(`
          id,
          role,
          full_name,
          email,
          avatar_url
        `)
        .eq(
          "id",
          user.id
        )
        .maybeSingle();

    if (profileReadError) {
      throw profileReadError;
    }

    /*
      Una cuenta existente de Cliente o Admin
      nunca se convierte silenciosamente en Pro.
    */

    if (
      existingProfile?.role &&
      existingProfile.role !== "provider"
    ) {
      return NextResponse.json(
        {
          error:
            "This Google account belongs to a different RELYDO account type.",
        },
        {
          status: 403,
        }
      );
    }

    const metadata =
      (user.user_metadata || {}) as Record<
        string,
        unknown
      >;

    const nombre =
      obtenerNombre(metadata);

    const avatar =
      obtenerAvatar(metadata);

    const email =
      user.email || null;

    /*
      Para un Google nuevo creamos únicamente
      la identidad base como provider.

      Los datos profesionales obligatorios se
      completan en /completar-perfil-profesional.
    */

    if (!existingProfile) {
      const {
        error: insertError,
      } =
        await admin
          .from("profiles")
          .insert({
            id: user.id,
            role: "provider",
            full_name: nombre,
            email,
            avatar_url: avatar,
          });

      if (insertError) {
        throw insertError;
      }
    } else {
      const updates: Record<
        string,
        unknown
      > = {};

      if (
        !existingProfile.full_name ||
        existingProfile.full_name ===
          "Deleted user"
      ) {
        updates.full_name =
          nombre;
      }

      if (
        !existingProfile.email &&
        email
      ) {
        updates.email =
          email;
      }

      if (
        !existingProfile.avatar_url &&
        avatar
      ) {
        updates.avatar_url =
          avatar;
      }

      if (
        Object.keys(updates).length >
        0
      ) {
        const {
          error: updateError,
        } =
          await admin
            .from("profiles")
            .update(updates)
            .eq(
              "id",
              user.id
            );

        if (updateError) {
          throw updateError;
        }
      }
    }

    const {
      data: providerProfile,
      error: providerError,
    } =
      await admin
        .from("provider_profiles")
        .select(`
          user_id,
          verification_status,
          verified,
          active
        `)
        .eq(
          "user_id",
          user.id
        )
        .maybeSingle();

    if (providerError) {
      throw providerError;
    }

    if (!providerProfile) {
      return NextResponse.json({
        ok: true,
        needsProviderProfile: true,
        needsVerification: false,
        accountStatus: "profile_incomplete",
      });
    }

    const {
      data: documentos,
      error: documentosError,
    } =
      await admin
        .from("provider_documents")
        .select("id")
        .eq(
          "user_id",
          user.id
        )
        .limit(1);

    if (documentosError) {
      throw documentosError;
    }

    const tieneDocumentos =
      Array.isArray(documentos) &&
      documentos.length > 0;

    if (
      providerProfile.verification_status ===
        "pending" &&
      !tieneDocumentos
    ) {
      return NextResponse.json({
        ok: true,
        needsProviderProfile: false,
        needsVerification: true,
        accountStatus: "verification_incomplete",
      });
    }

    if (
      providerProfile.verification_status ===
      "pending"
    ) {
      return NextResponse.json({
        ok: true,
        needsProviderProfile: false,
        needsVerification: false,
        accountStatus: "pending",
      });
    }

    if (
      providerProfile.verification_status ===
      "rejected"
    ) {
      return NextResponse.json({
        ok: true,
        needsProviderProfile: false,
        needsVerification: false,
        accountStatus: "rejected",
      });
    }

    if (
      providerProfile.verified === true &&
      providerProfile.active !== true
    ) {
      return NextResponse.json({
        ok: true,
        needsProviderProfile: false,
        needsVerification: false,
        accountStatus: "suspended",
      });
    }

    const accesoAprobado =
      providerProfile.verification_status ===
        "verified" &&
      providerProfile.verified === true &&
      providerProfile.active === true;

    if (!accesoAprobado) {
      return NextResponse.json({
        ok: true,
        needsProviderProfile: false,
        needsVerification: false,
        accountStatus: "pending",
      });
    }

    /*
      SESIÓN PROFESIONAL ÚNICA PARA GOOGLE

      Este POST ya recibió y validó el access token
      del OAuth. Cuando el Pro está aprobado,
      hacemos que esta sesión de Google sustituya
      cualquier sesión profesional anterior.
    */

    const payload =
      decodeJwtPayload(accessToken);

    const sessionId =
      typeof payload?.session_id === "string"
        ? payload.session_id.trim()
        : "";

    if (!sessionId) {
      return NextResponse.json(
        {
          error:
            "The Google authentication session does not contain a session_id.",
        },
        {
          status: 401,
        }
      );
    }

    const ahora =
      new Date().toISOString();

    const {
      error: activeSessionError,
    } =
      await admin
        .from("provider_active_sessions")
        .upsert(
          {
            user_id: user.id,
            session_id: sessionId,
            device_info:
              request.headers
                .get("user-agent")
                ?.slice(0, 1000) || null,
            ip_address:
              obtenerIp(request),
            activated_at: ahora,
            updated_at: ahora,
          },
          {
            onConflict: "user_id",
          }
        );

    if (activeSessionError) {
      throw activeSessionError;
    }

    return NextResponse.json({
      ok: true,
      needsProviderProfile: false,
      needsVerification: false,
      accountStatus: "verified",
    });
  } catch (error) {
    console.error(
      "Google professional auth preparation failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          "We could not prepare the RELYDO professional profile.",
      },
      {
        status: 500,
      }
    );
  }
}
