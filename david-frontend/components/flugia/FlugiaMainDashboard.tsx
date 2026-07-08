"use client";

import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { useAuthStore } from "@/lib/aria/state/authStore";
import { useChatStore } from "@/lib/aria/state/chatStore";

function greeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

interface Dept {
  id: string;
  name: string;
  agent: string;
  agentTitle: string;
  iconBg: string;
  avatarBg: string;
  imageSrc?: string;
  avatarInitial: string;
  avatarColor: string;
  icon: string;
  isOrchestrator?: boolean;
}

const BLUE    = "#4cc9f0";
const BLUE_BG = "#daf3fb";
const RED     = "#ef4444";
const RED_BG  = "#fee2e2";

const DEPTS: Dept[] = [
  {
    id: "global", name: "AI GLOBAL", agent: "Roger", agentTitle: "Global Director",
    iconBg: RED, avatarBg: RED_BG, avatarInitial: "R", avatarColor: RED,
    imageSrc: "/global.webp", isOrchestrator: true,
    icon: "M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z M2 12h20 M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
  },
  {
    id: "marketing", name: "AI MARKETING", agent: "David", agentTitle: "AI Marketing Manager",
    iconBg: BLUE, avatarBg: BLUE_BG, avatarInitial: "D", avatarColor: BLUE,
    imageSrc: "/marketing.webp",
    icon: "M22 7 13.5 15.5 8.5 10.5 2 17 M16 7h6v6",
  },
  {
    id: "sales", name: "AI SALES", agent: "John", agentTitle: "AI Sales Manager",
    iconBg: BLUE, avatarBg: BLUE_BG, avatarInitial: "J", avatarColor: BLUE,
    imageSrc: "/sales.webp",
    icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  },
  {
    id: "support", name: "AI SUPPORT", agent: "Emily", agentTitle: "AI Support Manager",
    iconBg: BLUE, avatarBg: BLUE_BG, avatarInitial: "E", avatarColor: BLUE,
    imageSrc: "/emily.webp",  // ← mets ta photo ici
    icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  },
  {
    id: "bureau", name: "AI BUREAU", agent: "Aria", agentTitle: "AI Executive Manager",
    iconBg: BLUE, avatarBg: BLUE_BG, avatarInitial: "A", avatarColor: BLUE,
    imageSrc: "/Aria.webp",
    icon: "M3 18v-6a9 9 0 0 1 18 0v6 M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z",
  },
  {
    id: "hr", name: "AI HR", agent: "Lucy", agentTitle: "HR Director",
    iconBg: BLUE, avatarBg: BLUE_BG, avatarInitial: "L", avatarColor: BLUE,
    imageSrc: "/hr.webp",
    icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  },
  {
    id: "legal", name: "AI LEGAL", agent: "Camille", agentTitle: "Legal Manager",
    iconBg: BLUE, avatarBg: BLUE_BG, avatarInitial: "C", avatarColor: BLUE,
    imageSrc: "/legal.webp",
    icon: "M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5",
  },
  {
    id: "technology", name: "AI TECHNOLOGY", agent: "Alex", agentTitle: "Technology Manager",
    iconBg: BLUE, avatarBg: BLUE_BG, avatarInitial: "A", avatarColor: BLUE,
    imageSrc: "/technology.webp",
    icon: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M4.93 4.93l14.14 14.14",
  },
  {
    id: "product", name: "AI PRODUCT", agent: "Frans", agentTitle: "Product Manager",
    iconBg: BLUE, avatarBg: BLUE_BG, avatarInitial: "F", avatarColor: BLUE,
    imageSrc: "/product.webp",
    icon: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
  },
  {
    id: "strategy", name: "AI STRATEGY", agent: "Lucas", agentTitle: "Chief of Strategy",
    iconBg: BLUE, avatarBg: BLUE_BG, avatarInitial: "L", avatarColor: BLUE,
    imageSrc: "/strategy.webp",
    icon: "M18 20V10 M12 20V4 M6 20v-6",
  },
];

export function FlugiaMainDashboard({ onEnterDept }: { onEnterDept: (deptId?: string) => void }) {
  const user = useAuthStore((s) => s.user);
  const pendingAction = useChatStore((s) => s.pendingAction);
  const userName = user?.displayName ?? "there";
  const actionCount = pendingAction ? 1 : 0;

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="px-6 lg:px-10 py-6">
        <div className="mb-6 border-b border-slate-200 pb-4">
          <h2 className="text-2xl font-black tracking-tight text-slate-900">
            {greeting()}, {userName} 👋
          </h2>
          <p className="mt-0.5 text-sm text-slate-400">{DEPTS.length} AI departments active</p>
        </div>
        <div className="mb-6 flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          <h1 className="text-xs font-bold uppercase tracking-widest text-slate-500">AI Departments</h1>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DEPTS.map((dept, i) => (
            <DeptCard key={dept.id} dept={dept} actionCount={dept.id === "bureau" ? actionCount : 0} onClick={() => onEnterDept(dept.id)} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DeptCard({ dept, actionCount, onClick, index }: { dept: Dept; actionCount: number; onClick?: () => void; index: number }) {
  const isOrchestrator = !!dept.isOrchestrator;
  const accent = isOrchestrator ? RED : BLUE;
  const cardBg = isOrchestrator ? "#ef444410" : "#4cc9f010";

  return (
    <div
      onClick={onClick}
      tabIndex={0}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      className="animate-bubble-up relative select-none overflow-hidden rounded-2xl border border-slate-200 h-[160px] sm:h-[200px] lg:h-[220px] transition-all duration-200 cursor-pointer hover:shadow-md hover:-translate-y-0.5"
      style={{ backgroundColor: cardBg, animationDelay: `${index * 55}ms` }}
    >
      {/* Top */}
      <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-4 pt-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: dept.iconBg }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              {dept.icon.split(" M").map((seg, i) => <path key={i} d={i === 0 ? seg : `M${seg}`} />)}
            </svg>
          </span>
          <span className="text-[14px] font-bold uppercase tracking-wide sm:text-[11px] lg:text-sm">
            {dept.name} <span className="font-semibold text-slate-400">TEAM</span>
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 py-1 text-[10px] font-bold shadow-sm sm:text-[11px]" style={{ color: accent }}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
          {isOrchestrator ? "Orchestrator" : `${actionCount} actions`}
        </span>
      </div>

      {/* Avatar */}
      <div className="absolute bottom-[-30%] left-6 sm:left-4 lg:left-12" style={{ width: "clamp(120px,22vw,190px)", height: "clamp(120px,22vw,190px)" }}>
        <div className="absolute inset-0 rounded-full" style={{ background: dept.avatarBg }} />
        <div className="absolute bottom-[30%] z-10" style={{ width: "clamp(130px,23vw,200px)", height: "clamp(120px,22vw,190px)", left: "50%", transform: "translateX(-50%)" }}>
          <Image src={dept.imageSrc ?? ""} alt={dept.agent} fill className="object-contain object-bottom" onError={() => {}} />
        </div>
      </div>

      {/* Bottom-right */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-1">
        <p className="text-[17px] font-black leading-tight text-slate-900 sm:text-[13px] lg:text-[15px]">{dept.agent}</p>
        <p className="mb-1 text-[12px] text-slate-400 sm:text-[9px] lg:text-xs">{dept.agentTitle}</p>
        <div className="flex items-center gap-2">
          {!isOrchestrator && (
            <div className="flex flex-col items-end">
              <span className="text-xl font-black leading-none lg:text-[28px]" style={{ color: accent }}>{actionCount}</span>
              <span className="text-[10px] leading-tight text-slate-400">Unread actions</span>
            </div>
          )}
          <button onClick={(e) => e.stopPropagation()} className="flex h-9 w-9 items-center justify-center rounded-xl text-white transition hover:opacity-90" style={{ background: accent }} aria-label="Open">
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}