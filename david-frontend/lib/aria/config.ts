/**
 * Aria client configuration.
 *
 * Two layers:
 *  - AppConfig: build-time env defaults (NEXT_PUBLIC_*).
 *  - runtime config: set once at mount via configureAria(). This is the seam
 *    that lets the **embedded (flugia) host** inject the backend base URL and,
 *    crucially, an access-token getter — so Aria uses flugia's session instead
 *    of its own login. Standalone dev falls back to the env defaults +
 *    localStorage token flow.
 */
export const AppConfig = {
  apiBaseUrl:
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/v1",
  useMockData:
    (process.env.NEXT_PUBLIC_USE_MOCK_DATA ?? "true").toLowerCase() === "true",
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
  googleRedirectUri: process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI ?? "",
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    messagingSenderId:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? "",
  },
} as const;

export const firebaseConfigured = () =>
  !!AppConfig.firebase.apiKey &&
  !!AppConfig.firebase.appId &&
  !!AppConfig.firebase.vapidKey;

export interface AriaRuntimeConfig {
  /** Backend base URL including the `/v1` prefix. */
  apiBaseUrl: string;
  /** Serve the in-memory mock backend (no server needed). */
  useMockData: boolean;
  /**
   * Embedded hosts (flugia) provide the Aria-backend access token here. When
   * set, the API client uses it for the Bearer header and skips the standalone
   * localStorage/refresh/own-login flow. Leave undefined for standalone mode.
   */
  getAccessToken?: () => string | null | Promise<string | null>;
  /** Called when the session is no longer valid (host should re-auth). */
  onSessionExpired?: () => void;
}

let runtime: AriaRuntimeConfig = {
  apiBaseUrl: AppConfig.apiBaseUrl,
  useMockData: AppConfig.useMockData,
};

/** Configure Aria once before/at mount (idempotent). */
export function configureAria(partial: Partial<AriaRuntimeConfig>): void {
  runtime = { ...runtime, ...partial };
}

export function getRuntimeConfig(): AriaRuntimeConfig {
  return runtime;
}

/** True when a host is supplying tokens (i.e. Aria is embedded). */
export const isEmbedded = () => typeof runtime.getAccessToken === "function";
