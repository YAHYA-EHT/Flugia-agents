/* Firebase Cloud Messaging service worker (background notifications).
 *
 * Service workers can't read NEXT_PUBLIC_* env, so fill these values from your
 * Firebase web app config (Project settings → Your apps → Web app → SDK setup).
 * They are public values (safe to commit). Until filled, background push is off.
 */
importScripts(
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js",
);

firebase.initializeApp({
  apiKey: "FILL_ME",
  authDomain: "aria-flugia.firebaseapp.com",
  projectId: "aria-flugia",
  messagingSenderId: "388156692500",
  appId: "FILL_ME",
});

const messaging = firebase.messaging();

// Background messages: show the system notification.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? "Aria";
  const body = payload.notification?.body ?? "";
  self.registration.showNotification(title, {
    body,
    icon: "/favicon.ico",
    data: payload.data || {},
  });
});

// Tap → focus/open the app (the chat route).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) return c.focus();
      }
      return self.clients.openWindow("/");
    }),
  );
});
