"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, MessageSquare, Phone, Loader2, Star, TrendingUp, TrendingDown, Maximize2, Minimize2, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { EmilyChatScreen } from "./EmilyChatScreen";

type EmilyFeature = "chatbot" | "agent_call";
const API = "http://localhost:8001";
const EMILY_COLOR = "#4cc9f0";

const FEATURE_TABS: { id: EmilyFeature; label: string; icon: React.ReactNode }[] = [
  { id: "chatbot",    label: "Chatbot",     icon: <MessageSquare className="h-4 w-4" /> },
  { id: "agent_call", label: "Agent Call",  icon: <Phone className="h-4 w-4" /> },
];

export function EmilyFeatureScreen({ feature, onBack, onSwitchFeature }: {
  feature: EmilyFeature; onBack: () => void; onSwitchFeature: (f: EmilyFeature) => void;
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
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all ${feature === tab.id ? "text-white" : "text-slate-500 hover:bg-slate-100"}`}
              style={feature === tab.id ? { background: EMILY_COLOR } : {}}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>
        <button onClick={() => setChatExpanded(v => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:border-cyan-300 hover:text-cyan-600 transition">
          {chatExpanded ? <><Minimize2 className="h-3.5 w-3.5" /> Vue split</> : <><Maximize2 className="h-3.5 w-3.5" /> Agrandir chat</>}
        </button>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {!chatExpanded && (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {feature === "chatbot"    && <ChatbotDashboard />}
            {feature === "agent_call" && <AgentCallDashboard />}
          </div>
        )}
        <div className={`shrink-0 border-l border-slate-200 bg-white flex flex-col transition-all duration-300 ${chatExpanded ? "w-full" : "w-[380px]"}`}>
          <EmilyChatScreen context={feature} />
        </div>
      </div>
    </div>
  );
}

// ── Chatbot Dashboard ─────────────────────────────────────────
interface ChatbotData {
  chatbots: { id: number; name?: string; status?: string; public_token?: string }[];
  notifications: { id: number; message?: string; type?: string }[];
}

function ChatbotDashboard() {
  const [data, setData] = useState<ChatbotData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/dashboard/chatbot`)
      .then(r => r.json())
      .then(d => { if (d.success) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingCard />;

  const rawChatbots = data?.chatbots ?? [];
  const chatbots = Array.isArray(rawChatbots) ? rawChatbots : (rawChatbots && typeof rawChatbots === "object" ? [rawChatbots] : []);
  const rawNotifs = data?.notifications ?? [];
  const notifs = Array.isArray(rawNotifs) ? rawNotifs : [];
  const active   = chatbots.filter(c => c.status === "active" || c.status === "completed").length;
  const errors   = chatbots.filter(c => c.status === "failed" || c.status === "error").length;
  const pending  = notifs.filter(n => !n.type?.includes("read")).length;

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { value: String(chatbots.length), label: "Chatbots total", ok: true },
          { value: String(active), label: "Actifs", ok: active === chatbots.length },
          { value: String(errors), label: "En erreur", ok: errors === 0 },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border bg-white p-5" style={{ borderColor: s.ok ? "rgba(168,85,247,0.3)" : "rgba(239,68,68,0.3)" }}>
            <p className="text-3xl font-black" style={{ color: s.ok ? EMILY_COLOR : "#ef4444" }}>{s.value}</p>
            <p className="mt-1 text-[12px] text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Chatbots list */}
      <div className="rounded-2xl border border-slate-100 bg-white p-5">
        <h3 className="mb-4 text-sm font-bold text-slate-700">Nos chatbots</h3>
        {chatbots.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <MessageSquare className="h-8 w-8 text-slate-200" />
            <p className="text-sm text-slate-400">Aucun chatbot configuré</p>
            <p className="text-[12px] text-slate-300">Demandez à Emily de créer votre premier chatbot</p>
          </div>
        ) : (
          <div className="space-y-2">
            {chatbots.map(bot => {
              const isActive = bot.status === "active" || bot.status === "completed";
              const isError  = bot.status === "failed" || bot.status === "error";
              return (
                <div key={bot.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg text-white text-xs font-bold" style={{ background: EMILY_COLOR }}>
                      {(bot.name ?? "B")[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-slate-800">{bot.name ?? `Chatbot #${bot.id}`}</p>
                      <p className="text-[11px] text-slate-400">ID: {bot.id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isActive && <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-600"><CheckCircle className="h-3 w-3" />Actif</span>}
                    {isError  && <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-500"><AlertCircle className="h-3 w-3" />Erreur</span>}
                    {!isActive && !isError && <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600"><Clock className="h-3 w-3" />{bot.status ?? "—"}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Notifications */}
      {notifs.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-700">Notifications</h3>
            {pending > 0 && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: EMILY_COLOR }}>{pending} non lues</span>}
          </div>
          <div className="space-y-2">
            {notifs.slice(0, 5).map(n => (
              <div key={n.id} className="flex items-start gap-2 rounded-lg border border-slate-100 px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-cyan-400" />
                <p className="text-[12px] text-slate-600">{n.message ?? `Notification #${n.id}`}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Agent Call Dashboard ──────────────────────────────────────
interface AgentCallData {
  dashboard: { total_calls?: number; answered_calls?: number; missed_calls?: number; average_duration?: number; balance?: { minutes?: number } };
  ratings: { average?: number; total?: number };
  recent_calls: { id: number; status?: string; duration?: number; created_at?: string; phone_number?: string }[];
}

function AgentCallDashboard() {
  const [data, setData] = useState<AgentCallData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/dashboard/agent-call`)
      .then(r => r.json())
      .then(d => { if (d.success) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingCard />;

  const dash   = data?.dashboard ?? {};
  const ratings = data?.ratings ?? {};
  const calls  = data?.recent_calls ?? [];

  const total   = dash.total_calls ?? 0;
  const answered = dash.answered_calls ?? 0;
  const missed  = dash.missed_calls ?? 0;
  const balance = dash.balance?.minutes ?? 0;
  const avgDuration = dash.average_duration ?? 0;
  const avgRating = ratings.average ?? 0;
  const answerRate = total > 0 ? Math.round((answered / total) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { value: String(total), label: "Appels total", ok: true },
          { value: `${answerRate}%`, label: "Taux de décroché", ok: answerRate >= 75 },
          { value: String(missed), label: "Appels manqués", ok: missed === 0 },
          { value: `${balance} min`, label: "Balance restante", ok: balance >= 100 },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border bg-white p-5" style={{ borderColor: s.ok ? "rgba(168,85,247,0.3)" : "rgba(239,68,68,0.3)" }}>
            <p className="text-2xl font-black" style={{ color: s.ok ? EMILY_COLOR : "#ef4444" }}>{s.value}</p>
            <p className="mt-1 text-[12px] text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Satisfaction */}
      {avgRating > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-5">
          <h3 className="mb-3 text-sm font-bold text-slate-700">Satisfaction client</h3>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-5 w-5" fill={i < Math.round(avgRating) ? "#f59e0b" : "none"} stroke={i < Math.round(avgRating) ? "#f59e0b" : "#d1d5db"} />
              ))}
            </div>
            <span className="text-2xl font-black" style={{ color: avgRating >= 4 ? EMILY_COLOR : avgRating >= 3 ? "#f59e0b" : "#ef4444" }}>{avgRating.toFixed(1)}/5</span>
            {ratings.total && <span className="text-[12px] text-slate-400">({ratings.total} avis)</span>}
            {avgRating >= 4 ? <TrendingUp className="h-4 w-4 text-green-400" /> : <TrendingDown className="h-4 w-4 text-red-400" />}
          </div>
          {avgRating < 4 && <p className="mt-2 text-[12px] text-amber-600">— En dessous du seuil recommandé (4.0/5)</p>}
        </div>
      )}

      {/* Recent calls */}
      <div className="rounded-2xl border border-slate-100 bg-white p-5">
        <h3 className="mb-4 text-sm font-bold text-slate-700">Appels récents</h3>
        {calls.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Phone className="h-8 w-8 text-slate-200" />
            <p className="text-sm text-slate-400">Aucun appel récent</p>
          </div>
        ) : (
          <div className="space-y-2">
            {calls.map(call => {
              const isMissed = call.status === "missed" || call.status === "no-answer";
              const isCompleted = call.status === "completed";
              return (
                <div key={call.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-full ${isMissed ? "bg-red-50" : "bg-green-50"}`}>
                      <Phone className={`h-3.5 w-3.5 ${isMissed ? "text-red-400" : "text-green-500"}`} />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-slate-800">{call.phone_number ?? `Appel #${call.id}`}</p>
                      {call.created_at && <p className="text-[11px] text-slate-400">{new Date(call.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {call.duration && <span className="text-[11px] text-slate-400">{Math.floor(call.duration / 60)}m{call.duration % 60}s</span>}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isMissed ? "bg-red-50 text-red-500" : isCompleted ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-500"}`}>
                      {isMissed ? "Manqué" : isCompleted ? "Terminé" : call.status ?? "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Balance warning */}
      {balance < 100 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-semibold text-amber-700">Balance faible : {balance} minutes restantes</p>
          </div>
          <p className="mt-1 text-[12px] text-amber-600">Demandez à Emily de vérifier les transactions et envisager une recharge.</p>
        </div>
      )}
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="flex h-40 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin" style={{ color: EMILY_COLOR }} />
    </div>
  );
}