/* Service worker — notificaciones Web Push del landing /pedidos (Maria Chorizos). */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    if (event.data) data = event.data.json();
  } catch {
    /* texto plano u otro formato */
  }
  const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : "Maria Chorizos";
  const body = typeof data.body === "string" ? data.body : "Actualización de tu pedido.";
  const url = typeof data.url === "string" && data.url.trim() ? data.url.trim() : "/pedidos";
  const tag =
    typeof data.tag === "string" && data.tag.trim() ? data.tag.trim() : "maria-chorizos-pedido";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag,
      renotify: true,
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rel = event.notification?.data?.url || "/pedidos";
  const absolute = new URL(rel, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && client.url.indexOf("/pedidos") !== -1 && "navigate" in client) {
          try {
            client.navigate(absolute);
            return client.focus();
          } catch {
            /* continuar a openWindow */
          }
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(absolute);
      }
      return undefined;
    })
  );
});
