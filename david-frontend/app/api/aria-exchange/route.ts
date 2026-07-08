/**
 * Server-side session exchange: Next.js → ai-python /v1/auth/exchange
 *
 * In production this would forward the real Flugia session (company_id, user_id
 * from next-auth). For now it uses env-var defaults so dev works without manual login.
 *
 * Security: ARIA_SERVICE_SECRET never reaches the browser — it stays server-side.
 */
import { NextResponse } from "next/server";

// Absolute backend origin for this server-side route. Prefer ARIA_BACKEND_URL;
// fall back to stripping /v1 off the (now relative) public base for old configs.
const ARIA_API =
  process.env.ARIA_BACKEND_URL ??
  (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/v1").replace(/\/v1\/?$/, "");

const SERVICE_SECRET = process.env.ARIA_SERVICE_SECRET ?? "";

const DEV_USER = {
  email: process.env.DEV_USER_EMAIL ?? "dev@flugia.io",
  name: process.env.DEV_USER_NAME ?? "Dev User",
  company_id: process.env.DEV_COMPANY_ID ? Number(process.env.DEV_COMPANY_ID) : null,
  flugia_user_id: process.env.DEV_FLUGIA_USER_ID
    ? Number(process.env.DEV_FLUGIA_USER_ID)
    : null,
};

export async function GET() {
  if (!SERVICE_SECRET) {
    return NextResponse.json({ error: "service_secret_not_configured" }, { status: 503 });
  }
  try {
    const res = await fetch(`${ARIA_API}/v1/auth/exchange`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Aria-Service-Secret": SERVICE_SECRET,
      },
      body: JSON.stringify(DEV_USER),
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: "exchange_failed" }, { status: 401 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "backend_unreachable" }, { status: 503 });
  }
}
