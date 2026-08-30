import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

export const runtime = "nodejs";

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

const vapidSubject = process.env.VAPID_SUBJECT;
const vapidPublicKey =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey =
  process.env.VAPID_PRIVATE_KEY;

if (
  vapidSubject &&
  vapidPublicKey &&
  vapidPrivateKey
) {
  webpush.setVapidDetails(
    vapidSubject,
    vapidPublicKey,
    vapidPrivateKey
  );
}

type Body = {
  requestId?: string;
};

export async function POST(
  request: NextRequest
) {
  try {
    /*
      1. COMPROBAR CONFIGURACIÓN PUSH
    */

    if (
      !vapidSubject ||
      !vapidPublicKey ||
      !vapidPrivateKey
    ) {
      return NextResponse.json(
        {
          error:
            "Las claves VAPID no están configuradas.",
        },
        {
          status: 500,
        }
      );
    }

    /*
      2. VALIDAR USUARIO AUTENTICADO

      El cliente enviará su access token.
      Así nadie puede avisar sobre órdenes
      que no le pertenecen.
    */

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
            "Sesión no válida.",
        },
        {
          status: 401,
        }
      );
    }

    const accessToken =
      authorization.replace(
        "Bearer ",
        ""
      );

    const supabaseUser =
      createClient(
        process.env
          .NEXT_PUBLIC_SUPABASE_URL!,
        process.env
          .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          global: {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },
          },
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        }
      );

    const {
      data: { user },
      error: userError,
    } =
      await supabaseUser.auth.getUser();

    if (
      userError ||
      !user
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

    /*
      3. LEER REQUEST ID
    */

    const body =
      (await request.json()) as Body;

    const requestId =
      body.requestId?.trim();

    if (!requestId) {
      return NextResponse.json(
        {
          error:
            "Falta requestId.",
        },
        {
          status: 400,
        }
      );
    }

    /*
      4. BUSCAR EL TRABAJO

      Además comprobamos que pertenece
      realmente al cliente autenticado.
    */

    const {
      data: trabajo,
      error: trabajoError,
    } = await supabaseAdmin
      .from("service_requests")
      .select(`
        id,
        customer_id,
        preferred_provider_id,
        title,
        city,
        state,
        service_id,
        status
      `)
      .eq(
        "id",
        requestId
      )
      .eq(
        "customer_id",
        user.id
      )
      .maybeSingle();

    if (
      trabajoError ||
      !trabajo
    ) {
      return NextResponse.json(
        {
          error:
            "No encontramos la solicitud o no pertenece al cliente.",
        },
        {
          status: 404,
        }
      );
    }

    if (
      trabajo.status !== "open"
    ) {
      return NextResponse.json(
        {
          success: true,
          sent: 0,
          message:
            "La solicitud ya no está abierta.",
        }
      );
    }

    /*
      5. IDENTIFICAR SERVICIO
    */

    const {
      data: servicio,
      error: servicioError,
    } = await supabaseAdmin
      .from("services")
      .select(`
        id,
        slug
      `)
      .eq(
        "id",
        trabajo.service_id
      )
      .maybeSingle();

    if (
      servicioError ||
      !servicio
    ) {
      return NextResponse.json(
        {
          error:
            "No pudimos identificar el servicio del trabajo.",
        },
        {
          status: 500,
        }
      );
    }

    /*
      6. ELEGIR PROFESIONALES

      CASO A:
      Cliente escogió directamente un Pro.
      Solo notificamos a ese profesional.

      CASO B:
      Trabajo abierto.
      Avisamos a profesionales verificados
      de esa especialidad.
    */

    let providerIds: string[] =
      [];

    if (
      trabajo.preferred_provider_id
    ) {
      const {
        data: proPreferido,
      } = await supabaseAdmin
        .from("provider_profiles")
        .select("user_id")
        .eq(
          "user_id",
          trabajo.preferred_provider_id
        )
        .eq(
          "verification_status",
          "verified"
        )
        .eq(
          "verified",
          true
        )
        .eq(
          "active",
          true
        )
        .maybeSingle();

      if (proPreferido) {
        providerIds = [
          proPreferido.user_id,
        ];
      }
    } else {
      const {
        data: profesionales,
        error:
          profesionalesError,
      } = await supabaseAdmin
        .from("provider_profiles")
        .select("user_id")
        .eq(
          "trade",
          servicio.slug
        )
        .eq(
          "verification_status",
          "verified"
        )
        .eq(
          "verified",
          true
        )
        .eq(
          "active",
          true
        );

      if (profesionalesError) {
        return NextResponse.json(
          {
            error:
              profesionalesError.message,
          },
          {
            status: 500,
          }
        );
      }

      providerIds =
        (
          profesionales || []
        ).map(
          (item) =>
            item.user_id
        );
    }

    if (
      providerIds.length === 0
    ) {
      return NextResponse.json({
        success: true,
        providers: 0,
        devices: 0,
        sent: 0,
        message:
          "No encontramos profesionales disponibles para este servicio.",
      });
    }

    /*
      7. CREAR CONTENIDO DE LA NOTIFICACIÓN
    */

    const titulo =
      trabajo.preferred_provider_id
        ? "🆕 Nueva solicitud para ti"
        : "🆕 Nuevo trabajo disponible";

    const mensaje =
      `${trabajo.title} · ${trabajo.city}, ${trabajo.state}`;

    const notificationType =
      "new_job_available";

    /*
      8. RESERVAR LA NOTIFICACIÓN Y EVITAR DUPLICADOS

      La tabla notifications actúa también como registro
      de idempotencia para este evento.

      IMPORTANTE:
      En Supabase debe existir un índice UNIQUE para:
      user_id + type + request_id cuando type sea
      new_job_available.

      Si este endpoint se ejecuta otra vez para el mismo
      trabajo, el INSERT devolverá PostgreSQL 23505 y ese
      profesional no volverá a recibir el Push.
    */

    const providerIdsToNotify: string[] =
      [];

    let duplicadosOmitidos = 0;

    for (
      const providerId
      of providerIds
    ) {
      const { error: notificationError } =
        await supabaseAdmin
          .from("notifications")
          .insert({
            user_id: providerId,
            type: notificationType,
            title: titulo,
            message: mensaje,
            request_id: trabajo.id,
            read: false,
          });

      if (notificationError) {
        if (
          notificationError.code ===
          "23505"
        ) {
          duplicadosOmitidos += 1;
          continue;
        }

        console.error(
          "Error guardando notificación de nuevo trabajo:",
          notificationError
        );

        return NextResponse.json(
          {
            error:
              notificationError.message,
          },
          {
            status: 500,
          }
        );
      }

      providerIdsToNotify.push(
        providerId
      );
    }

    if (
      providerIdsToNotify.length === 0
    ) {
      return NextResponse.json({
        success: true,
        providers:
          providerIds.length,
        devices: 0,
        sent: 0,
        duplicatesSkipped:
          duplicadosOmitidos,
        message:
          "La notificación de este trabajo ya había sido enviada.",
      });
    }

    /*
      9. BUSCAR DISPOSITIVOS PUSH
      SOLO DE LOS PROS QUE AÚN NO HABÍAN SIDO NOTIFICADOS
    */

    const {
      data: subscriptions,
      error:
        subscriptionsError,
    } = await supabaseAdmin
      .from(
        "push_subscriptions"
      )
      .select(`
        id,
        user_id,
        endpoint,
        p256dh,
        auth
      `)
      .in(
        "user_id",
        providerIdsToNotify
      );

    if (subscriptionsError) {
      return NextResponse.json(
        {
          error:
            subscriptionsError.message,
        },
        {
          status: 500,
        }
      );
    }

    if (
      !subscriptions ||
      subscriptions.length === 0
    ) {
      return NextResponse.json({
        success: true,
        providers:
          providerIdsToNotify.length,
        devices: 0,
        sent: 0,
        duplicatesSkipped:
          duplicadosOmitidos,
        message:
          "Los profesionales encontrados todavía no tienen Push activado.",
      });
    }

    const payload =
      JSON.stringify({
        title: titulo,
        body: mensaje,
        url:
          `/trabajos/${trabajo.id}`,
      });

    /*
      10. ENVIAR A TODOS LOS DISPOSITIVOS
    */

    let enviados = 0;
    let fallidos = 0;
    let eliminados = 0;

    for (
      const subscription
      of subscriptions
    ) {
      try {
        await webpush.sendNotification(
          {
            endpoint:
              subscription.endpoint,

            keys: {
              p256dh:
                subscription.p256dh,

              auth:
                subscription.auth,
            },
          },
          payload
        );

        enviados += 1;
      } catch (error: unknown) {
        fallidos += 1;

        const pushError =
          error as {
            statusCode?: number;
            message?: string;
          };

        console.error(
          "Error Push nuevo trabajo:",
          pushError
        );

        /*
          Suscripción vencida.
          La eliminamos automáticamente.
        */

        if (
          pushError.statusCode ===
            404 ||
          pushError.statusCode ===
            410
        ) {
          const {
            error:
              deleteError,
          } = await supabaseAdmin
            .from(
              "push_subscriptions"
            )
            .delete()
            .eq(
              "id",
              subscription.id
            );

          if (!deleteError) {
            eliminados += 1;
          }
        }
      }
    }

    return NextResponse.json({
      success: true,

      providers:
        providerIds.length,

      devices:
        subscriptions.length,

      sent:
        enviados,

      duplicatesSkipped:
        duplicadosOmitidos,

      failed:
        fallidos,

      removed:
        eliminados,
    });
  } catch (error) {
    console.error(
      "Error general Push nuevo trabajo:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo enviar el aviso Push.",
      },
      {
        status: 500,
      }
    );
  }
}