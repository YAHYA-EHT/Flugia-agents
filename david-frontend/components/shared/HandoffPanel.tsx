"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, X } from "lucide-react";

interface Agent {
  key: string;
  name: string;
  initial: string;
  role: string;
  dept: string;
  desc: string;
  color: string;
  path: string;
  tools: string[];
}

const AGENTS: Record<string, Agent> = {
  john: {
    key: "john", name: "John", initial: "J",
    role: "AI Sales Manager", dept: "Département Sales",
    desc: "John gère la prospection, les campagnes outreach et le suivi commercial.",
    color: "#4cc9f0", path: "/dashboard/sales",
    tools: ["Prospecting", "Campaigns", "Lead Management"],
  },
  emily: {
    key: "emily", name: "Emily", initial: "E",
    role: "AI Support Manager", dept: "Département Support",
    desc: "Emily supervise le Chatbot 24/7 et l'Agent Call pour le support client.",
    color: "#4cc9f0", path: "/dashboard/support",
    tools: ["Chatbot", "Agent Call", "Transcriptions"],
  },
  david: {
    key: "david", name: "David", initial: "D",
    role: "AI Marketing Manager", dept: "Département Marketing",
    desc: "David gère l'E-Réputation, le SEO Content et LinkedIn.",
    color: "#4cc9f0", path: "/dashboard/marketing",
    tools: ["E-Réputation", "SEO Content", "LinkedIn"],
  },
  roger: {
    key: "roger", name: "Roger", initial: "R",
    role: "Global Director", dept: "Direction Générale",
    desc: "Roger orchestre tous les agents et coordonne la stratégie globale.",
    color: "#ef4444", path: "/dashboard/global",
    tools: ["Orchestration", "Stratégie", "Coordination"],
  },
};

// Patterns de détection dans la réponse de l'agent
const HANDOFF_PATTERNS: { agent: string; patterns: RegExp[] }[] = [
  {
    agent: "john",
    patterns: [
      /\b(john|sales|ventes|commercial|prospection|campagne|outreach)\b/i,
      /\bje.*redirige.*john\b/i,
      /\bjohn.*gère\b/i,
    ],
  },
  {
    agent: "emily",
    patterns: [
      /\b(emily|support|chatbot|agent call|appel|ticket)\b/i,
      /\bje.*redirige.*emily\b/i,
      /\bemily.*gère\b/i,
    ],
  },
  {
    agent: "david",
    patterns: [
      /\b(david|marketing|seo|réputation|linkedin)\b/i,
      /\bje.*redirige.*david\b/i,
      /\bdavid.*gère\b/i,
    ],
  },
  {
    agent: "roger",
    patterns: [
      /\b(roger|orchestrat|direction|global)\b/i,
      /\bje.*redirige.*roger\b/i,
    ],
  },
];

export function detectHandoff(text: string, currentAgent: string): string | null {
  for (const { agent, patterns } of HANDOFF_PATTERNS) {
    if (agent === currentAgent) continue; // pas de redirection vers soi-même
    if (patterns.some(p => p.test(text))) {
      return agent;
    }
  }
  return null;
}

interface HandoffPanelProps {
  targetAgent: string | null;
  onDismiss: () => void;
  currentAgentName: string;
  pendingQuestion?: string;
}

export const HANDOFF_STORAGE_KEY = "flugia_pending_handoff";

export function HandoffPanel({ targetAgent, onDismiss, currentAgentName, pendingQuestion }: HandoffPanelProps) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (targetAgent) {
      setTimeout(() => setVisible(true), 400);
    } else {
      setVisible(false);
    }
  }, [targetAgent]);

  if (!targetAgent) return null;
  const agent = AGENTS[targetAgent];
  if (!agent) return null;

  function goToAgent() {
    if (pendingQuestion) {
      sessionStorage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify({
        question: pendingQuestion, from: currentAgentName,
      }));
    }
    router.push(agent.path);
    onDismiss();
  }

  function stay() {
    setVisible(false);
    setTimeout(onDismiss, 300);
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={stay}
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      />

      {/* Card */}
      <div className={`fixed bottom-6 right-6 z-50 w-80 rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 transition-all duration-300 ${visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 pointer-events-none"}`}>
        {/* Header */}
        <div className="flex items-center justify-between rounded-t-2xl px-4 py-3" style={{ background: `${agent.color}15` }}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black text-white" style={{ background: agent.color }}>
              {agent.initial}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">{agent.name}</p>
              <p className="text-[11px] text-slate-400">{agent.role}</p>
            </div>
          </div>
          <button onClick={stay} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          <p className="text-[13px] text-slate-500">{agent.desc}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {agent.tools.map(t => (
              <span key={t} className="rounded-full px-2.5 py-0.5 text-[11px] font-medium" style={{ background: `${agent.color}15`, color: agent.color }}>
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 rounded-b-2xl border-t border-slate-100 px-4 py-3">
          <button onClick={stay}
            className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
            Rester avec {currentAgentName}
          </button>
          <button onClick={goToAgent}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ background: agent.color }}>
            Aller vers {agent.name}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}