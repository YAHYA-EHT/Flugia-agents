"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/aria/state/authStore";
import { Aria } from "@/components/aria/Aria";
import { David } from "@/components/david/David";
import { Emily } from "@/components/emily/Emily";
import { Roger } from "@/components/roger/Roger";
import { FlugiaShell } from "@/components/flugia/FlugiaShell";
import { FlugiaMainDashboard } from "@/components/flugia/FlugiaMainDashboard";
import { OverviewScreen } from "@/components/aria/OverviewScreen";
import { LoginScreen } from "@/components/flugia/LoginScreen";
import { parseRoute, dashboardPath, deptPath, vsPath, agentPath } from "@/lib/aria/routes";
import type { AgentId } from "@/lib/aria/routes";
import type { AriaPage } from "@/components/aria/AriaSidebar";

// ── Placeholder agents non encore câblés ──────────────────────
function AgentPlaceholder({ agentId, onBack }: { agentId: AgentId; onBack: () => void }) {
  const labels: Record<AgentId, { name: string; color: string }> = {
    marketing:  { name: "David",   color: "#4cc9f0" },
    sales:      { name: "John",    color: "#4cc9f0" },
    support:    { name: "Emily",   color: "#4cc9f0" },
    global:     { name: "Roger",   color: "#ef4444" },
    hr:         { name: "Lucy",    color: "#4cc9f0" },
    legal:      { name: "Camille", color: "#4cc9f0" },
    technology: { name: "Alex",    color: "#4cc9f0" },
    product:    { name: "Frans",   color: "#4cc9f0" },
    strategy:   { name: "Lucas",   color: "#4cc9f0" },
  };
  const { name, color } = labels[agentId] ?? { name: agentId, color: "#4cc9f0" };
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-black text-white" style={{ background: color }}>
        {name[0]}
      </div>
      <h2 className="text-xl font-black text-slate-900">{name}</h2>
      <p className="text-sm text-slate-400">Interface en cours de développement</p>
      <button onClick={onBack} className="mt-2 rounded-xl px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90" style={{ background: color }}>
        ← Retour au Dashboard
      </button>
    </div>
  );
}

export default function HomeApp() {
  const status    = useAuthStore((s) => s.status);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const pathname  = usePathname();
  const router    = useRouter();

  useEffect(() => { void bootstrap(); }, [bootstrap]);

  const { mainView, page, agentId, marketingFeature, supportFeature } = parseRoute(pathname);

  if (status === "unknown") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#4cc9f0] border-t-transparent" />
      </div>
    );
  }

  if (status === "signedOut" || status === "signingIn") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50">
        <LoginScreen />
      </div>
    );
  }

  // ── Navigation handler pour la sidebar ──────────────────────
  const handleNavigate = (id: string) => {
    switch (id) {
      case "dashboard":     return router.push(dashboardPath());
      case "secretary":     return router.push(vsPath("overview"));
      case "bureau":        return router.push(deptPath());
      // Agents
      case "global":        return router.push(agentPath("global"));
      case "marketing":     return router.push(agentPath("marketing"));
      case "sales":         return router.push(agentPath("sales"));
      case "support":       return router.push(agentPath("support"));
      case "hr":            return router.push(agentPath("hr"));
      case "legal":         return router.push(agentPath("legal"));
      case "technology":    return router.push(agentPath("technology"));
      case "product":       return router.push(agentPath("product"));
      case "strategy":      return router.push(agentPath("strategy"));
      // Sub-features Marketing → David avec feature active
      case "e-reputation":  return router.push("/dashboard/marketing/e-reputation");
      case "seo":           return router.push("/dashboard/marketing/seo");
      case "linkedin":      return router.push("/dashboard/marketing/linkedin");
      // Sub-features Sales
      case "prospecting":   return router.push("/dashboard/sales/prospecting");
      case "campaigns":     return router.push("/dashboard/sales/campaigns");
      // Sub-features Support
      case "chatbot":       return router.push("/dashboard/support/chatbot");
      case "call-agent":    return router.push("/dashboard/support/agent-call");
      default:              return router.push(dashboardPath());
    }
  };

  const shellActivePage =
    mainView === "dashboard" ? "dashboard"
    : mainView === "vs"      ? "secretary"
    : mainView === "agent"   ? (agentId ?? "dept")
    : "dept";

  return (
    <FlugiaShell
      activePage={shellActivePage}
      onNavigate={handleNavigate}
    >
      {/* Dashboard */}
      {mainView === "dashboard" && (
        <FlugiaMainDashboard
          onEnterDept={(deptId?: string) => {
            if (deptId && deptId !== "bureau") {
              router.push(agentPath(deptId as AgentId));
            } else {
              router.push(deptPath());
            }
          }}
        />
      )}

      {/* Bureau overview */}
      {mainView === "dept" && (
        <OverviewScreen onNavigate={(p: AriaPage) => router.push(vsPath(p))} onBack={() => router.push(dashboardPath())} />
      )}

      {/* Aria chat */}
      <div className={mainView === "vs" ? "h-full" : "hidden"}>
        <Aria page={page} onNavigate={(p: AriaPage) => router.push(vsPath(p))} />
      </div>

      {/* Agents */}
      {mainView === "agent" && agentId && (
        agentId === "marketing" ? (
          <David onBack={() => router.push(dashboardPath())} initialFeature={marketingFeature} />
        ) : agentId === "support" ? (
          <Emily onBack={() => router.push(dashboardPath())} initialFeature={supportFeature} />
        ) : agentId === "global" ? (
          <Roger onBack={() => router.push(dashboardPath())} />
        ) : (
          <AgentPlaceholder agentId={agentId} onBack={() => router.push(dashboardPath())} />
        )
      )}
    </FlugiaShell>
  );
}