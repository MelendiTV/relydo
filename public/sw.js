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

    // Icono principal
    icon: "/icons/notification-icon.png",

    // Badge pequeño
    badge: "/icons/notification-icon.png",

    // Guardamos el destino recibido desde el servidor
    data: {
      url: data.url || "/",
    },

    vibrate: [200, 100, 200],

    // Cada notificación puede traer su propio tag.
    // Los nuevos trabajos usan: new-job-<requestId>
    tag: data.tag || `relydo-${Date.now()}`,

    // Si vuelve a llegar el mismo tag, vuelve a avisar.
    renotify: true,

    // La notificación no debe ser silenciosa.
    silent: false,

    // Mantener visible cuando navegador/SO lo permita.
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

  const rawUrl =
    event.notification.data?.url || "/";

  // Convierte siempre rutas como:
  // /trabajos/123
  //
  // en una URL absoluta del dominio donde vive este Service Worker:
  // https://www.relydo.co/trabajos/123
  const targetUrl = new URL(
    rawUrl,
    self.location.origin
  ).href;

  event.waitUntil(
    (async function () {
      const clientList = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Si RELYDO ya está abierto, usamos esa ventana.
      for (const client of clientList) {
        try {
          const clientUrl = new URL(client.url);

          // Solo usamos ventanas del mismo dominio.
          if (clientUrl.origin === self.location.origin) {
            if ("navigate" in client) {
              await client.navigate(targetUrl);
            }

            if ("focus" in client) {
              await client.focus();
            }

            return;
          }
        } catch (error) {
          console.error(
            "RELYDO notification navigation error:",
            error
          );
        }
      }

      // Si RELYDO no está abierto, abrimos directamente
      // la página específica del trabajo.
      if (clients.openWindow) {
        await clients.openWindow(targetUrl);
      }
    })()
  );
});