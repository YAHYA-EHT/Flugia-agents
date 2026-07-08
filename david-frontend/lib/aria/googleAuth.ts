import { AppConfig } from "./config";

/**
 * Google Identity Services authorization-code flow for the web.
 *
 * Unlike mobile's id_token, we request an offline auth *code* so the backend
 * can obtain a Google refresh token (Gmail/Calendar). The resulting `code` is
 * sent to POST /auth/google/login (same backend contract as mobile).
 */
const GIS_SRC = "https://accounts.google.com/gsi/client";

// Minimal, non-sensitive scopes — enough to authenticate. Gmail/Calendar are
// Google "sensitive" scopes that require app verification or test users; add
// them back once the consent screen is set up for them.
const SCOPES = ["openid", "email", "profile"].join(" ");

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    google?: any;
  }
}

function loadGis(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("GIS load failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(s);
  });
}

/** Opens the Google consent popup and resolves with an offline auth code. */
export async function requestGoogleAuthCode(): Promise<string> {
  if (!AppConfig.googleClientId) {
    throw new Error("NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set (Web client id).");
  }
  await loadGis();
  return new Promise<string>((resolve, reject) => {
    const client = window.google.accounts.oauth2.initCodeClient({
      client_id: AppConfig.googleClientId,
      scope: SCOPES,
      ux_mode: "popup",
      access_type: "offline",
      prompt: "consent",
      callback: (resp: any) => {
        if (resp?.code) resolve(resp.code);
        else reject(new Error(resp?.error ?? "No authorization code returned"));
      },
    });
    client.requestCode();
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */
