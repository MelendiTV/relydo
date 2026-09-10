import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

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

type Stage =
  | "on_the_way"
  | "arrived"
  | "working";

type RequestBody = {
  requestId?: string;
  stage?: Stage;
};

type ExpoPushTicket = {
  status?: "ok" | "error";
  id?: string;
  message?: string;
  details?: {
    error?: string;
  };
};

const STAGE_CONFIG: Record<
  Stage,
  {
    type: string;
    title: string;
    message: string;
  }
> = {
  on_the_way: {
    type: "provider_on_the_way",
    title: "El profesional va en camino",
    message:
      "Tu profesional ya va en camino hacia la dirección del servicio.",
  },

  arrived: {
    type: "provider_arrived",
    title: "El profesional llegó",
    message:
      "Tu profesional indicó que ya llegó al lugar del servicio.",
  },

  working: {
    type: "job_started",
    title: "El trabajo comenzó",
    message:
      "Tu profesional indicó que el trabajo ya comenzó.",
  },
};

function getBearerToken(
  request: NextRequest
) {
  const authorization =
    request.headers.get("authorization");

  if (
    !authorization ||
    !authorization.startsWith("Bearer ")
  ) {
    return null;
  }

  return authorization
    .slice("Bearer ".length)
    .trim();
}

function isExpoPushToken(
  token: string
) {
  return (
    token.startsWith("ExponentPushToken[") ||
    token.startsWith("ExpoPushToken[")
  );
}

export async function POST(
  request: NextRequest
) {
  try {
    /*
      =====================================================
      1. AUTENTICAR AL PROFESIONAL
      =====================================================
    */

    const token =
      getBearerToken(request);

    if (!token) {
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

    const {
      data: {
        user,
      },
      error:
        userError,
    } =
      await supabaseAdmin.auth.getUser(
        token
      );

    if (
      userError ||
      !user
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

    /*
      =====================================================
      2. VALIDAR BODY
      =====================================================
    */

    const body =
      (await request.json()) as RequestBody;

    const requestId =
      body.requestId?.trim();

    const stage =
      body.stage;

    if (
      !requestId ||
      !stage ||
      !(stage in STAGE_CONFIG)
    ) {
      return NextResponse.json(
        {
          error:
            "Faltan datos válidos del trabajo o de la etapa.",
        },
        {
          status: 400,
        }
      );
    }

    /*
      =====================================================
      3. BUSCAR TRABAJO
      =====================================================
    */

    const {
      data:
        trabajo,
      error:
        trabajoError,
    } =
      await supabaseAdmin
        .from("service_requests")
        .select(`
          id,
          title,
          customer_id,
          preferred_provider_id,
          status,
          job_stage
        `)
        .eq(
          "id",
          requestId
        )
        .maybeSingle();

    if (
      trabajoError ||
      !trabajo
    ) {
      return NextResponse.json(
        {
          error:
            "Trabajo no encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    /*
      =====================================================
      4. SEGURIDAD:
         EL TRABAJO TIENE QUE ESTAR ASIGNADO
         AL PROFESIONAL AUTENTICADO
      =====================================================
    */

    if (
      trabajo.status !==
        "in_progress" ||
      trabajo.preferred_provider_id !==
        user.id
    ) {
      return NextResponse.json(
        {
          error:
            "No tienes permiso para notificar cambios de este trabajo.",
        },
        {
          status: 403,
        }
      );
    }

    /*
      La etapa recibida debe coincidir con
      la etapa que ya fue guardada en Supabase.
    */

    if (
      trabajo.job_stage !==
      stage
    ) {
      return NextResponse.json(
        {
          error:
            "La etapa enviada no coincide con el estado actual del trabajo.",
        },
        {
          status: 409,
        }
      );
    }

    if (
      !trabajo.customer_id
    ) {
      return NextResponse.json(
        {
          error:
            "El trabajo no tiene cliente asociado.",
        },
        {
          status: 400,
        }
      );
    }

    const config =
      STAGE_CONFIG[stage];

    /*
      =====================================================
      5. GUARDAR NOTIFICACIÓN INTERNA

      Esto se mantiene EXACTAMENTE porque
      NotificationsBell / Realtime depende
      de la tabla notifications.
      =====================================================
    */

    const {
      data:
        notification,
      error:
        notificationError,
    } =
      await supabaseAdmin
        .from("notifications")
        .insert({
          user_id:
            trabajo.customer_id,

          type:
            config.type,

          title:
            config.title,

          message:
            config.message,

          request_id:
            trabajo.id,

          read:
            false,
        })
        .select(`
          id,
          user_id,
          type,
          title,
          message,
          request_id,
          read,
          created_at
        `)
        .single();

    if (
      notificationError
    ) {
      console.error(
        "Error guardando notificación de etapa:",
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

    /*
      =====================================================
      6. DATOS COMUNES DE LA PUSH
      =====================================================
    */

    const pushTitle =
      config.title;

    const pushBody =
      `${trabajo.title}: ${config.message}`;

    const webUrl =
      `/mis-solicitudes/${trabajo.id}`;

    /*
      Esta información la recibirá la app móvil.
      Después podremos usar requestId para abrir
      directamente RequestDetail.
    */

    const mobileData = {
      type:
        config.type,

      requestId:
        trabajo.id,

      stage,

      screen:
        "RequestDetail",

      url:
        webUrl,
    };

    /*
      =====================================================
      7. WEB PUSH / PWA

      IMPORTANTE:
      Si Web Push falla o el cliente no tiene
      navegador registrado, NO detenemos el proceso.

      La app móvil debe poder recibir igualmente.
      =====================================================
    */

    let webDevices =
      0;

    let webSent =
      0;

    let webFailed =
      0;

    let webRemoved =
      0;

    let webError:
      string | null =
      null;

    if (
      vapidSubject &&
      vapidPublicKey &&
      vapidPrivateKey
    ) {
      const {
        data:
          subscriptions,
        error:
          subscriptionsError,
      } =
        await supabaseAdmin
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
            trabajo.customer_id
          );

      if (
        subscriptionsError
      ) {
        console.error(
          "Error buscando dispositivos Web Push del cliente:",
          subscriptionsError
        );

        webError =
          subscriptionsError.message;
      } else if (
        subscriptions &&
        subscriptions.length >
          0
      ) {
        webDevices =
          subscriptions.length;

        const webPayload =
          JSON.stringify({
            title:
              pushTitle,

            body:
              pushBody,

            url:
              webUrl,

            tag:
              `${config.type}-${trabajo.id}`,

            data:
              mobileData,
          });

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
              webPayload
            );

            webSent +=
              1;
          } catch (
            error: unknown
          ) {
            webFailed +=
              1;

            const pushError =
              error as {
                statusCode?: number;
                message?: string;
              };

            console.error(
              "Error enviando Web Push de etapa:",
              pushError
            );

            /*
              404 / 410 significa que esa
              suscripción Web ya murió.
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

              if (
                !deleteError
              ) {
                webRemoved +=
                  1;
              }
            }
          }
        }
      }
    } else {
      webError =
        "Las claves VAPID no están configuradas.";
    }

    /*
      =====================================================
      8. PUSH APP MÓVIL
         iPHONE / ANDROID - EXPO

      Se buscan TODOS los dispositivos móviles
      registrados para este cliente.
      =====================================================
    */

    let mobileDevices =
      0;

    let mobileSent =
      0;

    let mobileFailed =
      0;

    let mobileRemoved =
      0;

    let mobileError:
      string | null =
      null;

    const {
      data:
        mobileTokens,
      error:
        mobileTokensError,
    } =
      await supabaseAdmin
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
          trabajo.customer_id
        );

    if (
      mobileTokensError
    ) {
      console.error(
        "Error buscando tokens móviles del cliente:",
        mobileTokensError
      );

      mobileError =
        mobileTokensError.message;
    } else if (
      mobileTokens &&
      mobileTokens.length >
        0
    ) {
      /*
        Filtramos cualquier valor inválido antes
        de enviarlo a Expo.
      */

      const validMobileTokens =
        mobileTokens.filter(
          (
            item
          ) =>
            typeof item.expo_push_token ===
              "string" &&
            isExpoPushToken(
              item.expo_push_token
            )
        );

      mobileDevices =
        validMobileTokens.length;

      /*
        Expo acepta un array de mensajes,
        por lo que enviamos todos los dispositivos
        del cliente en una sola petición.
      */

      if (
        validMobileTokens.length >
        0
      ) {
        const expoMessages =
          validMobileTokens.map(
            (
              item
            ) => ({
              to:
                item.expo_push_token,

              sound:
                "default",

              title:
                pushTitle,

              body:
                pushBody,

              priority:
                "high",

              channelId:
                "default",

              data:
                mobileData,
            })
          );

        try {
          const expoResponse =
            await fetch(
              "https://exp.host/--/api/v2/push/send",
              {
                method:
                  "POST",

                headers: {
                  Accept:
                    "application/json",

                  "Accept-Encoding":
                    "gzip, deflate",

                  "Content-Type":
                    "application/json",
                },

                body:
                  JSON.stringify(
                    expoMessages
                  ),

                cache:
                  "no-store",
              }
            );

          const expoResult =
            (await expoResponse.json()) as {
              data?:
                | ExpoPushTicket
                | ExpoPushTicket[];

              errors?: unknown;
            };

          if (
            !expoResponse.ok
          ) {
            console.error(
              "Expo Push HTTP error:",
              expoResponse.status,
              expoResult
            );

            mobileFailed =
              validMobileTokens.length;

            mobileError =
              `Expo Push respondió HTTP ${expoResponse.status}.`;
          } else {
            /*
              Normalizamos porque Expo puede devolver
              objeto o array dependiendo de la cantidad.
            */

            const tickets =
              Array.isArray(
                expoResult.data
              )
                ? expoResult.data
                : expoResult.data
                  ? [
                      expoResult.data,
                    ]
                  : [];

            /*
              Revisamos el resultado correspondiente
              a cada dispositivo móvil.
            */

            for (
              let index =
                0;
              index <
              validMobileTokens.length;
              index +=
                1
            ) {
              const mobileToken =
                validMobileTokens[
                  index
                ];

              const ticket =
                tickets[index];

              if (
                ticket?.status ===
                "ok"
              ) {
                mobileSent +=
                  1;

                continue;
              }

              mobileFailed +=
                1;

              console.error(
                "Expo Push rechazado:",
                {
                  tokenId:
                    mobileToken.id,

                  platform:
                    mobileToken.platform,

                  ticket,
                }
              );

              /*
                Si Expo dice DeviceNotRegistered,
                ese token ya no pertenece a una
                instalación válida.

                Lo eliminamos para que no siga
                causando errores en el futuro.
              */

              if (
                ticket?.details
                  ?.error ===
                "DeviceNotRegistered"
              ) {
                const {
                  error:
                    deleteMobileError,
                } =
                  await supabaseAdmin
                    .from(
                      "mobile_push_tokens"
                    )
                    .delete()
                    .eq(
                      "id",
                      mobileToken.id
                    );

                if (
                  !deleteMobileError
                ) {
                  mobileRemoved +=
                    1;
                } else {
                  console.error(
                    "No se pudo borrar token móvil inválido:",
                    deleteMobileError
                  );
                }
              }
            }

            /*
              Si Expo no devolvió tickets aunque
              respondió correctamente, lo dejamos
              registrado para diagnóstico.
            */

            if (
              tickets.length ===
                0 &&
              validMobileTokens.length >
                0
            ) {
              mobileFailed =
                validMobileTokens.length;

              mobileSent =
                0;

              mobileError =
                "Expo no devolvió tickets de entrega.";
            }
          }
        } catch (
          expoError
        ) {
          console.error(
            "Error enviando Push móvil:",
            expoError
          );

          mobileFailed =
            validMobileTokens.length;

          mobileError =
            expoError instanceof
            Error
              ? expoError.message
              : "No se pudo conectar con Expo Push.";
        }
      }
    }

    /*
      =====================================================
      9. RESPUESTA FINAL

      Ningún sistema bloquea al otro:

      - notifications = campana / Realtime
      - webPush = Chrome / Edge / PWA
      - mobilePush = iPhone / Android
      =====================================================
    */

    return NextResponse.json({
      success:
        true,

      notification,

      webPush: {
        devices:
          webDevices,

        sent:
          webSent,

        failed:
          webFailed,

        removed:
          webRemoved,

        error:
          webError,
      },

      mobilePush: {
        devices:
          mobileDevices,

        sent:
          mobileSent,

        failed:
          mobileFailed,

        removed:
          mobileRemoved,

        error:
          mobileError,
      },
    });
  } catch (
    error
  ) {
    console.error(
      "Error general notificando cambio de etapa:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof
          Error
            ? error.message
            : "No se pudo notificar el cambio de etapa.",
      },
      {
        status: 500,
      }
    );
  }
}