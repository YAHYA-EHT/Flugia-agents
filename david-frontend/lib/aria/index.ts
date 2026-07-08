import { getRuntimeConfig } from "./config";
import type { AriaApi } from "./api";
import { ApiClient } from "./apiClient";
import { MockApi } from "./mockApi";

let singleton: AriaApi | null = null;

/** Returns the shared API implementation (mock or real, per runtime config). */
export function getApi(): AriaApi {
  if (!singleton) {
    singleton = getRuntimeConfig().useMockData
      ? new MockApi()
      : new ApiClient();
  }
  return singleton;
}

/** Rebuild the API instance (call after configureAria changes mock/real). */
export function resetApi(): void {
  singleton = null;
}

/** The real client (if active) so callers can wire onSessionExpired. */
export function asRealClient(api: AriaApi): ApiClient | null {
  return api instanceof ApiClient ? api : null;
}

export * from "./api";
export * from "./types";
