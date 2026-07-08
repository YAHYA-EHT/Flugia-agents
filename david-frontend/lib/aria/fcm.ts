import { AppConfig, firebaseConfigured } from "./config";
import type { AriaApi } from "./api";

/**
 * FCM Web Push. Best-effort and fully guarded: does nothing unless the
 * NEXT_PUBLIC_FIREBASE_* config (incl. VAPID key) is present.
 *
 * Web push is weaker than mobile: no delivery when the browser is closed, and
 * iOS Safari requires the site installed as a PWA (>=16.4). See
 * NEXTJS_CLIENT_SPEC.md §11.
 */
export async function registerFcm(
  api: AriaApi,
  onForeground?: (title: string, body: string) => void,
): Promise<void> {
  if (typeof window === "undefined" || !firebaseConfigured()) return;
  try {
    const { initializeApp, getApps } = await import("firebase/app");
    const { getMessaging, getToken, onMessage, isSupported } = await import(
      "firebase/messaging"
    );
    if (!(await isSupported())) return;

    const app = getApps().length
      ? getApps()[0]
      : initializeApp({
          apiKey: AppConfig.firebase.apiKey,
          authDomain: AppConfig.firebase.authDomain,
          projectId: AppConfig.firebase.projectId,
          messagingSenderId: AppConfig.firebase.messagingSenderId,
          appId: AppConfig.firebase.appId,
        });

    if (Notification.permission !== "granted") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
    }

    const registration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js",
    );
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: AppConfig.firebase.vapidKey,
      serviceWorkerRegistration: registration,
    });
    if (!token) return;

    const coords = await bestEffortLocation();
    await api.updateDeviceToken(token, coords);

    onMessage(messaging, (payload) => {
      const n = payload.notification;
      onForeground?.(n?.title ?? "Aria", n?.body ?? "");
    });
  } catch (e) {
    console.warn("FCM disabled:", e);
  }
}

function bestEffortLocation(): Promise<{ lat: number; lng: number } | undefined> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(undefined);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(undefined),
      { timeout: 8000, maximumAge: 600000 },
    );
  });
}
