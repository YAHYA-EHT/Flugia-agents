"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { ArrowLeft, HeadphonesIcon, MessageSquare, Phone, Maximize2, Minimize2, Loader2 } from "lucide-react";
import { EmilyChatScreen } from "./EmilyChatScreen";

const API = "http://localhost:8001";
const EMILY_COLOR = "#4cc9f0";
const EMILY_GRADIENT = "linear-gradient(135deg, #4cc9f0, #0096C7)";

type EmilyFeature = "chatbot" | "agent_call";

const FEATURES = [
  {
    id: "chatbot" as EmilyFeature,
    name: "Chatbot",
    description: "Chatbots IA pour le support client en ligne — gestion, statistiques et conversations.",
    icon: <MessageSquare className="h-5 w-5" />,
  },
  {
    id: "agent_call" as EmilyFeature,
    name: "Agent Call",
    description: "Agents vocaux IA pour les appels entrants et sortants — analytics, transcriptions et balance.",
    icon: <Phone className="h-5 w-5" />,
  },
];

export function EmilyOverview({ onFeatureClick, onBack }: {
  onFeatureClick: (f: EmilyFeature) => void; onBack?: () => void;
}) {
  const [chatExpanded, setChatExpanded] = useState(false);
  const [stats, setStats] = useState([
    { value: "…", label: "Chatbots actifs" },
    { value: "…", label: "Appels cette semaine" },
    { value: "…", label: "Balance minutes" },
  ]);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/dashboard/chatbot`).then(r => r.json()).catch(() => ({})),
      fetch(`${API}/dashboard/agent-call`).then(r => r.json()).catch(() => ({})),
    ]).then(([chatbot, agentCall]) => {
      const botsRaw = chatbot?.chatbots ?? [];
      const bots    = Array.isArray(botsRaw) ? botsRaw : (botsRaw && typeof botsRaw === "object" ? [botsRaw] : []);
      const active  = bots.filter((b: { status?: string }) => b.status === "active" || b.status === "completed" || b.status === "ready").length;
      const total   = agentCall?.dashboard?.total_calls ?? 0;
      const balance = agentCall?.dashboard?.balance?.minutes ?? 0;
      setStats([
        { value: `${active}/${bots.length}`, label: "Chatbots actifs" },
        { value: String(total), label: "Appels cette semaine" },
        { value: `${balance} min`, label: "Balance restante" },
      ]);
    });
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-6 py-3.5">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div>
            <h1 className="text-sm font-bold text-slate-900">AI Support Team</h1>
            <p className="mt-0.5 text-[11px] text-slate-400">2 tools active · 0 Actions to validate</p>
          </div>
        </div>
        <button onClick={() => setChatExpanded(v => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:border-cyan-300 hover:text-cyan-600 transition">
          {chatExpanded ? <><Minimize2 className="h-3.5 w-3.5" /> Vue split</> : <><Maximize2 className="h-3.5 w-3.5" /> Agrandir chat</>}
        </button>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {!chatExpanded && (
          <div className="min-w-0 flex-1 overflow-y-auto p-6 space-y-6">
            {/* Hero + Stats */}
            <div className="flex w-full flex-col gap-4 xl:flex-row">
              {/* Hero */}
              <div className="relative flex w-full items-end overflow-hidden rounded-2xl xl:w-[62%]"
                style={{ background: "linear-gradient(135deg, #e8f9fd 0%, #d0f0fa 100%)", minHeight: 260 }}>
                <div className="absolute left-5 top-5 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg text-white" style={{ background: EMILY_COLOR }}>
                    <HeadphonesIcon className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-700">
                    AI Support <span className="font-normal text-slate-400">TEAM</span>
                  </span>
                </div>
                <div className="absolute bottom-0 right-4 flex h-full items-end">
                  <Image src="/emily.webp" alt="Emily" width={200} height={240}
                    style={{ height: "100%", width: "auto" }} className="object-contain object-bottom" priority />
                </div>
                <div className="relative z-10 p-5">
                  <p className="text-2xl font-black text-slate-900">Emily</p>
                  <p className="mt-0.5 text-[12px] font-medium text-slate-500">AI Support Manager</p>
                </div>
              </div>

              {/* Stats */}
              <div className="flex w-full flex-col gap-2 xl:w-[38%]">
                {stats.map(s => (
                  <div key={s.label} className="flex flex-1 items-center rounded-xl border bg-white px-5 py-4"
                    style={{ borderColor: "rgba(168,85,247,0.35)" }}>
                    <div>
                      <p className="text-2xl font-black leading-none" style={{ color: EMILY_COLOR }}>{s.value}</p>
                      <p className="mt-1 text-[12px] font-medium text-slate-400">{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Features */}
            <section>
              <h2 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">Support Tools</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {FEATURES.map((f, i) => (
                  <div key={f.id} onClick={() => onFeatureClick(f.id)}
                    className="animate-bubble-up flex cursor-pointer flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
                    style={{ animationDelay: `${i * 60}ms`, borderColor: "rgba(168,85,247,0.15)" }}>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: "linear-gradient(135deg, #4cc9f0, #0096C7)" }}>
                      {f.icon}
                    </div>
                    <div>
                      <p className="text-[15px] font-bold text-slate-900">{f.name}</p>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400">{f.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* Chat panel */}
        <div className={`shrink-0 border-l border-slate-200 bg-white flex flex-col transition-all duration-300 ${chatExpanded ? "w-full" : "w-80"}`}>
          <EmilyChatScreen context="emily" />
        </div>
      </div>
    </div>
  );
}