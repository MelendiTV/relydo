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

type ExpoPushTicket = {
  status?: "ok" | "error";
  id?: string;
  message?: string;
  details?: {
    error?: string;
  };
};

type Coordinates = {
  lat: number;
  lon: number;
};

function normalizeZip(value: unknown) {
  const raw = String(value ?? "").trim();
  const match = raw.match(
    /^(\d{5})(?:-\d{4})?$/
  );

  return match ? match[1] : "";
}

async function zipCoordinates(
  zip: string
): Promise<Coordinates | null> {
  try {
    const response = await fetch(
      `https://api.zippopotam.us/us/${encodeURIComponent(
        zip
      )}`,
      {
        headers: {
          Accept: "application/json",
        },
        cache: "force-cache",
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const place = data?.places?.[0];

    const lat = Number(place?.latitude);
    const lon = Number(place?.longitude);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      return null;
    }

    return {
      lat,
      lon,
    };
  } catch {
    return null;
  }
}

function milesBetween(
  a: Coordinates,
  b: Coordinates
) {
  const earthMiles = 3958.7613;

  const rad = (degrees: number) =>
    (degrees * Math.PI) / 180;

  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) ** 2;

  return (
    2 *
    earthMiles *
    Math.asin(Math.sqrt(h))
  );
}

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
    */

    const authorization =
      request.headers.get("authorization");

    if (
      !authorization ||
      !authorization.startsWith("Bearer ")
    ) {
      return NextResponse.json(
        {
          error: "Sesión no válida.",
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

    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
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
          error: "Falta requestId.",
        },
        {
          status: 400,
        }
      );
    }

    /*
      4. BUSCAR EL TRABAJO

      Comprobamos que el trabajo pertenece
      al cliente autenticado.
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
        zip_code,
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
      return NextResponse.json({
        success: true,
        providers: 0,
        devices: 0,
        sent: 0,
        failed: 0,
        removed: 0,
        message:
          "La solicitud ya no está abierta.",
      });
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
    */

    let providerIds: string[] = [];

    if (
      trabajo.preferred_provider_id
    ) {
      const {
        data: proPreferido,
      } = await supabaseAdmin
        .from("provider_profiles")
        .select(
          "user_id, zip_code, service_radius_miles, city, state"
        )
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
        const customerZip =
          normalizeZip(
            trabajo.zip_code
          );

        const providerZip =
          normalizeZip(
            proPreferido.zip_code
          );

        const radius =
          Number(
            proPreferido.service_radius_miles ||
              0
          );

        let servesArea = false;
        let distanceEvaluated = false;

        if (
          customerZip &&
          providerZip &&
          Number.isFinite(radius) &&
          radius > 0
        ) {
          const [
            customerCoords,
            providerCoords,
          ] = await Promise.all([
            zipCoordinates(
              customerZip
            ),
            zipCoordinates(
              providerZip
            ),
          ]);

          if (
            customerCoords &&
            providerCoords
          ) {
            distanceEvaluated = true;
            servesArea =
              milesBetween(
                customerCoords,
                providerCoords
              ) <= radius;
          }
        }

        if (!distanceEvaluated) {
          servesArea =
            String(
              proPreferido.city || ""
            )
              .trim()
              .toLowerCase() ===
              String(
                trabajo.city || ""
              )
                .trim()
                .toLowerCase() &&
            String(
              proPreferido.state || ""
            )
              .trim()
              .toLowerCase() ===
              String(
                trabajo.state || ""
              )
                .trim()
                .toLowerCase();
        }

        if (servesArea) {
          providerIds = [
            proPreferido.user_id,
          ];
        }
      }
    } else {
      const {
        data: profesionales,
        error: profesionalesError,
      } = await supabaseAdmin
        .from("provider_profiles")
        .select(
          "user_id, zip_code, service_radius_miles, city, state"
        )
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

      const candidates =
        profesionales || [];

      const customerZip =
        normalizeZip(
          trabajo.zip_code
        );

      if (customerZip) {
        const customerCoords =
          await zipCoordinates(
            customerZip
          );

        if (customerCoords) {
          const uniqueProviderZips:
            string[] = [
            ...new Set<string>(
              candidates
                .map((item) =>
                  normalizeZip(
                    item.zip_code
                  )
                )
                .filter(Boolean)
            ),
          ];

          const coordsByZip =
            new Map<
              string,
              Coordinates | null
            >();

          await Promise.all(
            uniqueProviderZips.map(
              async (zip) => {
                coordsByZip.set(
                  zip,
                  await zipCoordinates(
                    zip
                  )
                );
              }
            )
          );

          providerIds = candidates
            .filter((item) => {
              const providerZip =
                normalizeZip(
                  item.zip_code
                );

              const providerCoords =
                providerZip
                  ? coordsByZip.get(
                      providerZip
                    )
                  : null;

              const radius =
                Number(
                  item.service_radius_miles ||
                    0
                );

              if (
                !providerCoords ||
                !Number.isFinite(radius) ||
                radius <= 0
              ) {
                return false;
              }

              return (
                milesBetween(
                  customerCoords,
                  providerCoords
                ) <= radius
              );
            })
            .map(
              (item) =>
                item.user_id
            );
        } else {
          providerIds = candidates
            .filter(
              (item) =>
                String(
                  item.city || ""
                )
                  .trim()
                  .toLowerCase() ===
                  String(
                    trabajo.city || ""
                  )
                    .trim()
                    .toLowerCase() &&
                String(
                  item.state || ""
                )
                  .trim()
                  .toLowerCase() ===
                  String(
                    trabajo.state || ""
                  )
                    .trim()
                    .toLowerCase()
            )
            .map(
              (item) =>
                item.user_id
            );
        }
      } else {
        providerIds = candidates
          .filter(
            (item) =>
              String(
                item.city || ""
              )
                .trim()
                .toLowerCase() ===
                String(
                  trabajo.city || ""
                )
                  .trim()
                  .toLowerCase() &&
              String(
                item.state || ""
              )
                .trim()
                .toLowerCase() ===
                String(
                  trabajo.state || ""
                )
                  .trim()
                  .toLowerCase()
          )
          .map(
            (item) =>
              item.user_id
          );
      }
    }

    providerIds = [
      ...new Set(providerIds),
    ];

    if (
      providerIds.length === 0
    ) {
      return NextResponse.json({
        success: true,
        providers: 0,
        devices: 0,
        sent: 0,
        failed: 0,
        removed: 0,
        message:
          "No encontramos profesionales disponibles para este servicio.",
      });
    }

    /*
      7. IDIOMA DE LOS PROFESIONALES
    */

    const {
      data: languageProfiles,
    } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, preferred_language"
      )
      .in(
        "id",
        providerIds
      );

    const languageByProvider =
      new Map(
        (
          languageProfiles || []
        ).map(
          (profile) => [
            profile.id,
            profile.preferred_language ===
            "en"
              ? "en"
              : "es",
          ]
        )
      );

    /*
      IMPORTANTE:

      La notificación interna ya la crea automáticamente
      el trigger PostgreSQL:

      trg_notify_new_open_request
      -> notify_new_open_request()

      Esta API NO debe crear ni comprobar la campana
      interna.

      Desde aquí la responsabilidad es exclusivamente:
      enviar Push a los dispositivos Web/PWA y móviles
      registrados de los profesionales elegibles.
    */

    /*
      8. BUSCAR DISPOSITIVOS PUSH
    */

    const [
      webSubscriptionsResult,
      mobileTokensResult,
    ] = await Promise.all([
      supabaseAdmin
        .from("push_subscriptions")
        .select(`
          id,
          user_id,
          endpoint,
          p256dh,
          auth
        `)
        .in(
          "user_id",
          providerIds
        ),
      supabaseAdmin
        .from("mobile_push_tokens")
        .select(`
          id,
          user_id,
          expo_push_token,
          platform
        `)
        .in(
          "user_id",
          providerIds
        ),
    ]);

    if (webSubscriptionsResult.error) {
      return NextResponse.json(
        {
          error:
            webSubscriptionsResult.error.message,
        },
        {
          status: 500,
        }
      );
    }

    if (mobileTokensResult.error) {
      return NextResponse.json(
        {
          error:
            mobileTokensResult.error.message,
        },
        {
          status: 500,
        }
      );
    }

    const webDevices =
      webSubscriptionsResult.data ?? [];

    const mobileDevices =
      mobileTokensResult.data ?? [];

    if (
      webDevices.length === 0 &&
      mobileDevices.length === 0
    ) {
      return NextResponse.json({
        success: true,
        providers:
          providerIds.length,
        devices: 0,
        sent: 0,
        failed: 0,
        removed: 0,
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
        message:
          "Los profesionales encontrados todavía no tienen Push activado.",
      });
    }

    /*
      9. ENVIAR WEB PUSH
    */

    let webSent = 0;
    let webFailed = 0;
    let webRemoved = 0;

    for (
      const subscription of webDevices
    ) {
      const providerLanguage =
        languageByProvider.get(
          subscription.user_id
        ) || "es";

      const pushTitle =
        providerLanguage === "en"
          ? trabajo.preferred_provider_id
            ? "🆕 New request for you"
            : "🆕 New job available"
          : trabajo.preferred_provider_id
            ? "🆕 Nueva solicitud para ti"
            : "🆕 Nuevo trabajo disponible";

      const pushMessage =
        `${trabajo.title} · ${trabajo.city}, ${trabajo.state}`;

      const payload =
        JSON.stringify({
          title:
            pushTitle,
          body:
            pushMessage,
          url:
            `/trabajos/${trabajo.id}`,
          tag:
            `new-job-${trabajo.id}`,
        });

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

        webSent += 1;

        try {
          const endpointHost =
            new URL(
              subscription.endpoint
            ).host;

          console.log(
            "Push nuevo trabajo Web enviado:",
            {
              providerId:
                subscription.user_id,
              endpointHost,
              requestId:
                trabajo.id,
            }
          );
        } catch {
          // No bloqueamos el envío por el log.
        }
      } catch (
        error: unknown
      ) {
        webFailed += 1;

        const pushError =
          error as {
            statusCode?: number;
            message?: string;
          };

        let endpointHost =
          "unknown";

        try {
          endpointHost =
            new URL(
              subscription.endpoint
            ).host;
        } catch {
          // No bloqueamos el flujo.
        }

        console.error(
          "Error Push nuevo trabajo Web:",
          {
            providerId:
              subscription.user_id,
            endpointHost,
            statusCode:
              pushError.statusCode ??
              null,
            message:
              pushError.message ??
              "Sin mensaje",
            requestId:
              trabajo.id,
          }
        );

        if (
          pushError.statusCode === 404 ||
          pushError.statusCode === 410
        ) {
          const {
            error: deleteError,
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

    /*
      10. ENVIAR PUSH A APP MÓVIL
    */

    let mobileSent = 0;
    let mobileFailed = 0;
    let mobileRemoved = 0;

    for (
      const device of mobileDevices
    ) {
      const providerLanguage =
        languageByProvider.get(
          device.user_id
        ) || "es";

      const pushTitle =
        providerLanguage === "en"
          ? trabajo.preferred_provider_id
            ? "🆕 New request for you"
            : "🆕 New job available"
          : trabajo.preferred_provider_id
            ? "🆕 Nueva solicitud para ti"
            : "🆕 Nuevo trabajo disponible";

      const pushMessage =
        `${trabajo.title} · ${trabajo.city}, ${trabajo.state}`;

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
                title:
                  pushTitle,
                body:
                  pushMessage,
                sound:
                  "default",
                priority:
                  "high",
                channelId:
                  "default",
                data: {
                  requestId:
                    trabajo.id,
                  type:
                    "new_job",
                },
              }),
            }
          );

        if (!expoResponse.ok) {
          mobileFailed += 1;

          const responseText =
            await expoResponse.text();

          console.error(
            "Error HTTP Expo Push nuevo trabajo:",
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

          console.log(
            "Push nuevo trabajo móvil enviado:",
            {
              providerId:
                device.user_id,
              platform:
                device.platform,
              requestId:
                trabajo.id,
            }
          );

          continue;
        }

        mobileFailed += 1;

        console.error(
          "Expo Push rechazó la notificación de nuevo trabajo:",
          ticket
        );

        if (
          ticket?.details?.error ===
          "DeviceNotRegistered"
        ) {
          const {
            error: deleteError,
          } = await supabaseAdmin
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
          "Error enviando Expo Push nuevo trabajo:",
          error
        );
      }
    }

    const totalDevices =
      webDevices.length +
      mobileDevices.length;

    const totalSent =
      webSent +
      mobileSent;

    const totalFailed =
      webFailed +
      mobileFailed;

    const totalRemoved =
      webRemoved +
      mobileRemoved;

    return NextResponse.json({
      success: true,
      providers:
        providerIds.length,
      devices:
        totalDevices,
      sent:
        totalSent,
      failed:
        totalFailed,
      removed:
        totalRemoved,
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
