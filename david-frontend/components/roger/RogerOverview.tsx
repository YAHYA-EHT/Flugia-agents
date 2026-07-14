"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { ArrowLeft, Globe, TrendingUp, HeadphonesIcon, Maximize2, Minimize2, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { RogerChatScreen } from "./RogerChatScreen";

const API_DAVID  = "http://localhost:8000";
const API_EMILY  = "http://localhost:8001";
const API_JOHN   = "http://localhost:8003";
const PRIMARY    = "#ef4444";

type AgentStatus = "loading" | "online" | "offline";

const AGENT_CARDS = [
  {
    key: "david", name: "David", role: "AI Marketing Manager",
    icon: <TrendingUp className="h-5 w-5" />, color: "#4cc9f0",
    features: ["E-Réputation", "SEO Content", "LinkedIn"],
    url: API_DAVID,
  },
  {
    key: "emily", name: "Emily", role: "AI Support Manager",
    icon: <HeadphonesIcon className="h-5 w-5" />, color: "#4cc9f0",
    features: ["Chatbot", "Agent Call", "Transcriptions"],
    url: API_EMILY,
  },
  {
    key: "john", name: "John", role: "AI Sales Manager",
    icon: <TrendingUp className="h-5 w-5" />, color: "#4cc9f0",
    features: ["Leads", "Pipeline", "Campagnes"],
    url: API_JOHN,
  },
];

export function RogerOverview({ onBack, onNavigate }: { onBack?: () => void; onNavigate?: (path: string) => void }) {
  const [chatExpanded, setChatExpanded] = useState(false);
  const [agents, setAgents] = useState<Record<string, AgentStatus>>({
    david: "loading", emily: "loading", john: "loading",
  });
  const [stats, setStats] = useState([
    { value: "…", label: "Agents en ligne" },
    { value: "2",  label: "Départements actifs" },
    { value: "…",  label: "Statut global" },
  ]);

  useEffect(() => {
    void (async () => {
      const results: Record<string, AgentStatus> = {};
      await Promise.all(
        AGENT_CARDS.map(a =>
          fetch(`${a.url}/health`)
            .then(() => { results[a.key] = "online"; })
            .catch(() => { results[a.key] = "offline"; })
        )
      );
      setAgents(results);
      const online = Object.values(results).filter(s => s === "online").length;
      setStats([
        { value: `${online}/3`, label: "Agents en ligne" },
        { value: "3", label: "Départements actifs" },
        { value: online === 3 ? "✓ Opérationnel" : "⚠ Vérifier", label: "Statut global" },
      ]);
    })();
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-6 py-3.5">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition hover:bg-slate-200">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div>
            <h1 className="text-sm font-bold leading-tight text-slate-900">Direction Générale</h1>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {Object.values(agents).filter(s => s === "online").length} agents en ligne · Vue globale
            </p>
          </div>
        </div>
        <button
          onClick={() => setChatExpanded(v => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-red-300 hover:text-red-500"
        >
          {chatExpanded
            ? <><Minimize2 className="h-3.5 w-3.5" /> Vue split</>
            : <><Maximize2 className="h-3.5 w-3.5" /> Agrandir chat</>}
        </button>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {!chatExpanded && (
          <div className="min-w-0 flex-1 space-y-6 overflow-y-auto p-6">

            {/* Hero + Stats */}
            <div className="flex w-full flex-col gap-4 xl:flex-row">
              {/* Hero banner — pastel rouge comme David est pastel bleu */}
              <div
                className="relative flex w-full items-end overflow-hidden rounded-2xl xl:w-[62%]"
                style={{ background: "linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)", minHeight: 260 }}
              >
                <div className="absolute left-5 top-5 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: PRIMARY }}>
                    <Globe className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-700">
                    Direction <span className="font-normal text-slate-400">GÉNÉRALE</span>
                  </span>
                </div>
                <div className="absolute bottom-0 right-4 flex h-full items-end">
                  <Image
                    src="/global.webp"
                    alt="Roger"
                    width={200}
                    height={240}
                    style={{ height: "100%", width: "auto" }}
                    className="object-contain object-bottom"
                    priority
                  />
                </div>
                <div className="relative z-10 p-5">
                  <p className="text-2xl font-black text-slate-900">Roger</p>
                  <p className="mt-0.5 text-[12px] font-medium text-slate-500">Global Director</p>
                </div>
              </div>

              {/* Stat cards */}
              <div className="flex w-full flex-col gap-2 xl:w-[38%]">
                {stats.map(s => (
                  <div
                    key={s.label}
                    className="flex flex-1 items-center rounded-xl border bg-white px-5 py-4"
                    style={{ borderColor: "rgba(239,68,68,0.35)" }}
                  >
                    <div>
                      <p className="text-2xl font-black leading-none" style={{ color: PRIMARY }}>{s.value}</p>
                      <p className="mt-1 text-[12px] font-medium text-slate-400">{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Agents sous supervision */}
            <section>
              <h2 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Agents sous supervision
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {AGENT_CARDS.map(agent => {
                  const st = agents[agent.key] ?? "loading";
                  return (
                    <div
                      key={agent.key}
                      onClick={() => {
                        const paths: Record<string, string> = {
                          david: "/dashboard/marketing",
                          emily: "/dashboard/support",
                          john:  "/dashboard/sales",
                        };
                        onNavigate?.(paths[agent.key] ?? "/dashboard");
                      }}
                      className="animate-bubble-up flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-5 transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-md"
                      style={{ borderColor: `rgba(76,201,240,0.15)` }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: agent.color }}>
                            {agent.icon}
                          </div>
                          <div>
                            <p className="text-[15px] font-bold text-slate-900">{agent.name}</p>
                            <p className="text-[11px] text-slate-400">{agent.role}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {st === "loading" && <Loader2 className="h-4 w-4 animate-spin text-slate-300" />}
                          {st === "online"  && <><CheckCircle className="h-4 w-4 text-green-400" /><span className="text-[11px] font-medium text-green-500">En ligne</span></>}
                          {st === "offline" && <><AlertCircle className="h-4 w-4 text-red-400" /><span className="text-[11px] font-medium text-red-400">Hors ligne</span></>}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {agent.features.map(f => (
                          <span key={f} className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                            style={{ background: `${agent.color}15`, color: agent.color }}>
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* Chat panel */}
        <div className={`shrink-0 border-l border-slate-200 bg-white flex flex-col transition-all duration-300 ${chatExpanded ? "w-full" : "w-80"}`}>
          <RogerChatScreen />
        </div>
      </div>
    </div>
  );
}