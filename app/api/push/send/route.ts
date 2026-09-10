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

type PushBody = {
  userId?: string;
  title?: string;
  body?: string;
  url?: string;
};

type ExpoPushTicket = {
  status?: "ok" | "error";
  id?: string;
  message?: string;
  details?: {
    error?: string;
  };
};

export async function POST(
  request: NextRequest
) {
  try {
    /*
      SEGURIDAD

      Esta ruta NO se llama directamente
      desde el navegador.

      Solo otros procesos seguros de RELYDO
      podrán utilizarla.
    */

    const secret =
      request.headers.get(
        "x-relydo-secret"
      );

    if (
      !process.env.RELYDO_CRON_SECRET ||
      secret !==
        process.env.RELYDO_CRON_SECRET
    ) {
      return NextResponse.json(
        {
          error:
            "No autorizado.",
        },
        {
          status: 401,
        }
      );
    }

    const data =
      (await request.json()) as PushBody;

    const userId =
      data.userId?.trim();

    const title =
      data.title?.trim() ||
      "RELYDO";

    const body =
      data.body?.trim() ||
      "Tienes una nueva notificación.";

    const url =
      data.url?.trim() ||
      "/";

    if (!userId) {
      return NextResponse.json(
        {
          error:
            "Falta userId.",
        },
        {
          status: 400,
        }
      );
    }

    /*
      ========================================
      WEB / PWA PUSH
      ========================================
    */

    const {
      data: webSubscriptions,
      error: webSubscriptionError,
    } = await supabaseAdmin
      .from(
        "push_subscriptions"
      )
      .select(`
        id,
        endpoint,
        p256dh,
        auth
      `)
      .eq(
        "user_id",
        userId
      );

    if (webSubscriptionError) {
      console.error(
        "Error buscando suscripciones Web Push:",
        webSubscriptionError
      );
    }

    /*
      ========================================
      APP MÓVIL PUSH
      ========================================
    */

    const {
      data: mobileTokens,
      error: mobileTokenError,
    } = await supabaseAdmin
      .from(
        "mobile_push_tokens"
      )
      .select(`
        id,
        expo_push_token,
        platform
      `)
      .eq(
        "user_id",
        userId
      );

    if (mobileTokenError) {
      console.error(
        "Error buscando tokens móviles:",
        mobileTokenError
      );
    }

    const webDevices =
      webSubscriptions ?? [];

    const mobileDevices =
      mobileTokens ?? [];

    /*
      Si el usuario no tiene ningún
      dispositivo registrado en ninguno
      de los dos sistemas.
    */

    if (
      webDevices.length === 0 &&
      mobileDevices.length === 0
    ) {
      return NextResponse.json({
        success: true,
        web: {
          devices: 0,
          sent: 0,
          failed: 0,
          removed: 0,
        },
        mobile: {
          devices: 0,
          sent: 0,
          failed: 0,
          removed: 0,
        },
        totalSent: 0,
        message:
          "El usuario no tiene dispositivos Push registrados.",
      });
    }

    /*
      ========================================
      ENVIAR WEB PUSH
      ========================================
    */

    let webSent = 0;
    let webFailed = 0;
    let webRemoved = 0;

    const webPayload =
      JSON.stringify({
        title,
        body,
        url,
      });

    if (webDevices.length > 0) {
      if (
        !vapidSubject ||
        !vapidPublicKey ||
        !vapidPrivateKey
      ) {
        console.error(
          "Las claves VAPID no están configuradas."
        );

        webFailed =
          webDevices.length;
      } else {
        for (
          const subscription
          of webDevices
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
              webPayload
            );

            webSent += 1;
          } catch (error: unknown) {
            webFailed += 1;

            const pushError =
              error as {
                statusCode?: number;
                message?: string;
              };

            console.error(
              "Error enviando Web Push:",
              pushError
            );

            /*
              404 / 410 =
              suscripción vencida
              o eliminada.
            */

            if (
              pushError.statusCode === 404 ||
              pushError.statusCode === 410
            ) {
              const {
                error: deleteError,
              } =
                await supabaseAdmin
                  .from(
                    "push_subscriptions"
                  )
                  .delete()
                  .eq(
                    "id",
                    subscription.id
                  );

              if (!deleteError) {
                webRemoved += 1;
              } else {
                console.error(
                  "Error eliminando suscripción Web vencida:",
                  deleteError
                );
              }
            }
          }
        }
      }
    }

    /*
      ========================================
      ENVIAR PUSH A APP MÓVIL
      ========================================
    */

    let mobileSent = 0;
    let mobileFailed = 0;
    let mobileRemoved = 0;

    for (
      const device
      of mobileDevices
    ) {
      try {
        const expoResponse =
          await fetch(
            "https://exp.host/--/api/v2/push/send",
            {
              method: "POST",

              headers: {
                Accept:
                  "application/json",

                "Accept-Encoding":
                  "gzip, deflate",

                "Content-Type":
                  "application/json",
              },

              body: JSON.stringify({
                to:
                  device.expo_push_token,

                title,

                body,

                sound:
                  "default",

                priority:
                  "high",

                channelId:
                  "default",

                data: {
                  url,
                },
              }),
            }
          );

        if (!expoResponse.ok) {
          mobileFailed += 1;

          const responseText =
            await expoResponse.text();

          console.error(
            "Error HTTP Expo Push:",
            expoResponse.status,
            responseText
          );

          continue;
        }

        const expoResult =
          (await expoResponse.json()) as {
            data?:
              | ExpoPushTicket
              | ExpoPushTicket[];
          };

        const ticket =
          Array.isArray(
            expoResult.data
          )
            ? expoResult.data[0]
            : expoResult.data;

        if (
          ticket?.status === "ok"
        ) {
          mobileSent += 1;

          continue;
        }

        mobileFailed += 1;

        console.error(
          "Expo Push rechazó la notificación:",
          ticket
        );

        /*
          DeviceNotRegistered significa
          que ese token ya no pertenece
          a una instalación válida.

          Lo eliminamos de Supabase.
        */

        if (
          ticket?.details?.error ===
          "DeviceNotRegistered"
        ) {
          const {
            error: deleteError,
          } =
            await supabaseAdmin
              .from(
                "mobile_push_tokens"
              )
              .delete()
              .eq(
                "id",
                device.id
              );

          if (!deleteError) {
            mobileRemoved += 1;
          } else {
            console.error(
              "Error eliminando token móvil vencido:",
              deleteError
            );
          }
        }
      } catch (error) {
        mobileFailed += 1;

        console.error(
          "Error enviando Expo Push:",
          error
        );
      }
    }

    /*
      ========================================
      RESULTADO
      ========================================
    */

    return NextResponse.json({
      success: true,

      web: {
        devices:
          webDevices.length,

        sent:
          webSent,

        failed:
          webFailed,

        removed:
          webRemoved,
      },

      mobile: {
        devices:
          mobileDevices.length,

        sent:
          mobileSent,

        failed:
          mobileFailed,

        removed:
          mobileRemoved,
      },

      totalSent:
        webSent +
        mobileSent,
    });
  } catch (error) {
    console.error(
      "Error general enviando Push:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo enviar la notificación Push.",
      },
      {
        status: 500,
      }
    );
  }
}