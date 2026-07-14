/**
 * URL ↔ view mapping.
 *   /dashboard                          → main dashboard
 *   /dashboard/bureau/...               → Aria (Executive Assistant)
 *   /dashboard/marketing                → David (Marketing)
 *   /dashboard/sales                    → John (Sales)
 *   /dashboard/support                  → Emily (Support)
 *   /dashboard/global                   → Roger (Global Director)
 *   /dashboard/{other}                  → coming soon placeholder
 */
import type { AriaPage } from "@/components/aria/AriaSidebar";

export const DEPT_SLUG    = "bureau";
export const FEATURE_SLUG = "executive-assistant";

export type MainView = "dashboard" | "dept" | "vs" | "agent";
export type AgentId  = "marketing" | "sales" | "support" | "global" | "hr" | "legal" | "technology" | "product" | "strategy";
export type MarketingFeature = "overview" | "e_reputation" | "seo" | "linkedin";
export type SalesFeature     = "overview" | "prospecting" | "campaigns";
export type SupportFeature   = "overview" | "chatbot" | "agent_call";

const VALID_PAGES: AriaPage[] = [
  "overview", "assistant", "agent", "autonomy", "rules", "agenda", "notifications",
  "email-accounts", "knowledge-bases", "whatsapp",
];

const SUPPORT_FEATURE_MAP: Record<string, SupportFeature> = {
  "chatbot":    "chatbot",
  "agent-call": "agent_call",
  "call-agent": "agent_call",
};

const MARKETING_FEATURE_MAP: Record<string, MarketingFeature> = {
  "e-reputation": "e_reputation",
  "seo":          "seo",
  "linkedin":     "linkedin",
};

const SALES_FEATURE_MAP: Record<string, SalesFeature> = {
  "prospecting": "prospecting",
  "campaigns":   "campaigns",
};

export function dashboardPath()                        { return "/dashboard"; }
export function deptPath()                             { return `/dashboard/${DEPT_SLUG}`; }
export function vsPath(page: AriaPage = "overview") {
  return page === "overview"
    ? `/dashboard/${DEPT_SLUG}/${FEATURE_SLUG}`
    : `/dashboard/${DEPT_SLUG}/${FEATURE_SLUG}/${page}`;
}
export function agentPath(agent: AgentId)              { return `/dashboard/${agent}`; }
export function marketingFeaturePath(f: MarketingFeature) {
  return f === "overview" ? "/dashboard/marketing" : `/dashboard/marketing/${f.replace("_", "-")}`;
}
export function salesFeaturePath(f: SalesFeature) {
  return f === "overview" ? "/dashboard/sales" : `/dashboard/sales/${f}`;
}

export function parseRoute(pathname: string): {
  mainView: MainView;
  page: AriaPage;
  agentId: AgentId | null;
  marketingFeature: MarketingFeature;
  salesFeature: SalesFeature;
  supportFeature: SupportFeature;
} {
  const segs = pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  const rest  = segs[0] === "dashboard" ? segs.slice(1) : segs;

  const DEFAULTS = { marketingFeature: "overview" as MarketingFeature, salesFeature: "overview" as SalesFeature, supportFeature: "overview" as SupportFeature };

  if (rest.length === 0)
    return { mainView: "dashboard", page: "overview", agentId: null, ...DEFAULTS };

  // Aria — bureau/executive-assistant/...
  if (rest[0] === DEPT_SLUG && !rest[1])
    return { mainView: "dept", page: "overview", agentId: null, ...DEFAULTS };
  if (rest[0] === DEPT_SLUG && rest[1] === FEATURE_SLUG) {
    const p = rest[2] as AriaPage | undefined;
    return { mainView: "vs", page: p && VALID_PAGES.includes(p) ? p : "overview", agentId: null, ...DEFAULTS };
  }

  // Marketing sub-features
  if (rest[0] === "marketing") {
    const feature = rest[1] ? MARKETING_FEATURE_MAP[rest[1]] ?? "overview" : "overview";
    return { mainView: "agent", page: "overview", agentId: "marketing", ...DEFAULTS, marketingFeature: feature };
  }

  // Sales sub-features
  if (rest[0] === "sales") {
    const feature = rest[1] ? SALES_FEATURE_MAP[rest[1]] ?? "overview" : "overview";
    return { mainView: "agent", page: "overview", agentId: "sales", ...DEFAULTS, salesFeature: feature };
  }

  // Support sub-features
  if (rest[0] === "support") {
    const feature = rest[1] ? SUPPORT_FEATURE_MAP[rest[1]] ?? "overview" : "overview";
    return { mainView: "agent", page: "overview", agentId: "support", ...DEFAULTS, supportFeature: feature };
  }

  // Other agents
  const AGENT_IDS: AgentId[] = ["global", "hr", "legal", "technology", "product", "strategy"];
  if (AGENT_IDS.includes(rest[0] as AgentId))
    return { mainView: "agent", page: "overview", agentId: rest[0] as AgentId, ...DEFAULTS };

  return { mainView: "dashboard", page: "overview", agentId: null, ...DEFAULTS };
}