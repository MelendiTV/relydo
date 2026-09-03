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

  let targetUrl;

  try {
    targetUrl = new URL(
      rawUrl,
      self.location.origin
    ).href;
  } catch (error) {
    console.error(
      "RELYDO invalid notification URL:",
      error
    );

    targetUrl = self.location.origin + "/";
  }

  event.waitUntil(
    (async function () {
      try {
        /*
          Primero buscamos una pestaña RELYDO
          que ya esté abierta.

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
              self.location.origin
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
          Si no existe ninguna pestaña RELYDO
          abierta, entonces sí abrimos una nueva.
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