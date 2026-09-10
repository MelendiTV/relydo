import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

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

export type RelydoNotificationInput = {
  userId: string;
  type: string;
  title: string;
  message: string;
  titleEn?: string;
  messageEn?: string;
  requestId?: string | null;
  url?: string | null;
};

type ExpoPushTicket = {
  status?: "ok" | "error";
  id?: string;
  message?: string;
  details?: {
    error?: string;
  };
};

export type RelydoNotificationResult = {
  internalNotificationSaved: boolean;
  duplicateSkipped?: boolean;

  // Web / PWA
  pushDevices: number;
  pushSent: number;
  pushFailed: number;
  pushRemoved: number;

  // App móvil
  mobilePushDevices: number;
  mobilePushSent: number;
  mobilePushFailed: number;
  mobilePushRemoved: number;

  error?: string;
  mobileError?: string;
};

function isExpoPushToken(
  token: string
) {
  return (
    token.startsWith(
      "ExponentPushToken["
    ) ||
    token.startsWith(
      "ExpoPushToken["
    )
  );
}

export async function sendRelydoNotification(
  input: RelydoNotificationInput
): Promise<RelydoNotificationResult> {
  const userId =
    input.userId?.trim();

  if (!userId) {
    return {
      internalNotificationSaved: false,

      pushDevices: 0,
      pushSent: 0,
      pushFailed: 0,
      pushRemoved: 0,

      mobilePushDevices: 0,
      mobilePushSent: 0,
      mobilePushFailed: 0,
      mobilePushRemoved: 0,

      error: "Falta userId.",
    };
  }

  const result: RelydoNotificationResult = {
    internalNotificationSaved: false,

    pushDevices: 0,
    pushSent: 0,
    pushFailed: 0,
    pushRemoved: 0,

    mobilePushDevices: 0,
    mobilePushSent: 0,
    mobilePushFailed: 0,
    mobilePushRemoved: 0,
  };

  /*
    ============================================================
    1. IDIOMA DEL USUARIO
    ============================================================
  */

  const {
    data: profile,
  } = await supabaseAdmin
    .from("profiles")
    .select("preferred_language")
    .eq("id", userId)
    .maybeSingle();

  const useEnglish =
    profile?.preferred_language ===
    "en";

  const title =
    useEnglish &&
    input.titleEn
      ? input.titleEn
      : input.title;

  const message =
    useEnglish &&
    input.messageEn
      ? input.messageEn
      : input.message;

  const requestId =
    input.requestId || null;

  const notificationUrl =
    input.url ||
    (
      requestId
        ? `/mis-solicitudes/${requestId}`
        : "/"
    );

  /*
    ============================================================
    2. DEDUPLICACIÓN CORTA

    Evita que un retry inmediato del mismo evento
    genere dos notificaciones internas o dos Push.
    ============================================================
  */

  const duplicateSince =
    new Date(
      Date.now() - 15_000
    ).toISOString();

  let duplicateQuery =
    supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("user_id", userId)
      .eq("type", input.type)
      .eq("title", title)
      .eq("message", message)
      .gte(
        "created_at",
        duplicateSince
      );

  duplicateQuery =
    requestId
      ? duplicateQuery.eq(
          "request_id",
          requestId
        )
      : duplicateQuery.is(
          "request_id",
          null
        );

  const {
    data:
      existingNotification,
    error:
      duplicateCheckError,
  } =
    await duplicateQuery
      .limit(1)
      .maybeSingle();

  if (
    duplicateCheckError
  ) {
    console.error(
      "RELYDO: no se pudo comprobar duplicados de notificación:",
      duplicateCheckError
    );
  }

  if (
    existingNotification
  ) {
    result.duplicateSkipped =
      true;

    return result;
  }

  /*
    ============================================================
    3. NOTIFICACIÓN INTERNA
    ============================================================
  */

  const {
    error:
      notificationError,
  } =
    await supabaseAdmin
      .from("notifications")
      .insert({
        user_id:
          userId,

        type:
          input.type,

        title,

        message,

        request_id:
          requestId,

        read:
          false,
      });

  if (
    notificationError
  ) {
    console.error(
      "RELYDO: no se pudo guardar la notificación interna:",
      notificationError
    );

    result.error =
      notificationError.message;

    return result;
  }

  result.internalNotificationSaved =
    true;

  /*
    ============================================================
    4. WEB PUSH / PWA

    Chrome / Edge / PWA.

    IMPORTANTE:
    Si Web Push falla, NO detenemos Mobile Push.
    ============================================================
  */

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
        .select(
          "id, endpoint, p256dh, auth"
        )
        .eq(
          "user_id",
          userId
        );

    if (
      subscriptionsError
    ) {
      console.error(
        "RELYDO: error buscando suscripciones Web Push:",
        subscriptionsError
      );

      result.error =
        subscriptionsError.message;
    } else if (
      subscriptions &&
      subscriptions.length >
        0
    ) {
      result.pushDevices =
        subscriptions.length;

      const payload =
        JSON.stringify({
          title:
            title ||
            "RELYDO",

          body:
            message ||
            (
              useEnglish
                ? "You have a new notification."
                : "Tienes una nueva notificación."
            ),

          url:
            notificationUrl,

          data: {
            type:
              input.type,

            requestId,

            url:
              notificationUrl,
          },
        });

      for (
        const subscription
        of subscriptions
      ) {
        try {
          await webpush
            .sendNotification(
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

          result.pushSent +=
            1;
        } catch (
          error: unknown
        ) {
          result.pushFailed +=
            1;

          const pushError =
            error as {
              statusCode?: number;
              message?: string;
            };

          console.warn(
            "RELYDO: fallo enviando Web Push:",
            {
              subscriptionId:
                subscription.id,

              statusCode:
                pushError.statusCode,

              message:
                pushError.message,
            }
          );

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
              result.pushRemoved +=
                1;
            }
          }
        }
      }
    }
  }

  /*
    ============================================================
    5. PUSH NATIVA RELYDO

    iPhone / Android mediante Expo Push.

    IMPORTANTE:
    Es completamente independiente de Web Push.
    ============================================================
  */

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
      .select(
        "id, expo_push_token, platform"
      )
      .eq(
        "user_id",
        userId
      );

  if (
    mobileTokensError
  ) {
    console.error(
      "RELYDO: error buscando tokens móviles:",
      mobileTokensError
    );

    result.mobileError =
      mobileTokensError.message;

    return result;
  }

  const validMobileTokens =
    (
      mobileTokens || []
    ).filter(
      (
        mobileToken
      ) =>
        typeof mobileToken.expo_push_token ===
          "string" &&
        isExpoPushToken(
          mobileToken.expo_push_token
        )
    );

  result.mobilePushDevices =
    validMobileTokens.length;

  if (
    validMobileTokens.length ===
    0
  ) {
    return result;
  }

  const expoMessages =
    validMobileTokens.map(
      (
        mobileToken
      ) => ({
        to:
          mobileToken.expo_push_token,

        sound:
          "default",

        title:
          title ||
          "RELYDO",

        body:
          message ||
          (
            useEnglish
              ? "You have a new notification."
              : "Tienes una nueva notificación."
          ),

        priority:
          "high",

        channelId:
          "default",

        data: {
          type:
            input.type,

          requestId,

          url:
            notificationUrl,
        },
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
      (
        await expoResponse.json()
      ) as {
        data?:
          | ExpoPushTicket
          | ExpoPushTicket[];

        errors?: unknown;
      };

    if (
      !expoResponse.ok
    ) {
      result.mobilePushFailed =
        validMobileTokens.length;

      result.mobileError =
        `Expo Push respondió HTTP ${expoResponse.status}.`;

      console.error(
        "RELYDO: Expo Push HTTP error:",
        expoResponse.status,
        expoResult
      );

      return result;
    }

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

    for (
      let index = 0;
      index <
      validMobileTokens.length;
      index += 1
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
        result.mobilePushSent +=
          1;

        continue;
      }

      result.mobilePushFailed +=
        1;

      console.warn(
        "RELYDO: Expo rechazó Push móvil:",
        {
          tokenId:
            mobileToken.id,

          platform:
            mobileToken.platform,

          ticket,
        }
      );

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
          result.mobilePushRemoved +=
            1;
        } else {
          console.error(
            "RELYDO: no se pudo eliminar token móvil inválido:",
            deleteMobileError
          );
        }
      }
    }

    if (
      tickets.length ===
        0 &&
      validMobileTokens.length >
        0
    ) {
      result.mobilePushSent =
        0;

      result.mobilePushFailed =
        validMobileTokens.length;

      result.mobileError =
        "Expo no devolvió tickets de entrega.";
    }
  } catch (
    expoError
  ) {
    console.error(
      "RELYDO: error enviando Push móvil:",
      expoError
    );

    result.mobilePushFailed =
      validMobileTokens.length;

    result.mobileError =
      expoError instanceof
      Error
        ? expoError.message
        : "No se pudo conectar con Expo Push.";
  }

  return result;
}