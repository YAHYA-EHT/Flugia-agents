import { create } from "zustand";
import { AppConfig } from "@/lib/aria/config";
import { ApiException } from "@/lib/aria/api";
import { asRealClient, getApi } from "@/lib/aria";
import { tokenStorage } from "@/lib/aria/tokenStorage";
import type { User } from "@/lib/aria/types";

export type AuthStatus = "unknown" | "signedOut" | "signingIn" | "signedIn";

interface AuthState {
  status: AuthStatus;
  user: User | null;
  error: string | null;
  bootstrap: () => Promise<void>;
  signInMock: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, name?: string) => Promise<boolean>;
  signInWithGoogleCode: (code: string, redirectUri?: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}

function parseJwtUser(token: string): User | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return {
      id: payload.sub ?? payload.user_id ?? "",
      email: payload.email ?? "",
      displayName: payload.name ?? payload.display_name ?? payload.email ?? null,
    };
  } catch {
    return null;
  }
}

// Sticky "user explicitly signed out" flag. Without it, bootstrap's auto-exchange
// (/api/aria-exchange) would silently re-authenticate on the next refresh.
const LOGGED_OUT_KEY = "aria_logged_out";
const markLoggedOut = () => { try { localStorage.setItem(LOGGED_OUT_KEY, "1"); } catch { /* */ } };
const clearLoggedOut = () => { try { localStorage.removeItem(LOGGED_OUT_KEY); } catch { /* */ } };
const isLoggedOut = () => { try { return localStorage.getItem(LOGGED_OUT_KEY) === "1"; } catch { return false; } };

export const useAuthStore = create<AuthState>((set) => {
  const real = asRealClient(getApi());
  if (real) real.onSessionExpired = () => {
    tokenStorage.clear();
    set({ status: "signedOut", user: null });
  };

  return {
    status: "unknown",
    user: null,
    error: null,

    bootstrap: async () => {
      if (AppConfig.useMockData) {
        set({ status: "signedIn", user: { id: "mock", email: "dev@flugia.io", displayName: "Dev User" } });
        return;
      }

      // Capture token returned by the backend OAuth callback (#token=…)
      if (typeof window !== "undefined" && window.location.hash.includes("token=")) {
        const params = new URLSearchParams(window.location.hash.slice(1));
        const token = params.get("token");
        const err = params.get("error");
        if (token) {
          tokenStorage.save(token);
          clearLoggedOut();
          history.replaceState(null, "", window.location.pathname);
          set({ status: "signedIn", user: parseJwtUser(token) });
          return;
        } else if (err) {
          history.replaceState(null, "", window.location.pathname);
          set({ status: "signedOut", error: err });
          return;
        }
      }

      // Stored session still valid — rehydrate the profile from the backend
      // (name/email aren't in the Aria JWT). Gmail status is fetched separately.
      if (tokenStorage.hasSession) {
        set({ status: "signedIn", user: parseJwtUser(tokenStorage.access!) });
        try {
          const u = await getApi().me();
          set({ user: u });
        } catch { /* request layer handles a stale token via 401 */ }
        return;
      }

      // Respect an explicit sign-out: don't silently re-auth via the exchange.
      if (isLoggedOut()) {
        set({ status: "signedOut" });
        return;
      }

      // Auto-exchange via server-side route (ARIA_SERVICE_SECRET stays server-side)
      try {
        const res = await fetch("/api/aria-exchange", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json() as { access_token?: string };
          if (data.access_token) {
            tokenStorage.save(data.access_token);
            set({ status: "signedIn", user: parseJwtUser(data.access_token) });
            try { set({ user: await getApi().me() }); } catch { /* ignore */ }
            return;
          }
        }
      } catch { /* backend unreachable */ }

      set({ status: "signedOut" });
    },

    signInMock: async () => {
      set({ status: "signingIn", error: null });
      const result = await getApi().googleLogin("mock");
      clearLoggedOut();
      set({ status: "signedIn", user: result.user });
    },

    signInWithPassword: async (email, password) => {
      set({ status: "signingIn", error: null });
      try {
        const result = await getApi().login(email, password);
        clearLoggedOut();
        set({ status: "signedIn", user: result.user });
        return true;
      } catch (e) {
        const msg = e instanceof ApiException ? e.message : "Sign-in failed.";
        set({ status: "signedOut", error: msg });
        return false;
      }
    },

    register: async (email, password, name) => {
      set({ status: "signingIn", error: null });
      try {
        const result = await getApi().register(email, password, name);
        clearLoggedOut();
        set({ status: "signedIn", user: result.user });
        return true;
      } catch (e) {
        const msg = e instanceof ApiException ? e.message : "Sign-up failed.";
        set({ status: "signedOut", error: msg });
        return false;
      }
    },

    signInWithGoogleCode: async (code, redirectUri) => {
      set({ status: "signingIn", error: null });
      try {
        const result = await getApi().googleLogin(code, redirectUri);
        clearLoggedOut();
        set({ status: "signedIn", user: result.user });
        return true;
      } catch (e) {
        const msg = e instanceof ApiException ? e.message : "Sign-in failed.";
        set({ status: "signedOut", error: msg });
        return false;
      }
    },

    signOut: async () => {
      await getApi().logout();
      tokenStorage.clear(); // clears Aria platform JWT only; Gmail tokens remain in DB per user
      markLoggedOut();       // survive refresh — don't auto-exchange back in
      set({ status: "signedOut", user: null });
    },
  };
});
