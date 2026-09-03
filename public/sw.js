self.addEventListener("push", function (event) {
  let data = {
    title: "RELYDO",
    body: "Tienes una nueva notificación.",
    url: "/",
    tag: undefined,
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || "Tienes una nueva notificación.",

    icon: "/icons/notification-icon.png",
    badge: "/icons/notification-icon.png",

    data: {
      url: data.url || "/",
    },

    vibrate: [200, 100, 200],

    tag: data.tag || `relydo-${Date.now()}`,

    renotify: true,
    silent: false,
    requireInteraction: true,
    timestamp: Date.now(),
  };

  event.waitUntil(
    self.registration.showNotification(
      data.title || "RELYDO",
      options
    )
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const rawUrl = event.notification.data?.url || "/";
  const officialOrigin = "https://www.relydo.co";

  let targetUrl;

  try {
    const parsedUrl = new URL(
      rawUrl,
      self.location.origin
    );

    const hostedByRelydo =
      self.location.hostname === "www.relydo.co" ||
      self.location.hostname === "relydo.co" ||
      self.location.hostname.endsWith(".vercel.app");

    const destinationOrigin = hostedByRelydo
      ? officialOrigin
      : self.location.origin;

    targetUrl = new URL(
      `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`,
      destinationOrigin
    ).href;
  } catch (error) {
    console.error(
      "RELYDO invalid notification URL:",
      error
    );

    targetUrl = officialOrigin + "/";
  }

  event.waitUntil(
    (async function () {
      try {
        const targetOrigin =
          new URL(targetUrl).origin;

        /*
          Primero buscamos una pestaña RELYDO
          que ya esté abierta en el dominio destino.

          Si existe, reutilizamos esa misma pestaña
          en lugar de crear una nueva.
        */

        const clientList =
          await clients.matchAll({
            type: "window",
            includeUncontrolled: true,
          });

        for (const client of clientList) {
          try {
            const clientUrl =
              new URL(client.url);

            if (
              clientUrl.origin ===
              targetOrigin
            ) {
              if ("navigate" in client) {
                await client.navigate(
                  targetUrl
                );
              }

              if ("focus" in client) {
                await client.focus();
              }

              return;
            }
          } catch (error) {
            console.error(
              "RELYDO notification client error:",
              error
            );
          }
        }

        /*
          Si no existe una pestaña del dominio destino,
          abrimos directamente la URL oficial de RELYDO.
        */

        if (clients.openWindow) {
          const openedClient =
            await clients.openWindow(
              targetUrl
            );

          if (
            openedClient &&
            "focus" in openedClient
          ) {
            await openedClient.focus();
          }
        }
      } catch (error) {
        console.error(
          "RELYDO notification click error:",
          error
        );
      }
    })()
  );
});