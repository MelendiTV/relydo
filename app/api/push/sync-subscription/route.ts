import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type SyncPushBody = {
  endpoint?: unknown;
  p256dh?: unknown;
  auth?: unknown;
  userAgent?: unknown;
};

function getBearerToken(request: NextRequest) {
  const authorization =
    request.headers.get("authorization") || "";

  if (!authorization.startsWith("Bearer ")) {
    return "";
  }

  return authorization.slice(7).trim();
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const supabaseSecretKey =
      process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseSecretKey) {
      console.error(
        "RELYDO push sync: faltan variables de Supabase en el servidor."
      );

      return NextResponse.json(
        {
          error:
            "Push subscription sync is not configured.",
        },
        {
          status: 500,
        }
      );
    }

    const accessToken =
      getBearerToken(request);

    if (!accessToken) {
      return NextResponse.json(
        {
          error: "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseSecretKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(
      accessToken
    );

    if (userError || !user) {
      return NextResponse.json(
        {
          error: "Unauthorized.",
        },
        {
          status: 401,
        }
      );
    }

    const body =
      (await request.json()) as SyncPushBody;

    const endpoint =
      typeof body.endpoint === "string"
        ? body.endpoint.trim()
        : "";

    const p256dh =
      typeof body.p256dh === "string"
        ? body.p256dh.trim()
        : "";

    const auth =
      typeof body.auth === "string"
        ? body.auth.trim()
        : "";

    const userAgent =
      typeof body.userAgent === "string"
        ? body.userAgent.trim().slice(0, 1000)
        : null;

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        {
          error: "Invalid Push subscription.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !endpoint.startsWith("https://") ||
      endpoint.length > 4096 ||
      p256dh.length > 2048 ||
      auth.length > 2048
    ) {
      return NextResponse.json(
        {
          error: "Invalid Push subscription.",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: existing,
      error: existingError,
    } = await supabaseAdmin
      .from("push_subscriptions")
      .select(
        "id, user_id, endpoint, p256dh, auth"
      )
      .eq("endpoint", endpoint)
      .maybeSingle();

    if (existingError) {
      console.error(
        "RELYDO push sync: no se pudo consultar el endpoint:",
        existingError
      );

      return NextResponse.json(
        {
          error:
            "Could not verify Push subscription.",
        },
        {
          status: 500,
        }
      );
    }

    const now =
      new Date().toISOString();

    if (
      existing &&
      existing.user_id !== user.id
    ) {
      /*
        El navegador demuestra que posee la misma
        suscripción enviando el endpoint y las mismas
        claves que ya están guardadas.

        Esto permite que un mismo navegador cambie de
        cuenta RELYDO sin relajar RLS y sin crear una
        segunda suscripción imposible para el mismo
        origen/service worker.
      */
      const sameSubscription =
        existing.p256dh === p256dh &&
        existing.auth === auth;

      if (!sameSubscription) {
        return NextResponse.json(
          {
            error:
              "This Push endpoint is already registered with different keys.",
            code:
              "PUSH_ENDPOINT_KEY_CONFLICT",
          },
          {
            status: 409,
          }
        );
      }

      const {
        error: transferError,
      } = await supabaseAdmin
        .from("push_subscriptions")
        .update({
          user_id: user.id,
          p256dh,
          auth,
          user_agent: userAgent,
          updated_at: now,
        })
        .eq("id", existing.id);

      if (transferError) {
        console.error(
          "RELYDO push sync: no se pudo reasignar el endpoint al usuario autenticado:",
          transferError
        );

        return NextResponse.json(
          {
            error:
              "Could not sync Push subscription.",
          },
          {
            status: 500,
          }
        );
      }

      return NextResponse.json({
        success: true,
        transferred: true,
        userId: user.id,
      });
    }

    const {
      error: upsertError,
    } = await supabaseAdmin
      .from("push_subscriptions")
      .upsert(
        {
          user_id: user.id,
          endpoint,
          p256dh,
          auth,
          user_agent: userAgent,
          updated_at: now,
        },
        {
          onConflict: "endpoint",
        }
      );

    if (upsertError) {
      console.error(
        "RELYDO push sync: no se pudo guardar la suscripción:",
        upsertError
      );

      return NextResponse.json(
        {
          error:
            "Could not sync Push subscription.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,
      transferred: false,
      userId: user.id,
    });
  } catch (error) {
    console.error(
      "RELYDO push sync unexpected error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unexpected Push subscription sync error.",
      },
      {
        status: 500,
      }
    );
  }
}
