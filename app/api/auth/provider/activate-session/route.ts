import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
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

type JwtPayload = {
  session_id?: string;
  sub?: string;
  exp?: number;
};

function obtenerAccessToken(request: NextRequest) {
  const authorization =
    request.headers.get("authorization") || "";

  return authorization
    .toLowerCase()
    .startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
}

function decodeJwtPayload(token: string): JwtPayload | null {
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

function obtenerIp(request: NextRequest) {
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

async function validarSesionProfesional(
  request: NextRequest
) {
  const accessToken =
    obtenerAccessToken(request);

  if (!accessToken) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error:
            "Authorization token is required.",
        },
        {
          status: 401,
        }
      ),
    };
  }

  const {
    data: userData,
    error: userError,
  } = await supabaseAdmin.auth.getUser(
    accessToken
  );

  const user = userData.user;

  if (userError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error:
            "The session is no longer valid.",
        },
        {
          status: 401,
        }
      ),
    };
  }

  const {
    data: profile,
    error: profileError,
  } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.role !== "provider"
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error:
            "This account is not a professional account.",
        },
        {
          status: 403,
        }
      ),
    };
  }

  const payload =
    decodeJwtPayload(accessToken);

  const sessionId =
    typeof payload?.session_id === "string"
      ? payload.session_id.trim()
      : "";

  if (!sessionId) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error:
            "The authentication session does not contain a session_id.",
        },
        {
          status: 401,
        }
      ),
    };
  }

  return {
    ok: true as const,
    accessToken,
    user,
    sessionId,
  };
}

export async function GET(
  request: NextRequest
) {
  try {
    const validated =
      await validarSesionProfesional(
        request
      );

    if (!validated.ok) {
      return validated.response;
    }

    const {
      data: activeSession,
      error: activeSessionError,
    } = await supabaseAdmin
      .from("provider_active_sessions")
      .select("session_id")
      .eq("user_id", validated.user.id)
      .maybeSingle();

    if (activeSessionError) {
      console.error(
        "RELYDO provider session check error:",
        activeSessionError
      );

      return NextResponse.json(
        {
          error:
            "Could not verify the professional session.",
        },
        {
          status: 500,
        }
      );
    }

    if (
      !activeSession ||
      activeSession.session_id !==
        validated.sessionId
    ) {
      return NextResponse.json(
        {
          active: false,
          code:
            "PROVIDER_SESSION_REPLACED",
        },
        {
          status: 409,
        }
      );
    }

    return NextResponse.json({
      active: true,
    });
  } catch (error) {
    console.error(
      "RELYDO provider session check failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unexpected server error.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(
  request: NextRequest
) {
  try {
    const validated =
      await validarSesionProfesional(
        request
      );

    if (!validated.ok) {
      return validated.response;
    }

    const body = await request
      .json()
      .catch(() => ({}));

    const deviceInfo =
      typeof body?.deviceInfo === "string"
        ? body.deviceInfo
            .trim()
            .slice(0, 1000)
        : request.headers
            .get("user-agent")
            ?.slice(0, 1000) || null;

    const ipAddress =
      obtenerIp(request);

    const ahora =
      new Date().toISOString();

    const {
      data: activeSession,
      error: sessionError,
    } = await supabaseAdmin
      .from("provider_active_sessions")
      .upsert(
        {
          user_id:
            validated.user.id,
          session_id:
            validated.sessionId,
          device_info:
            deviceInfo,
          ip_address:
            ipAddress,
          activated_at:
            ahora,
          updated_at:
            ahora,
        },
        {
          onConflict: "user_id",
        }
      )
      .select(
        "user_id, activated_at, updated_at"
      )
      .single();

    if (
      sessionError ||
      !activeSession
    ) {
      console.error(
        "RELYDO provider active session error:",
        sessionError
      );

      return NextResponse.json(
        {
          error:
            "Could not activate the professional session.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,
      userId:
        validated.user.id,
      activatedAt:
        activeSession.activated_at,
    });
  } catch (error) {
    console.error(
      "RELYDO activate provider session error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unexpected server error.",
      },
      {
        status: 500,
      }
    );
  }
}
