/**
 * JWT storage. Uses localStorage for simplicity (mirrors the mobile secure
 * storage). For production inside flugia, prefer httpOnly cookies set by the
 * backend; swap this module's impl without touching callers.
 */
const ACCESS = "aria_access_token";
const REFRESH = "aria_refresh_token";

const isBrowser = () => typeof window !== "undefined";

export const tokenStorage = {
  get access(): string | null {
    return isBrowser() ? window.localStorage.getItem(ACCESS) : null;
  },
  get refresh(): string | null {
    return isBrowser() ? window.localStorage.getItem(REFRESH) : null;
  },
  save(access: string, refresh?: string | null) {
    if (!isBrowser()) return;
    window.localStorage.setItem(ACCESS, access);
    if (refresh) window.localStorage.setItem(REFRESH, refresh);
  },
  clear() {
    if (!isBrowser()) return;
    window.localStorage.removeItem(ACCESS);
    window.localStorage.removeItem(REFRESH);
  },
  get hasSession(): boolean {
    return !!this.access;
  },
};
