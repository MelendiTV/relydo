import {
  createClient,
  type User,
} from "@supabase/supabase-js";

import {
  NextRequest,
  NextResponse,
} from "next/server";

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

const MAX_INTENTOS = 3;

const RETRY_DELAYS = [
  250,
  600,
];

type JwtPayload = {
  session_id?: string;
  sub?: string;
  exp?: number;
};

type ProviderProfileBase = {
  id: string;
  role: string | null;
};

type ActiveSessionRow = {
  session_id: string;
};

type ActivatedSessionRow = {
  user_id: string;
  activated_at: string;
  updated_at: string;
};

function esperar(ms: number) {
  return new Promise<void>(
    (resolve) => {
      setTimeout(resolve, ms);
    }
  );
}

function obtenerStatusError(
  error: unknown
) {
  if (
    error &&
    typeof error === "object" &&
    "status" in error
  ) {
    const status = (
      error as {
        status?: unknown;
      }
    ).status;

    if (
      typeof status === "number"
    ) {
      return status;
    }
  }

  return null;
}

function obtenerMensajeError(
  error: unknown
) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error
  ) {
    const message = (
      error as {
        message?: unknown;
      }
    ).message;

    if (
      typeof message === "string"
    ) {
      return message;
    }
  }

  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return String(error);
}

async function esperarReintento(
  intento: number
) {
  const indice =
    Math.min(
      intento,
      RETRY_DELAYS.length - 1
    );

  await esperar(
    RETRY_DELAYS[indice]
  );
}

function obtenerAccessToken(
  request: NextRequest
) {
  const authorization =
    request.headers.get(
      "authorization"
    ) || "";

  return authorization
    .toLowerCase()
    .startsWith("bearer ")
    ? authorization
        .slice(7)
        .trim()
    : "";
}

function decodeJwtPayload(
  token: string
): JwtPayload | null {
  try {
    const parts =
      token.split(".");

    if (
      parts.length !== 3
    ) {
      return null;
    }

    const base64 =
      parts[1]
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    const padded =
      base64 +
      "=".repeat(
        (
          4 -
          (base64.length % 4)
        ) % 4
      );

    const decoded =
      Buffer.from(
        padded,
        "base64"
      ).toString("utf8");

    return JSON.parse(
      decoded
    ) as JwtPayload;
  } catch {
    return null;
  }
}

function obtenerIp(
  request: NextRequest
) {
  const forwarded =
    request.headers.get(
      "x-forwarded-for"
    );

  if (forwarded) {
    const firstIp =
      forwarded
        .split(",")[0]
        .trim();

    return firstIp || null;
  }

  return (
    request.headers.get(
      "x-real-ip"
    ) || null
  );
}

async function validarSesionProfesional(
  request: NextRequest
) {
  const accessToken =
    obtenerAccessToken(
      request
    );

  if (!accessToken) {
    return {
      ok: false as const,

      response:
        NextResponse.json(
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

  /*
    VERIFICAR TOKEN / USUARIO

    Si Supabase Auth tiene un fallo
    temporal, hacemos varios intentos.

    Un 401 auténtico NO se reintenta.
  */

  let user:
    User | null = null;

  let ultimoAuthError:
    unknown = null;

  for (
    let intento = 0;
    intento < MAX_INTENTOS;
    intento += 1
  ) {
    const {
      data,
      error,
    } =
      await supabaseAdmin.auth.getUser(
        accessToken
      );

    if (
      !error &&
      data.user
    ) {
      user = data.user;
      ultimoAuthError = null;
      break;
    }

    /*
      Si Supabase respondió
      correctamente pero no hay usuario,
      la sesión realmente no es válida.
    */

    if (
      !error &&
      !data.user
    ) {
      return {
        ok: false as const,

        response:
          NextResponse.json(
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

    const status =
      obtenerStatusError(
        error
      );

    /*
      Un 401 real significa que
      el token ya no es válido.
    */

    if (
      status === 401
    ) {
      console.warn(
        "RELYDO provider auth session invalid:",
        {
          status,
          message:
            obtenerMensajeError(
              error
            ),
        }
      );

      return {
        ok: false as const,

        response:
          NextResponse.json(
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

    /*
      Cualquier otro error puede
      ser temporal: timeout, 500,
      Gateway Timeout, 502, 503,
      504, etc.
    */

    ultimoAuthError =
      error;

    console.warn(
      `RELYDO provider auth check temporary failure (${intento + 1}/${MAX_INTENTOS}):`,
      {
        status,
        message:
          obtenerMensajeError(
            error
          ),
      }
    );

    if (
      intento <
      MAX_INTENTOS - 1
    ) {
      await esperarReintento(
        intento
      );
    }
  }

  if (!user) {
    console.error(
      "RELYDO provider auth check failed after retries:",
      ultimoAuthError
    );

    return {
      ok: false as const,

      response:
        NextResponse.json(
          {
            error:
              "Could not verify the authentication session.",
          },
          {
            status: 500,
          }
        ),
    };
  }

  /*
    VERIFICAR ROLE EN profiles

    También hacemos retry porque
    ya comprobamos que Supabase
    puede responder temporalmente
    con Gateway Timeout.
  */

  let profile:
    ProviderProfileBase | null =
      null;

  let profileConsultaCompleta =
    false;

  let ultimoProfileError:
    unknown = null;

  for (
    let intento = 0;
    intento < MAX_INTENTOS;
    intento += 1
  ) {
    const {
      data,
      error,
    } = await supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq(
        "id",
        user.id
      )
      .maybeSingle();

    if (!error) {
      profile =
        data as
          | ProviderProfileBase
          | null;

      profileConsultaCompleta =
        true;

      ultimoProfileError =
        null;

      break;
    }

    ultimoProfileError =
      error;

    console.warn(
      `RELYDO provider profile temporary failure (${intento + 1}/${MAX_INTENTOS}):`,
      error
    );

    if (
      intento <
      MAX_INTENTOS - 1
    ) {
      await esperarReintento(
        intento
      );
    }
  }

  if (
    !profileConsultaCompleta
  ) {
    console.error(
      "RELYDO provider profile check failed after retries:",
      ultimoProfileError
    );

    return {
      ok: false as const,

      response:
        NextResponse.json(
          {
            error:
              "Could not verify the professional account.",
          },
          {
            status: 500,
          }
        ),
    };
  }

  /*
    Aquí la consulta terminó
    correctamente.

    Solo ahora podemos afirmar
    que la cuenta realmente no
    es profesional.
  */

  if (
    !profile ||
    profile.role !==
      "provider"
  ) {
    return {
      ok: false as const,

      response:
        NextResponse.json(
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
    decodeJwtPayload(
      accessToken
    );

  const sessionId =
    typeof payload?.session_id ===
    "string"
      ? payload.session_id.trim()
      : "";

  if (!sessionId) {
    return {
      ok: false as const,

      response:
        NextResponse.json(
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

    if (
      !validated.ok
    ) {
      return validated.response;
    }

    /*
      VERIFICAR SESIÓN PRO ACTIVA

      También usamos retry para
      evitar expulsar al profesional
      por un fallo temporal de
      provider_active_sessions.
    */

    let activeSession:
      ActiveSessionRow | null =
        null;

    let consultaCompleta =
      false;

    let ultimoError:
      unknown = null;

    for (
      let intento = 0;
      intento < MAX_INTENTOS;
      intento += 1
    ) {
      const {
        data,
        error,
      } =
        await supabaseAdmin
          .from(
            "provider_active_sessions"
          )
          .select(
            "session_id"
          )
          .eq(
            "user_id",
            validated.user.id
          )
          .maybeSingle();

      if (!error) {
        activeSession =
          data as
            | ActiveSessionRow
            | null;

        consultaCompleta =
          true;

        ultimoError =
          null;

        break;
      }

      ultimoError =
        error;

      console.warn(
        `RELYDO provider active session temporary failure (${intento + 1}/${MAX_INTENTOS}):`,
        error
      );

      if (
        intento <
        MAX_INTENTOS - 1
      ) {
        await esperarReintento(
          intento
        );
      }
    }

    if (
      !consultaCompleta
    ) {
      console.error(
        "RELYDO provider session check failed after retries:",
        ultimoError
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

    /*
      Si la consulta fue correcta
      y el session_id no coincide,
      entonces sí es una sesión
      reemplazada real.
    */

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

    if (
      !validated.ok
    ) {
      return validated.response;
    }

    const body =
      await request
        .json()
        .catch(
          () => ({})
        );

    const deviceInfo =
      typeof body?.deviceInfo ===
      "string"
        ? body.deviceInfo
            .trim()
            .slice(
              0,
              1000
            )
        : request.headers
            .get(
              "user-agent"
            )
            ?.slice(
              0,
              1000
            ) || null;

    const ipAddress =
      obtenerIp(
        request
      );

    const ahora =
      new Date()
        .toISOString();

    /*
      ACTIVAR SESIÓN PRO

      El upsert es idempotente para
      user_id, por lo que podemos
      reintentarlo de forma segura
      ante un fallo temporal.
    */

    let activeSession:
      ActivatedSessionRow | null =
        null;

    let ultimoError:
      unknown = null;

    for (
      let intento = 0;
      intento < MAX_INTENTOS;
      intento += 1
    ) {
      const {
        data,
        error,
      } =
        await supabaseAdmin
          .from(
            "provider_active_sessions"
          )
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
              onConflict:
                "user_id",
            }
          )
          .select(
            "user_id, activated_at, updated_at"
          )
          .single();

      if (
        !error &&
        data
      ) {
        activeSession =
          data as ActivatedSessionRow;

        ultimoError =
          null;

        break;
      }

      ultimoError =
        error;

      console.warn(
        `RELYDO provider session activation temporary failure (${intento + 1}/${MAX_INTENTOS}):`,
        error
      );

      if (
        intento <
        MAX_INTENTOS - 1
      ) {
        await esperarReintento(
          intento
        );
      }
    }

    if (!activeSession) {
      console.error(
        "RELYDO provider active session failed after retries:",
        ultimoError
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