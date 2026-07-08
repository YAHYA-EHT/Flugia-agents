"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Check, Loader2, MessageSquareText, Plus, Sparkles,
  SlidersHorizontal, ThumbsDown, ThumbsUp, Trash2, X,
} from "lucide-react";
import { getApi } from "@/lib/aria";
import { dashboardPath } from "@/lib/aria/routes";
import type { AgentProfile } from "@/lib/aria/types";
import { AiOrb } from "./AiOrb";
import { SkeletonCard } from "./Skeleton";
import { ConfirmDialog } from "./ConfirmDialog";

const inputCls = "w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#4cc9f0] dark:border-slate-700 dark:bg-slate-800";
const areaCls = inputCls + " resize-none leading-relaxed";

const TONE_PRESETS = ["Warm & friendly", "Concise & direct", "Formal & professional", "Playful", "Empathetic"];

// Spreadsheet-style column labels (A, B, ... Z, AA, AB, ...) — mirrors the
// backend's compose_system_prompt() scenario labeling, so what's shown here
// matches how the agent sees each scenario as its own titled section.
function scenarioLabel(index: number): string {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

const SCENARIO_SUGGESTIONS = [
  "If a client asks for a discount, flag it for me — don't commit",
  "Archive newsletters automatically",
  "For meeting requests, propose 2–3 slots from my calendar",
  "Escalate anything urgent from my manager",
];

function SectionCard({
  icon, iconClass, title, subtitle, children,
}: {
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>{icon}</span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-4 px-5 py-4">{children}</div>
    </div>
  );
}

export function AgentSettingsScreen() {
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [original, setOriginal] = useState<AgentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [scenarioDraft, setScenarioDraft] = useState("");
  const [exampleDraft, setExampleDraft] = useState("");
  const [exampleKind, setExampleKind] = useState<"good" | "bad">("good");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void getApi().getAgentProfile().then((p) => { setProfile(p); setOriginal(p); setLoading(false); });
  }, []);

  const dirty = useMemo(
    () => !!profile && !!original && JSON.stringify(profile) !== JSON.stringify(original),
    [profile, original],
  );

  function patch(fields: Partial<AgentProfile>) {
    setProfile((p) => (p ? { ...p, ...fields } : p));
    setSaved(false);
  }

  async function save() {
    if (!profile) return;
    setSaving(true);
    try {
      const updated = await getApi().saveAgentProfile({
        agentName: profile.agentName,
        tone: profile.tone,
        doExamples: profile.doExamples,
        dontExamples: profile.dontExamples,
        scenarios: profile.scenarios,
      });
      setProfile(updated);
      setOriginal(updated);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setConfirmDelete(false);
    setDeleting(true);
    try {
      await getApi().deleteAgent();
      // The agent is gone, not the platform account — drop back to the
      // dashboard (not sign-out) so other Flugia features stay usable, and a
      // full reload re-checks setup status if they re-enter this feature.
      window.location.href = dashboardPath();
    } catch {
      setDeleting(false);
    }
  }

  const scenarios = (profile?.scenarios ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  const remainingSuggestions = SCENARIO_SUGGESTIONS.filter((s) => !scenarios.includes(s));

  function commitScenarios(list: string[]) {
    patch({ scenarios: list.join("\n") });
  }
  function addScenario(text: string) {
    const t = text.trim();
    if (!t || scenarios.includes(t)) return;
    commitScenarios([...scenarios, t]);
    setScenarioDraft("");
  }
  function removeScenario(t: string) {
    commitScenarios(scenarios.filter((x) => x !== t));
  }

  const goodExamples = (profile?.doExamples ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  const badExamples = (profile?.dontExamples ?? "").split("\n").map((s) => s.trim()).filter(Boolean);

  function addExample() {
    const t = exampleDraft.trim();
    if (!t) return;
    if (exampleKind === "good") {
      if (!goodExamples.includes(t)) patch({ doExamples: [...goodExamples, t].join("\n") });
    } else {
      if (!badExamples.includes(t)) patch({ dontExamples: [...badExamples, t].join("\n") });
    }
    setExampleDraft("");
  }
  function removeGoodExample(t: string) {
    patch({ doExamples: goodExamples.filter((x) => x !== t).join("\n") });
  }
  function removeBadExample(t: string) {
    patch({ dontExamples: badExamples.filter((x) => x !== t).join("\n") });
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h1 className="text-sm font-bold leading-tight text-slate-900 dark:text-slate-100">Agent</h1>
          <p className="mt-0.5 text-[11px] text-slate-400">Shape your assistant&apos;s identity and behavior</p>
        </div>
        {dirty && (
          <button
            onClick={() => void save()}
            disabled={saving || !profile?.agentName.trim()}
            className="flex items-center gap-2 rounded-xl bg-[#4cc9f0] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Save changes
          </button>
        )}
        {!dirty && saved && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600"><Check className="h-3.5 w-3.5" /> All changes saved</span>
        )}
      </div>

      <div className="mx-auto max-w-5xl p-6">
        {loading || !profile ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Hero — live identity preview + name field, spans full width */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-[#4cc9f0]/10 via-white to-white p-5 dark:border-slate-800 dark:from-[#4cc9f0]/10 dark:via-slate-900 dark:to-slate-900 lg:col-span-2">
              <div className="flex flex-wrap items-center gap-5">
                <AiOrb size={72} className="shrink-0" />
                <div className="min-w-[220px] flex-1">
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">Name</label>
                  <input
                    value={profile.agentName}
                    onChange={(e) => patch({ agentName: e.target.value })}
                    placeholder="Aria"
                    className="w-full max-w-xs border-b-2 border-transparent bg-transparent text-xl font-black text-slate-900 outline-none transition focus:border-[#4cc9f0] dark:text-slate-100"
                  />
                  <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
                    {profile.tone.trim() || "No personality defined yet — add one below."}
                  </p>
                </div>
              </div>
            </div>

            {/* Tone */}
            <SectionCard
              icon={<MessageSquareText className="h-4 w-4 text-brand-strong" />}
              iconClass="bg-brand-strong/10"
              title="Personality & tone"
              subtitle="How it should sound"
            >
              <div className="flex flex-wrap gap-1.5">
                {TONE_PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => patch({ tone: profile.tone ? `${profile.tone.trim()}, ${p.toLowerCase()}` : p })}
                    className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 transition hover:border-[#4cc9f0]/50 hover:bg-[#4cc9f0]/5 dark:border-slate-700 dark:text-slate-300"
                  >
                    + {p}
                  </button>
                ))}
              </div>
              <textarea
                value={profile.tone}
                onChange={(e) => patch({ tone: e.target.value })}
                rows={4}
                placeholder="e.g. Warm but efficient. Gets to the point, never over-explains."
                className={areaCls}
              />
            </SectionCard>

            {/* Guidelines — good and bad examples in one card, distinctly grouped */}
            <SectionCard
              icon={<ThumbsUp className="h-4 w-4 text-emerald-500" />}
              iconClass="bg-emerald-50 dark:bg-emerald-950/40"
              title="Guidelines"
              subtitle="Examples that teach it your judgement"
            >
              <div className="flex gap-2">
                <div className="flex shrink-0 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setExampleKind("good")}
                    aria-label="Good example"
                    className={`flex items-center gap-1 px-2.5 text-xs font-medium transition ${
                      exampleKind === "good" ? "bg-emerald-500 text-white" : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
                    }`}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setExampleKind("bad")}
                    aria-label="Bad example"
                    className={`flex items-center gap-1 px-2.5 text-xs font-medium transition ${
                      exampleKind === "bad" ? "bg-red-500 text-white" : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
                    }`}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <input
                  value={exampleDraft}
                  onChange={(e) => setExampleDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExample(); } }}
                  placeholder={exampleKind === "good" ? 'e.g. "Thanks — I\'ll review and get back to you by Friday."' : "e.g. Over-promising, using emojis"}
                  className={inputCls}
                />
                <button
                  onClick={addExample}
                  disabled={!exampleDraft.trim()}
                  aria-label="Add example"
                  className="flex shrink-0 items-center justify-center rounded-xl bg-[#4cc9f0] px-4 text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>

              {goodExamples.length > 0 && (
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-600"><ThumbsUp className="h-3.5 w-3.5" /> Good — do this</p>
                  <div className="flex flex-wrap gap-2">
                    {goodExamples.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 py-1.5 pl-3 pr-2 text-[13px] text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                        {t}
                        <button onClick={() => removeGoodExample(t)} aria-label="Remove" className="flex h-5 w-5 items-center justify-center rounded-full text-emerald-500 transition hover:bg-red-50 hover:text-red-500">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {goodExamples.length > 0 && badExamples.length > 0 && <div className="h-px bg-slate-100 dark:bg-slate-800" />}

              {badExamples.length > 0 && (
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-red-500"><ThumbsDown className="h-3.5 w-3.5" /> Bad — never do this</p>
                  <div className="flex flex-wrap gap-2">
                    {badExamples.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 py-1.5 pl-3 pr-2 text-[13px] text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                        {t}
                        <button onClick={() => removeBadExample(t)} aria-label="Remove" className="flex h-5 w-5 items-center justify-center rounded-full text-red-500 transition hover:bg-red-100">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </SectionCard>

            {/* Scenarios — spans full width */}
            <div className="lg:col-span-2">
              <SectionCard
                icon={<SlidersHorizontal className="h-4 w-4" style={{ color: "#4361ee" }} />}
                iconClass="bg-[#4361ee]/10"
                title="Scenarios"
                subtitle="Specific situations and how to handle them"
              >
                <div className="flex gap-2">
                  <input
                    value={scenarioDraft}
                    onChange={(e) => setScenarioDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addScenario(scenarioDraft); } }}
                    placeholder="Describe a scenario…"
                    className={inputCls}
                  />
                  <button
                    onClick={() => addScenario(scenarioDraft)}
                    disabled={!scenarioDraft.trim()}
                    aria-label="Add scenario"
                    className="flex shrink-0 items-center justify-center rounded-xl bg-[#4cc9f0] px-4 text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>

                {scenarios.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {scenarios.map((t, i) => (
                      <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-[#4cc9f0]/30 bg-[#4cc9f0]/5 py-1.5 pl-1 pr-2 text-[13px] text-slate-700 dark:text-slate-200">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#4cc9f0]/15 text-[10px] font-bold text-[#4cc9f0]">
                          {scenarioLabel(i)}
                        </span>
                        {t}
                        <button onClick={() => removeScenario(t)} aria-label="Remove" className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-500">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {remainingSuggestions.length > 0 && (
                  <div>
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">Suggestions</p>
                    <div className="flex flex-wrap gap-2">
                      {remainingSuggestions.map((s) => (
                        <button key={s} onClick={() => addScenario(s)}
                          className="rounded-full border border-slate-200 px-3 py-1.5 text-[13px] text-slate-500 transition hover:border-[#4cc9f0]/40 hover:bg-[#4cc9f0]/5 dark:border-slate-700 dark:text-slate-300">
                          + {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </SectionCard>
            </div>

            {/* Danger zone — spans full width */}
            <div className="overflow-hidden rounded-2xl border border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/10 lg:col-span-2">
              <div className="flex items-start gap-3 px-5 py-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-500 dark:bg-red-950/40">
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-red-700 dark:text-red-300">Delete this agent</h3>
                  <p className="mt-1 text-xs leading-relaxed text-red-600/80 dark:text-red-400/80">
                    Permanently deletes {profile.agentName || "your assistant"} — emails, WhatsApp, chat history,
                    rules, reminders, and knowledge bases. Your Flugia login is unaffected.
                  </p>
                </div>
              </div>
              <div className="flex justify-end border-t border-red-100 px-5 py-3 dark:border-red-900/40">
                <button
                  onClick={() => setConfirmDelete(true)}
                  disabled={deleting}
                  className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-red-600 disabled:opacity-60"
                >
                  {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Delete agent
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this agent?"
        message={
          <>
            Permanently deletes {profile?.agentName || "your assistant"} — emails, WhatsApp, chat history, rules,
            reminders, and knowledge bases. Your Flugia login is unaffected.
          </>
        }
        confirmLabel="Delete agent"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
