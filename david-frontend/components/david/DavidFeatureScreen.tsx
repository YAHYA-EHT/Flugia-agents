"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, ShieldCheck, BarChart3, Star, TrendingDown, TrendingUp, MessageSquare, Maximize2, Minimize2, Loader2 } from "lucide-react";
import { DavidChatScreen } from "./DavidChatScreen";

type DavidFeature = "e_reputation" | "seo" | "linkedin";
const API = "http://localhost:8000";
const PRIMARY = "#4cc9f0";

const FEATURE_TABS: { id: DavidFeature; label: string }[] = [
  { id: "e_reputation", label: "E-Reputation" },
  { id: "seo",          label: "SEO Content" },
  { id: "linkedin",     label: "LinkedIn" },
];

export function DavidFeatureScreen({ feature, onBack, onSwitchFeature }: {
  feature: DavidFeature; onBack: () => void; onSwitchFeature: (f: DavidFeature) => void;
}) {
  const [chatExpanded, setChatExpanded] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-3 border-b border-slate-100 bg-white px-6 py-3">
        <button onClick={onBack} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex flex-1 gap-1">
          {FEATURE_TABS.map(tab => (
            <button key={tab.id} onClick={() => onSwitchFeature(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-all ${feature === tab.id ? "text-white" : "text-slate-500 hover:bg-slate-100"}`}
              style={feature === tab.id ? { background: PRIMARY } : {}}>
              {tab.label}
            </button>
          ))}
        </div>
        <button onClick={() => setChatExpanded(v => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:border-[#4cc9f0] hover:text-[#4cc9f0]">
          {chatExpanded ? <><Minimize2 className="h-3.5 w-3.5" /> Vue split</> : <><Maximize2 className="h-3.5 w-3.5" /> Agrandir chat</>}
        </button>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {!chatExpanded && (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {feature === "e_reputation" && <ERepDashboard />}
            {feature === "seo"          && <SeoDashboard />}
            {feature === "linkedin"     && <LinkedInDashboard />}
          </div>
        )}
        <div className={`shrink-0 border-l border-slate-200 bg-white flex flex-col transition-all duration-300 ${chatExpanded ? "w-full" : "w-[380px]"}`}>
          <DavidChatScreen context={feature} />
        </div>
      </div>
    </div>
  );
}

// ── E-Réputation ──────────────────────────────────────────────
interface ERepData {
  stats: { average_rating?: number; negative_count?: number; pending_response?: number; trend?: { last_7_days?: number } };
  negative_reviews: { author?: string; rating?: number; comment?: string; platform?: string }[];
}

function ERepDashboard() {
  const [data, setData] = useState<ERepData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/dashboard/e-reputation`)
      .then(r => r.json())
      .then(d => { if (d.success) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingCard />;

  const avg = data?.stats?.average_rating;
  const neg = data?.stats?.negative_count ?? 0;
  const pending = data?.stats?.pending_response ?? 0;
  const trend = data?.stats?.trend?.last_7_days;
  const reviews = data?.negative_reviews ?? [];

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { value: avg ? `${avg.toFixed(1)}/5` : "—", label: "Score de réputation" },
          { value: String(neg), label: "Avis négatifs" },
          { value: String(pending), label: "En attente de réponse" },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border bg-white p-5" style={{ borderColor: "rgba(76,201,240,0.35)" }}>
            <p className="text-3xl font-black" style={{ color: PRIMARY }}>{s.value}</p>
            <p className="mt-1 text-[12px] text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Avis récents */}
      <div className="rounded-2xl border border-slate-100 bg-white p-5">
        <h3 className="mb-4 text-sm font-bold text-slate-700">Avis récents négatifs</h3>
        {reviews.length === 0 ? (
          <p className="text-sm text-slate-400">Aucun avis négatif récent.</p>
        ) : (
          <div className="space-y-3">
            {reviews.map((r, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl border border-slate-100 p-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                  {(r.author ?? "?")[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-semibold text-slate-800">{r.author ?? "Anonyme"}</p>
                    <div className="flex">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <Star key={j} className="h-3 w-3" fill={j < (r.rating ?? 0) ? "#f59e0b" : "none"} stroke={j < (r.rating ?? 0) ? "#f59e0b" : "#d1d5db"} />
                      ))}
                    </div>
                    {r.platform && <span className="text-[10px] text-slate-400">{r.platform}</span>}
                  </div>
                  <p className="mt-0.5 text-[12px] text-slate-500 line-clamp-2">{r.comment ?? ""}</p>
                </div>
                {(r.rating ?? 5) <= 2 && <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-500">Urgent</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tendance */}
      {trend !== undefined && (
        <div className="rounded-2xl border border-slate-100 bg-white p-5">
          <div className="flex items-center gap-2 mb-2">
            {trend >= 0 ? <TrendingUp className="h-4 w-4 text-green-400" /> : <TrendingDown className="h-4 w-4 text-red-400" />}
            <h3 className="text-sm font-bold text-slate-700">Tendance 7 jours</h3>
          </div>
          <p className="text-[12px] text-slate-400">
            {trend >= 0 ? <span className="font-bold text-green-500">+{trend} avis</span> : <span className="font-bold text-red-400">{trend} avis</span>} cette semaine
          </p>
        </div>
      )}
    </div>
  );
}

// ── SEO ───────────────────────────────────────────────────────
interface SeoData {
  posts: { id: number; title?: string; status?: string; seo_score?: number; created_at?: string }[];
  latest_audit: { status?: string; score?: number; created_at?: string } | null;
  suggestions_count: number;
}

function SeoDashboard() {
  const [data, setData] = useState<SeoData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/dashboard/seo`)
      .then(r => r.json())
      .then(d => { if (d.success) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingCard />;

  const posts = data?.posts ?? [];
  const audit = data?.latest_audit;
  const published = posts.filter(p => p.status === "completed").length;
  const avgScore = posts.length > 0 ? Math.round(posts.reduce((s, p) => s + (p.seo_score ?? 0), 0) / posts.length) : 0;
  const inProgress = posts.filter(p => p.status === "processing").length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {[
          { value: String(published), label: "Articles publiés" },
          { value: avgScore > 0 ? `${avgScore}/100` : "—", label: "Score SEO moyen" },
          { value: String(inProgress), label: "En cours de génération" },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border bg-white p-5" style={{ borderColor: "rgba(76,201,240,0.35)" }}>
            <p className="text-3xl font-black" style={{ color: PRIMARY }}>{s.value}</p>
            <p className="mt-1 text-[12px] text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5">
        <h3 className="mb-4 text-sm font-bold text-slate-700">Articles récents</h3>
        {posts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <BarChart3 className="h-8 w-8 text-slate-200" />
            <p className="text-sm text-slate-400">Aucun article</p>
            <p className="text-[12px] text-slate-300">Demandez à David de créer votre premier article SEO</p>
          </div>
        ) : (
          <div className="space-y-2">
            {posts.slice(0, 5).map(p => (
              <div key={p.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-slate-800">{p.title ?? `Article #${p.id}`}</p>
                  <p className="text-[11px] text-slate-400">{p.created_at ? new Date(p.created_at).toLocaleDateString("fr-FR") : ""}</p>
                </div>
                <div className="ml-3 flex items-center gap-2">
                  {p.seo_score && <span className="text-[11px] font-semibold" style={{ color: PRIMARY }}>{p.seo_score}/100</span>}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.status === "completed" ? "bg-green-50 text-green-600" : p.status === "processing" ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-500"}`}>
                    {p.status === "completed" ? "Publié" : p.status === "processing" ? "En cours" : p.status ?? "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5">
        <h3 className="mb-1 text-sm font-bold text-slate-700">Dernier audit SEO</h3>
        {audit ? (
          <div className="mt-2 flex items-center gap-3">
            {audit.score && <span className="text-2xl font-black" style={{ color: PRIMARY }}>{audit.score}/100</span>}
            <div>
              <p className="text-[12px] text-slate-500">Statut : <span className="font-semibold">{audit.status}</span></p>
              {audit.created_at && <p className="text-[11px] text-slate-400">{new Date(audit.created_at).toLocaleDateString("fr-FR")}</p>}
            </div>
          </div>
        ) : (
          <p className="mt-1 text-[12px] text-slate-400">Aucun audit — demandez à David de lancer un audit de votre site.</p>
        )}
      </div>
    </div>
  );
}

// ── LinkedIn ──────────────────────────────────────────────────
function LinkedInDashboard() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {["Posts publiés", "Impressions", "Engagement"].map(label => (
          <div key={label} className="rounded-2xl border bg-white p-5" style={{ borderColor: "rgba(76,201,240,0.35)" }}>
            <p className="text-3xl font-black text-slate-300">—</p>
            <p className="mt-1 text-[12px] text-slate-400">{label}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-100 bg-white p-5">
        <h3 className="mb-4 text-sm font-bold text-slate-700">Posts LinkedIn</h3>
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <MessageSquare className="h-8 w-8 text-slate-200" />
          <p className="text-sm text-slate-400">Aucun post pour l'instant</p>
          <p className="text-[12px] text-slate-300">Demandez à David de créer et publier votre premier post LinkedIn</p>
        </div>
      </div>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="flex h-40 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-[#4cc9f0]" />
    </div>
  );
}