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

  const url =
    event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});