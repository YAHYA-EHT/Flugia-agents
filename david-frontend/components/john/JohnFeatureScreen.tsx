"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Users, Mail, Maximize2, Minimize2, Loader2, TrendingUp } from "lucide-react";
import { JohnChatScreen } from "./JohnChatScreen";

type SalesFeature = "prospecting" | "campaigns";
const API = "http://localhost:8002";
const PRIMARY = "#4cc9f0";

const FEATURE_TABS: { id: SalesFeature; label: string }[] = [
  { id: "prospecting", label: "Prospecting" },
  { id: "campaigns",   label: "Campaigns" },
];

export function JohnFeatureScreen({ feature, onBack, onSwitchFeature }: {
  feature: SalesFeature; onBack: () => void; onSwitchFeature: (f: SalesFeature) => void;
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
            {feature === "prospecting" && <ProspectingDashboard />}
            {feature === "campaigns"   && <CampaignsDashboard />}
          </div>
        )}
        <div className={`shrink-0 border-l border-slate-200 bg-white flex flex-col transition-all duration-300 ${chatExpanded ? "w-full" : "w-[380px]"}`}>
          <JohnChatScreen context={feature} />
        </div>
      </div>
    </div>
  );
}

// ── Prospecting ───────────────────────────────────────────────
interface LeadList { id: number; name: string; leads_count?: number; created_at?: string }
interface Lead { person_id: string; first_name?: string; last_name?: string; company_name?: string; title?: string; email?: string }

function ProspectingDashboard() {
  const [lists, setLists] = useState<LeadList[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/dashboard/sales`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setLists(d.lead_lists ?? []);
          setLeads(d.leads ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingCard />;

  const totalLeads = lists.reduce((sum, l) => sum + (l.leads_count ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {[
          { value: String(lists.length), label: "Listes de leads" },
          { value: String(totalLeads), label: "Total prospects" },
          { value: String(leads.length), label: "Leads enrichis récents" },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border bg-white p-5" style={{ borderColor: "rgba(76,201,240,0.35)" }}>
            <p className="text-3xl font-black" style={{ color: PRIMARY }}>{s.value}</p>
            <p className="mt-1 text-[12px] text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5">
        <h3 className="mb-4 text-sm font-bold text-slate-700">Listes de leads</h3>
        {lists.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Users className="h-8 w-8 text-slate-200" />
            <p className="text-sm text-slate-400">Aucune liste de leads</p>
            <p className="text-[12px] text-slate-300">Demandez à John de vous montrer vos prospects</p>
          </div>
        ) : (
          <div className="space-y-2">
            {lists.map(l => (
              <div key={l.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5">
                <p className="truncate text-[13px] font-medium text-slate-800">{l.name}</p>
                <span className="rounded-full bg-[#4cc9f0]/10 px-2 py-0.5 text-[11px] font-semibold" style={{ color: PRIMARY }}>
                  {l.leads_count ?? 0} leads
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5">
        <h3 className="mb-4 text-sm font-bold text-slate-700">Leads récents</h3>
        {leads.length === 0 ? (
          <p className="text-sm text-slate-400">Aucun lead enrichi récent.</p>
        ) : (
          <div className="space-y-3">
            {leads.map((l) => (
              <div key={l.person_id} className="flex items-start gap-3 rounded-xl border border-slate-100 p-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                  {(l.first_name ?? "?")[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-slate-800">{l.first_name} {l.last_name}</p>
                  <p className="mt-0.5 text-[12px] text-slate-500">{l.title} {l.company_name ? `— ${l.company_name}` : ""}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Campaigns ─────────────────────────────────────────────────
interface Campaign { id: number; name: string; status?: string; statistics?: { total_contacts?: number; total_emails_sent?: number } }

function CampaignsDashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<{ total_campaigns?: number; total_active_campaigns?: number; total_emails_sent?: number; total_replies?: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/dashboard/sales`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setCampaigns(d.campaigns ?? []);
          setStats(d.stats ?? {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingCard />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {[
          { value: String(stats?.total_active_campaigns ?? 0), label: "Campagnes actives" },
          { value: String(stats?.total_emails_sent ?? 0), label: "Emails envoyés" },
          { value: String(stats?.total_replies ?? 0), label: "Réponses reçues" },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border bg-white p-5" style={{ borderColor: "rgba(76,201,240,0.35)" }}>
            <p className="text-3xl font-black" style={{ color: PRIMARY }}>{s.value}</p>
            <p className="mt-1 text-[12px] text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5">
        <h3 className="mb-4 text-sm font-bold text-slate-700">Campagnes</h3>
        {campaigns.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Mail className="h-8 w-8 text-slate-200" />
            <p className="text-sm text-slate-400">Aucune campagne</p>
            <p className="text-[12px] text-slate-300">Demandez à John l&apos;état de vos campagnes d&apos;outreach</p>
          </div>
        ) : (
          <div className="space-y-2">
            {campaigns.map(c => (
              <div key={c.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-slate-800">{c.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {c.statistics?.total_contacts ?? 0} contacts · {c.statistics?.total_emails_sent ?? 0} emails envoyés
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  c.status === "active" ? "bg-green-50 text-green-600"
                  : c.status === "paused" ? "bg-amber-50 text-amber-600"
                  : c.status === "completed" ? "bg-slate-100 text-slate-500"
                  : "bg-slate-100 text-slate-500"
                }`}>
                  {c.status === "active" ? "Active" : c.status === "paused" ? "En pause" : c.status === "completed" ? "Terminée" : c.status ?? "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {stats && (
        <div className="rounded-2xl border border-slate-100 bg-white p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4" style={{ color: PRIMARY }} />
            <h3 className="text-sm font-bold text-slate-700">Bilan global</h3>
          </div>
          <p className="text-[12px] text-slate-400">
            {stats.total_campaigns ?? 0} campagnes au total, dont {stats.total_active_campaigns ?? 0} actives.
          </p>
        </div>
      )}
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