"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { ArrowLeft, TrendingUp, Users, Mail, Maximize2, Minimize2 } from "lucide-react";
import { JohnChatScreen } from "./JohnChatScreen";

const API = "http://localhost:8002";

const PRIMARY = "#4cc9f0";

type SalesFeature = "prospecting" | "campaigns";

type FeatureStatus = "active" | "locked" | "coming-soon";

interface Feature {
  id: SalesFeature | "coming";
  name: string;
  description: string;
  icon: React.ReactNode;
  status: FeatureStatus;
}

const FEATURES: Feature[] = [
  {
    id: "prospecting",
    name: "Prospecting",
    description: "Consulte tes listes de leads et prospects enrichis.",
    icon: <Users className="h-5 w-5" />,
    status: "active",
  },
  {
    id: "campaigns",
    name: "Campaigns",
    description: "Suivi des campagnes d'outreach et de relance par email.",
    icon: <Mail className="h-5 w-5" />,
    status: "active",
  },
];

export function JohnOverview({
  onFeatureClick,
  onBack,
}: {
  onFeatureClick: (feature: SalesFeature) => void;
  onBack?: () => void;
}) {
  const activeCount = FEATURES.filter((f) => f.status === "active").length;
  const [chatExpanded, setChatExpanded] = useState(false);
  const [STATS, setSTATS] = useState([
    { value: "…", label: "Campagnes actives" },
    { value: "…", label: "Total leads" },
    { value: "…", label: "Emails envoyés" },
  ]);

  useEffect(() => {
    fetch(`${API}/dashboard/sales`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          const s = d.stats ?? {};
          const leadCount = (d.lead_lists ?? []).reduce(
            (sum: number, l: { leads_count?: number }) => sum + (l.leads_count ?? 0), 0
          );
          setSTATS([
            { value: String(s.total_active_campaigns ?? 0), label: "Campagnes actives" },
            { value: String(leadCount || s.total_contacts || 0), label: "Total leads" },
            { value: String(s.total_emails_sent ?? 0), label: "Emails envoyés" },
          ]);
        }
      })
      .catch(() => setSTATS([
        { value: "—", label: "Campagnes actives" },
        { value: "—", label: "Total leads" },
        { value: "—", label: "Emails envoyés" },
      ]));
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-6 py-3.5">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition hover:bg-slate-200"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div>
            <h1 className="text-sm font-bold leading-tight text-slate-900">AI Sales Team</h1>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {activeCount} tools active · 0 Actions to validate
            </p>
          </div>
        </div>

        {/* Expand chat button */}
        <button
          onClick={() => setChatExpanded((v) => !v)}
          title={chatExpanded ? "Vue split" : "Agrandir le chat"}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-[#4cc9f0] hover:text-[#4cc9f0]"
        >
          {chatExpanded ? (
            <><Minimize2 className="h-3.5 w-3.5" /> Vue split</>
          ) : (
            <><Maximize2 className="h-3.5 w-3.5" /> Agrandir chat</>
          )}
        </button>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left column — hidden when chat expanded */}
        {!chatExpanded && (
          <div className="min-w-0 flex-1 space-y-6 overflow-y-auto p-6">
            {/* Hero + Stats */}
            <div className="flex w-full flex-col gap-4 xl:flex-row">
              {/* Hero banner */}
              <div
                className="relative flex w-full items-end overflow-hidden rounded-2xl xl:w-[62%]"
                style={{ background: "linear-gradient(135deg, #e8f9fd 0%, #d0f0fa 100%)", minHeight: 260 }}
              >
                <div className="absolute left-5 top-5 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: PRIMARY }}>
                    <TrendingUp className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-700">
                    AI Sales <span className="font-normal text-slate-400">TEAM</span>
                  </span>
                </div>
                <div className="absolute bottom-0 right-4 flex h-full items-end">
                  <Image
                    src="/sales.webp"
                    alt="John"
                    width={200}
                    height={240}
                    style={{ height: "100%", width: "auto" }}
                    className="object-contain object-bottom"
                    priority
                  />
                </div>
                <div className="relative z-10 p-5">
                  <p className="text-2xl font-black text-slate-900">John</p>
                  <p className="mt-0.5 text-[12px] font-medium text-slate-500">AI Sales Manager</p>
                </div>
              </div>

              {/* Stat cards */}
              <div className="flex w-full flex-col gap-2 xl:w-[38%]">
                {STATS.map((s) => (
                  <div
                    key={s.label}
                    className="flex flex-1 items-center rounded-xl border bg-white px-5 py-4"
                    style={{ borderColor: "rgba(76,201,240,0.4)" }}
                  >
                    <div>
                      <p className="text-2xl font-black leading-none" style={{ color: PRIMARY }}>{s.value}</p>
                      <p className="mt-1 text-[12px] font-medium text-slate-400">{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Features grid */}
            <section>
              <h2 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Sales Tools
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {FEATURES.map((f, i) => (
                  <FeatureCard
                    key={f.id}
                    feature={f}
                    index={i}
                    onOpen={
                      f.status === "active"
                        ? () => onFeatureClick(f.id as SalesFeature)
                        : undefined
                    }
                  />
                ))}
              </div>
            </section>
          </div>
        )}

        {/* Chat panel */}
        <div
          className={`shrink-0 border-l border-slate-200 bg-white flex flex-col transition-all duration-300 ${
            chatExpanded ? "w-full" : "w-80"
          }`}
        >
          <JohnChatScreen context="john" />
        </div>
      </div>
    </div>
  );
}


function FeatureCard({
  feature,
  onOpen,
  index = 0,
}: {
  feature: Feature;
  onOpen?: () => void;
  index?: number;
}) {
  const isActive = feature.status === "active";

  return (
    <div
      onClick={onOpen}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={onOpen ? (e) => e.key === "Enter" && onOpen() : undefined}
      style={{ animationDelay: `${index * 60}ms` }}
      className={`animate-bubble-up flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-5 transition-all duration-200 ${
        isActive
          ? "cursor-pointer hover:-translate-y-0.5 hover:border-[#4cc9f0]/40 hover:shadow-md"
          : "cursor-default opacity-60"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={
            isActive
              ? { background: "rgba(76,201,240,0.1)", color: PRIMARY }
              : { background: "#f1f5f9", color: "#94a3b8" }
          }
        >
          {feature.icon}
        </div>
      </div>
      <div className="flex-1">
        <p
          className={`text-[15px] font-bold leading-tight ${
            isActive ? "text-slate-900" : "text-slate-400"
          }`}
        >
          {feature.name}
        </p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400">
          {feature.description}
        </p>
      </div>
    </div>
  );
}