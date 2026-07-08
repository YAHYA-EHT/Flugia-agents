"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles, ArrowRight, ArrowLeft, Check, Loader2, ThumbsUp, ThumbsDown,
  MessageSquareText, SlidersHorizontal, AtSign, BookOpen, Plus, Trash2,
  X, Upload, Globe, Link2, FileText, Ban, MailOpen, Archive, BellOff,
} from "lucide-react";
import { getApi } from "@/lib/aria";
import { useSettingsStore } from "@/lib/aria/state/settingsStore";
import { Select } from "./Select";
import { AiOrb } from "./AiOrb";
import {
  ACTION_TYPES, autonomyDisplayName, EMAIL_RULE_ACTIONS, emailRuleActionLabel,
  type AutonomyLevel, type EmailRuleAction,
} from "@/lib/aria/types";

/**
 * Mandatory onboarding. The user cannot reach any feature tab until this is
 * completed. It builds the agent's persona (→ system prompt), connects Google,
 * and sets up autonomy, rules (optional) and a knowledge base (optional).
 * Step + entered data are persisted so the Google redirect can resume mid-flow.
 */

const STEP_KEY = "aria_setup_step";
const DATA_KEY = "aria_setup_data";

type StepId =
  | "welcome" | "name" | "tone" | "examples" | "scenarios"
  | "google" | "autonomy" | "rules" | "kb" | "finish";

const FLOW: StepId[] = [
  "welcome", "name", "tone", "examples", "scenarios",
  "google", "autonomy", "rules", "kb", "finish",
];

// Steps counted in the progress bar (skip the intro/outro chrome)
const PROGRESS_STEPS: StepId[] = FLOW.filter((s) => s !== "welcome" && s !== "finish");

interface SetupData {
  agentName: string;
  tone: string;
  doExamples: string;
  dontExamples: string;
  scenarios: string;
}

const EMPTY: SetupData = { agentName: "Aria", tone: "", doExamples: "", dontExamples: "", scenarios: "" };

const TONE_PRESETS = ["Warm & friendly", "Concise & direct", "Formal & professional", "Playful", "Empathetic"];

function loadStep(): number {
  try { return Math.max(0, Number(localStorage.getItem(STEP_KEY)) || 0); } catch { return 0; }
}
function loadData(): SetupData {
  try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(DATA_KEY) || "{}") }; } catch { return { ...EMPTY }; }
}

export function SetupWizard({ onDone }: { onDone: () => void }) {
  const [stepIdx, setStepIdx] = useState<number>(loadStep);
  const [data, setData] = useState<SetupData>(loadData);
  const [busy, setBusy] = useState(false);

  const step = FLOW[stepIdx];

  useEffect(() => { try { localStorage.setItem(STEP_KEY, String(stepIdx)); } catch { /* */ } }, [stepIdx]);
  useEffect(() => { try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); } catch { /* */ } }, [data]);

  const set = (patch: Partial<SetupData>) => setData((d) => ({ ...d, ...patch }));
  const next = () => setStepIdx((i) => Math.min(FLOW.length - 1, i + 1));
  const back = () => setStepIdx((i) => Math.max(0, i - 1));

  async function finish() {
    setBusy(true);
    try {
      await getApi().saveAgentProfile({ ...data, setupCompleted: true });
      try { localStorage.removeItem(STEP_KEY); localStorage.removeItem(DATA_KEY); } catch { /* */ }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  const progressIdx = PROGRESS_STEPS.indexOf(step);

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-y-auto bg-slate-50 px-6 py-8 dark:bg-slate-950">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-10 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        {progressIdx >= 0 && (
          <div className="mb-7">
            <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-slate-400">
              <span>Set up your assistant</span>
              <span>{progressIdx + 1} / {PROGRESS_STEPS.length}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-[#4cc9f0] transition-all duration-300"
                style={{ width: `${((progressIdx + 1) / PROGRESS_STEPS.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {step === "welcome" && <Welcome onNext={next} />}
        {step === "name" && <NameStep value={data.agentName} onChange={(v) => set({ agentName: v })} onNext={next} onBack={back} />}
        {step === "tone" && <ToneStep value={data.tone} onChange={(v) => set({ tone: v })} onNext={next} onBack={back} />}
        {step === "examples" && (
          <ExamplesStep
            doVal={data.doExamples} dontVal={data.dontExamples}
            onDo={(v) => set({ doExamples: v })} onDont={(v) => set({ dontExamples: v })}
            onNext={next} onBack={back}
          />
        )}
        {step === "scenarios" && <ScenariosStep value={data.scenarios} onChange={(v) => set({ scenarios: v })} onNext={next} onBack={back} />}
        {step === "google" && <GoogleStep agentName={data.agentName} onNext={next} onBack={back} />}
        {step === "autonomy" && <AutonomyStep onNext={next} onBack={back} />}
        {step === "rules" && <RulesStep onNext={next} onBack={back} />}
        {step === "kb" && <KbStep onNext={next} onBack={back} />}
        {step === "finish" && <FinishStep data={data} busy={busy} onFinish={finish} onBack={back} />}
      </div>
    </div>
  );
}

// ── shared chrome ─────────────────────────────────────────────────────────────
function Nav({ onBack, onNext, nextLabel = "Continue", nextDisabled, onSkip }: {
  onBack?: () => void; onNext: () => void; nextLabel?: string; nextDisabled?: boolean; onSkip?: () => void;
}) {
  return (
    <div className="mt-7 flex items-center justify-between">
      {onBack ? (
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-slate-600">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      ) : <span />}
      <div className="flex items-center gap-3">
        {onSkip && (
          <button onClick={onSkip} className="text-sm text-slate-400 transition hover:text-slate-600">Skip</button>
        )}
        <button
          onClick={onNext}
          disabled={nextDisabled}
          className="flex items-center gap-1.5 rounded-xl bg-[#4cc9f0] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          {nextLabel} <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Head({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4cc9f0]/10 text-[#4cc9f0]">{icon}</div>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{title}</h2>
      <p className="mt-1.5 text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">{subtitle}</p>
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-slate-200 px-4 py-3 text-[15px] outline-none focus:ring-2 focus:ring-[#4cc9f0] dark:border-slate-700 dark:bg-slate-800";
const areaCls = inputCls + " resize-none leading-relaxed";

// ── steps ─────────────────────────────────────────────────────────────────────
function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#4cc9f0] text-white shadow-lg">
        <Sparkles className="h-8 w-8" />
      </div>
      <h2 className="mt-6 text-2xl font-black text-slate-900 dark:text-slate-100">Let&apos;s build your assistant</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        A few quick steps to personalize your AI executive assistant — its name, voice, how it
        should handle your work — then connect Google and set your rules. This is required before
        you can start.
      </p>
      <button
        onClick={onNext}
        className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#4cc9f0] px-6 py-3 text-sm font-medium text-white shadow-lg transition hover:opacity-90"
      >
        Get started <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function NameStep({ value, onChange, onNext, onBack }: { value: string; onChange: (v: string) => void; onNext: () => void; onBack: () => void }) {
  return (
    <div>
      <Head icon={<Sparkles className="h-6 w-6" />} title="Name your assistant" subtitle="What would you like to call your assistant? You can always change it later." />
      <input autoFocus value={value} onChange={(e) => onChange(e.target.value)} placeholder="Aria" className={inputCls}
        onKeyDown={(e) => { if (e.key === "Enter" && value.trim()) onNext(); }} />
      <Nav onBack={onBack} onNext={onNext} nextDisabled={!value.trim()} />
    </div>
  );
}

function ToneStep({ value, onChange, onNext, onBack }: { value: string; onChange: (v: string) => void; onNext: () => void; onBack: () => void }) {
  return (
    <div>
      <Head icon={<MessageSquareText className="h-6 w-6" />} title="Personality & tone" subtitle="How should your assistant sound? Pick a starting point or describe it in your own words." />
      <div className="mb-3 flex flex-wrap gap-2">
        {TONE_PRESETS.map((p) => (
          <button key={p} onClick={() => onChange(value ? `${value.trim()}, ${p.toLowerCase()}` : p)}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:border-[#4cc9f0]/50 hover:bg-[#4cc9f0]/5 dark:border-slate-700 dark:text-slate-300">
            + {p}
          </button>
        ))}
      </div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4}
        placeholder="e.g. Warm but efficient. Gets to the point, never over-explains, and mirrors my writing style in email replies."
        className={areaCls} />
      <Nav onBack={onBack} onNext={onNext} />
    </div>
  );
}

function ExamplesStep({ doVal, dontVal, onDo, onDont, onNext, onBack }: {
  doVal: string; dontVal: string; onDo: (v: string) => void; onDont: (v: string) => void; onNext: () => void; onBack: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState<"good" | "bad">("good");

  const goodItems = doVal.split("\n").map((s) => s.trim()).filter(Boolean);
  const badItems = dontVal.split("\n").map((s) => s.trim()).filter(Boolean);

  function add() {
    const t = draft.trim();
    if (!t) return;
    if (kind === "good") {
      if (!goodItems.includes(t)) onDo([...goodItems, t].join("\n"));
    } else {
      if (!badItems.includes(t)) onDont([...badItems, t].join("\n"));
    }
    setDraft("");
  }
  const removeGood = (t: string) => onDo(goodItems.filter((x) => x !== t).join("\n"));
  const removeBad = (t: string) => onDont(badItems.filter((x) => x !== t).join("\n"));

  return (
    <div>
      <Head icon={<ThumbsUp className="h-6 w-6" />} title="Acceptable & unacceptable replies" subtitle="Give examples so your assistant learns your judgement. This strongly shapes its output." />

      <div className="flex gap-2">
        <div className="flex shrink-0 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setKind("good")}
            aria-label="Good example"
            className={`flex items-center px-3 transition ${kind === "good" ? "bg-emerald-500 text-white" : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"}`}
          >
            <ThumbsUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setKind("bad")}
            aria-label="Bad example"
            className={`flex items-center px-3 transition ${kind === "bad" ? "bg-red-500 text-white" : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"}`}
          >
            <ThumbsDown className="h-4 w-4" />
          </button>
        </div>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={kind === "good" ? 'e.g. "Thanks — I\'ll review and get back to you by Friday."' : "e.g. Over-promising, using emojis"}
          className={inputCls}
        />
        <button
          onClick={add}
          disabled={!draft.trim()}
          aria-label="Add example"
          className="flex shrink-0 items-center justify-center rounded-xl bg-[#4cc9f0] px-4 text-white transition hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {goodItems.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-600"><ThumbsUp className="h-3.5 w-3.5" /> Good — do this</p>
          <div className="flex flex-wrap gap-2">
            {goodItems.map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 py-1.5 pl-3 pr-2 text-[13px] text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                {t}
                <button onClick={() => removeGood(t)} aria-label="Remove" className="flex h-5 w-5 items-center justify-center rounded-full text-emerald-500 transition hover:bg-red-50 hover:text-red-500">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {goodItems.length > 0 && badItems.length > 0 && <div className="my-4 h-px bg-slate-100 dark:bg-slate-800" />}

      {badItems.length > 0 && (
        <div className={goodItems.length > 0 ? "" : "mt-4"}>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-red-500"><ThumbsDown className="h-3.5 w-3.5" /> Bad — never do this</p>
          <div className="flex flex-wrap gap-2">
            {badItems.map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 py-1.5 pl-3 pr-2 text-[13px] text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                {t}
                <button onClick={() => removeBad(t)} aria-label="Remove" className="flex h-5 w-5 items-center justify-center rounded-full text-red-500 transition hover:bg-red-100">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <Nav onBack={onBack} onNext={onNext} />
    </div>
  );
}

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

function ScenariosStep({ value, onChange, onNext, onBack }: { value: string; onChange: (v: string) => void; onNext: () => void; onBack: () => void }) {
  // Scenarios are stored as one string, one scenario per line — rendered as chips.
  const items = value.split("\n").map((s) => s.trim()).filter(Boolean);
  const [draft, setDraft] = useState("");

  const commit = (list: string[]) => onChange(list.join("\n"));
  const add = (text: string) => {
    const t = text.trim();
    if (!t || items.includes(t)) return;
    commit([...items, t]);
    setDraft("");
  };
  const remove = (t: string) => commit(items.filter((x) => x !== t));

  const remaining = SCENARIO_SUGGESTIONS.filter((s) => !items.includes(s));

  return (
    <div>
      <Head icon={<SlidersHorizontal className="h-6 w-6" />} title="Scenarios" subtitle="Add specific situations and how your assistant should handle them. Add as many as you like." />

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(draft); } }}
          placeholder="Describe a scenario…"
          className={inputCls}
        />
        <button
          onClick={() => add(draft)}
          disabled={!draft.trim()}
          aria-label="Add scenario"
          className="flex shrink-0 items-center justify-center rounded-xl bg-[#4cc9f0] px-4 text-white transition hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {items.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {items.map((t, i) => (
            <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-[#4cc9f0]/30 bg-[#4cc9f0]/5 py-1.5 pl-1 pr-2 text-[13px] text-slate-700 dark:text-slate-200">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#4cc9f0]/15 text-[10px] font-bold text-[#4cc9f0]">
                {scenarioLabel(i)}
              </span>
              {t}
              <button onClick={() => remove(t)} aria-label="Remove" className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-500">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {remaining.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">Suggestions</p>
          <div className="flex flex-wrap gap-2">
            {remaining.map((s) => (
              <button key={s} onClick={() => add(s)}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-[13px] text-slate-500 transition hover:border-[#4cc9f0]/40 hover:bg-[#4cc9f0]/5 dark:border-slate-700 dark:text-slate-300">
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <Nav onBack={onBack} onNext={onNext} />
    </div>
  );
}

function GoogleStep({ agentName, onNext, onBack }: { agentName: string; onNext: () => void; onBack: () => void }) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    getApi().getUserStatus().then((s) => setConnected(s.gmailConnected)).catch(() => setConnected(false));
  }, []);

  async function connect() {
    setConnecting(true);
    try {
      const { redirectUrl } = await getApi().connectGmailFeature(window.location.href);
      window.location.href = redirectUrl;
    } catch { setConnecting(false); }
  }

  return (
    <div>
      <Head
        icon={<Image src="/gmail-logo.webp" alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" />}
        title="Connect Google"
        subtitle={`${agentName || "Your assistant"} needs access to your inbox and calendar to work. This connects once and stays linked.`}
      />
      {connected ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/30">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-4 w-4" /></span>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Google account connected</p>
        </div>
      ) : (
        <button onClick={connect} disabled={connecting || connected === null}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#4cc9f0] px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-60">
          {connecting || connected === null ? <Loader2 className="h-[18px] w-[18px] animate-spin" />
            : <Image src="/google-white-icon.webp" alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" />}
          Continue with Google
        </button>
      )}
      <Nav onBack={onBack} onNext={onNext} nextLabel="Continue" nextDisabled={!connected} />
    </div>
  );
}

function AutonomyStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const store = useSettingsStore();
  useEffect(() => { void store.loadAll(); /* eslint-disable-next-line */ }, []);
  const levels: AutonomyLevel[] = ["auto", "ask", "never"];
  const levelFor = (t: string) => store.autonomy.find((a) => a.actionType === t)?.level ?? "ask";

  return (
    <div>
      <Head icon={<SlidersHorizontal className="h-6 w-6" />} title="Autonomy" subtitle="Decide what your assistant can do on its own, ask about first, or never do." />
      <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
        {ACTION_TYPES.map((t) => (
          <div key={t} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800">
            <span className="text-[13px] text-slate-700 dark:text-slate-200">{autonomyDisplayName(t)}</span>
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
              {levels.map((lvl) => (
                <button key={lvl} onClick={() => store.setAutonomy(t, lvl)}
                  className={`px-2.5 py-1 text-xs capitalize transition ${levelFor(t) === lvl ? "bg-[#4cc9f0] text-white" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
                  {lvl}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Nav onBack={onBack} onNext={onNext} />
    </div>
  );
}

function emailRuleActionIcon(action: EmailRuleAction) {
  switch (action) {
    case "block": return <Ban className="h-3.5 w-3.5" />;
    case "mark_read": return <MailOpen className="h-3.5 w-3.5" />;
    case "archive": return <Archive className="h-3.5 w-3.5" />;
    case "notify_never": return <BellOff className="h-3.5 w-3.5" />;
  }
}

function RulesStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const store = useSettingsStore();
  const [pattern, setPattern] = useState("");
  const [action, setAction] = useState<EmailRuleAction>(EMAIL_RULE_ACTIONS[0]);
  useEffect(() => { void store.loadAll(); /* eslint-disable-next-line */ }, []);

  return (
    <div>
      <Head icon={<AtSign className="h-6 w-6" />} title="Email rules" subtitle="Optional — auto-handle senders before your assistant acts. You can add these anytime." />
      <div className="flex gap-2">
        <input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="name@example.com or @domain.com" className={inputCls} />
        <Select
          value={action}
          onChange={setAction}
          options={EMAIL_RULE_ACTIONS.map((a) => ({ value: a, label: emailRuleActionLabel(a), icon: emailRuleActionIcon(a) }))}
          className={inputCls + " w-auto"}
        />
        <button onClick={() => { if (pattern.trim()) { void store.addEmailRule({ senderPattern: pattern.trim(), action, notify: false }); setPattern(""); } }}
          className="flex shrink-0 items-center justify-center rounded-xl bg-[#4cc9f0] px-3 text-white transition hover:opacity-90"><Plus className="h-4 w-4" /></button>
      </div>
      {store.rules.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {store.rules.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-[13px] dark:border-slate-800">
              <AtSign className="h-3.5 w-3.5 text-slate-400" />
              <span className="min-w-0 flex-1 truncate">{r.senderPattern}</span>
              <span className="text-xs text-slate-400">{emailRuleActionLabel(r.action)}</span>
              <button onClick={() => store.deleteEmailRule(r.id)} className="text-slate-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
      <Nav onBack={onBack} onNext={onNext} onSkip={onNext} nextLabel="Continue" />
    </div>
  );
}

type KbTab = "file" | "url" | "scrape";

function KbStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [kbId, setKbId] = useState<string | null>(null);

  const [tab, setTab] = useState<KbTab>("file");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [docs, setDocs] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // The KB row is created silently on first content, with a placeholder name —
  // naming is only asked for afterward, so it never blocks adding files/a site first.
  async function ensureKb(placeholder: string): Promise<string> {
    if (kbId) return kbId;
    const kb = await getApi().createKnowledgeBase(placeholder, "");
    setKbId(kb.id);
    setName(placeholder);
    return kb.id;
  }

  function saveMeta() {
    if (!kbId || !name.trim()) return;
    void getApi().updateKnowledgeBase(kbId, { name: name.trim(), description: desc.trim() });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setNote(null);
    try {
      const id = await ensureKb(file.name.replace(/\.[^.]+$/, "") || "New knowledge base");
      const doc = await getApi().uploadDocument(id, file);
      setDocs((d) => [...d, doc.name || file.name]);
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function guessName(): string {
    try { return new URL(url.trim()).hostname.replace(/^www\./, ""); } catch { return "New knowledge base"; }
  }

  async function addUrl() {
    if (!url.trim()) return;
    setBusy(true); setNote(null);
    try {
      const id = await ensureKb(guessName());
      const doc = await getApi().ingestUrl(id, url.trim());
      setDocs((d) => [...d, doc.name || url.trim()]);
      setUrl("");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Couldn't fetch that URL");
    } finally { setBusy(false); }
  }

  async function scrape() {
    if (!url.trim()) return;
    setBusy(true); setNote(null);
    try {
      const id = await ensureKb(guessName());
      const res = await getApi().scrapeWebsite(id, url.trim());
      setNote(`${res.message} (${res.pagesQueued} page${res.pagesQueued !== 1 ? "s" : ""} queued)`);
      setUrl("");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Scrape failed");
    } finally { setBusy(false); }
  }

  const tabs: { id: KbTab; label: string; icon: React.ReactNode }[] = [
    { id: "file", label: "Upload", icon: <Upload className="h-4 w-4" /> },
    { id: "url", label: "URL", icon: <Link2 className="h-4 w-4" /> },
    { id: "scrape", label: "Scrape site", icon: <Globe className="h-4 w-4" /> },
  ];

  return (
    <div>
      <Head icon={<BookOpen className="h-6 w-6" />} title="Knowledge base" subtitle="Optional — add files, links, or scrape a site for your assistant to reference. Name it once you're done." />

      <div className="mb-3 inline-flex rounded-xl border border-slate-200 p-1 dark:border-slate-700">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); setNote(null); }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${tab === t.id ? "bg-[#4cc9f0] text-white" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === "file" && (
        <div>
          <input ref={fileRef} type="file" onChange={onFile} className="hidden"
            accept=".pdf,.doc,.docx,.txt,.md,.csv,.xlsx" />
          <button onClick={() => fileRef.current?.click()} disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-6 text-sm font-medium text-slate-500 transition hover:border-[#4cc9f0]/40 hover:bg-[#4cc9f0]/5 disabled:opacity-50 dark:border-slate-700">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
            Choose a file (PDF, DOCX, TXT, CSV…)
          </button>
        </div>
      )}

      {(tab === "url" || tab === "scrape") && (
        <div className="flex gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className={inputCls}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); tab === "url" ? addUrl() : scrape(); } }} />
          <button onClick={tab === "url" ? addUrl : scrape} disabled={busy || !url.trim()}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-[#4cc9f0] px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : tab === "url" ? <Plus className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
            {tab === "url" ? "Add" : "Scrape"}
          </button>
        </div>
      )}

      {note && <p className="mt-2 text-[12px] text-slate-500">{note}</p>}

      {docs.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {docs.map((d, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-[13px] dark:border-slate-800">
              <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{d}</span>
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            </div>
          ))}
        </div>
      )}

      {kbId && (
        <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <label className="block text-xs font-medium uppercase tracking-wider text-slate-400">Name this knowledge base</label>
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveMeta}
            placeholder="Knowledge base name" className={inputCls} />
          <input value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={saveMeta}
            placeholder="Short description (optional)" className={inputCls} />
        </div>
      )}

      <Nav onBack={onBack} onNext={onNext} onSkip={onNext} nextLabel="Continue" nextDisabled={docs.length > 0 && !name.trim()} />
    </div>
  );
}

function FinishStep({ data, busy, onFinish, onBack }: { data: SetupData; busy: boolean; onFinish: () => void; onBack: () => void }) {
  const summary = useMemo(() => ([
    { label: "Name", value: data.agentName || "Aria" },
    { label: "Tone", value: data.tone || "Default" },
    { label: "Guidelines", value: (data.doExamples || data.dontExamples) ? "Provided" : "None" },
    { label: "Scenarios", value: data.scenarios ? "Provided" : "None" },
  ]), [data]);

  return (
    <div className="text-center">
      <div className="mx-auto"><AiOrb size={96} /></div>
      <h2 className="mt-6 text-2xl font-black text-slate-900 dark:text-slate-100">{data.agentName || "Aria"} is ready</h2>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Review and finish — this unlocks your assistant.</p>
      <div className="mt-5 space-y-1.5 rounded-xl border border-slate-100 p-4 text-left dark:border-slate-800">
        {summary.map((s) => (
          <div key={s.label} className="flex items-center justify-between text-sm">
            <span className="text-slate-400">{s.label}</span>
            <span className="font-medium text-slate-700 dark:text-slate-200">{s.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600"><ArrowLeft className="h-4 w-4" /> Back</button>
        <button onClick={onFinish} disabled={busy}
          className="flex items-center gap-2 rounded-xl bg-[#4cc9f0] px-6 py-3 text-sm font-medium text-white shadow-lg transition hover:opacity-90 disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Finish & start
        </button>
      </div>
    </div>
  );
}
