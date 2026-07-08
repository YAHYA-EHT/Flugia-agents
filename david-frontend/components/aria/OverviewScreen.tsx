"use client";

import Image from "next/image";
import {
  ArrowLeft,
  Briefcase,
  Contact,
  CalendarClock,
  FileText,
  Lock,
  History,
  Upload,
  Mic,
  ArrowUp,
} from "lucide-react";
import { useChatStore } from "@/lib/aria/state/chatStore";
import { useAuthStore } from "@/lib/aria/state/authStore";
import type { AriaPage } from "./AriaSidebar";

const PRIMARY = "#4cc9f0";

type FeatureStatus = "active" | "locked";

interface Feature {
  name: string;
  description: string;
  icon: React.ReactNode;
  status: FeatureStatus;
}

const FEATURES: Feature[] = [
  {
    name: "Executive Assistant",
    description:
      "Runs your inbox, calendar, reminders and drafting end-to-end — under the rules and tone you set.",
    icon: <Contact className="h-5 w-5" />,
    status: "active",
  },
  {
    name: "Meetings",
    description:
      "Schedules across calendars, joins your calls, and captures minutes and action items automatically.",
    icon: <CalendarClock className="h-5 w-5" />,
    status: "locked",
  },
  {
    name: "Documents",
    description:
      "Drafts reports, briefs and memos from your notes and knowledge base, in your voice.",
    icon: <FileText className="h-5 w-5" />,
    status: "locked",
  },
];

export function OverviewScreen({
  onNavigate,
  onBack,
}: {
  onNavigate: (page: AriaPage) => void;
  onBack?: () => void;
}) {
  const pendingAction = useChatStore((s) => s.pendingAction);
  const messages = useChatStore((s) => s.messages);
  const user = useAuthStore((s) => s.user);

  const activeCount = FEATURES.filter((f) => f.status === "active").length;
  const actionsToValidate = pendingAction ? 1 : 0;

  const STATS = [
    { value: 0, label: "Unread notifications" },
    { value: messages.length, label: "Activities" },
    { value: actionsToValidate, label: "Actions required" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-6 py-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              aria-label="Back to dashboard"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition hover:bg-slate-200 dark:bg-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div>
            <h1 className="text-sm font-bold leading-tight text-slate-900 dark:text-slate-100">Bureau</h1>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {activeCount} feature active · {actionsToValidate} action{actionsToValidate !== 1 ? "s" : ""} to validate
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6 lg:flex-row lg:overflow-hidden">
        {/* Left column: hero + stats + features */}
        <div className="min-w-0 flex-1 space-y-6 lg:overflow-y-auto lg:pr-1">
        {/* Hero + stats */}
        <div className="flex w-full flex-col gap-4 xl:flex-row">
          {/* Hero */}
          <div
            className="relative flex w-full items-end overflow-hidden rounded-2xl xl:w-[62%]"
            style={{ background: "linear-gradient(135deg, #e8f9fd 0%, #d0f0fa 100%)", minHeight: 260 }}
          >
            <div className="absolute left-5 top-5 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: PRIMARY }}>
                <Briefcase className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-700">
                AI Bureau <span className="font-normal text-slate-400">TEAM</span>
              </span>
            </div>
            <div className="absolute bottom-0 right-4 flex h-full items-end">
              <Image
                src="/Aria.webp"
                alt="Aria"
                width={200}
                height={240}
                style={{ height: "100%", width: "auto" }}
                className="object-contain object-bottom"
                priority
              />
            </div>
            <div className="relative z-10 p-5">
              <p className="text-2xl font-black text-slate-900">Aria</p>
              <p className="mt-0.5 text-[12px] font-medium text-slate-500">AI Executive Manager</p>
            </div>
          </div>

          {/* Stat cards */}
          <div className="flex w-full flex-col gap-2 xl:w-[38%]">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="flex flex-1 items-center rounded-xl border bg-white px-5 py-4 dark:bg-slate-900"
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

        {/* Features */}
        <section>
          <h2 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Bureau features
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {FEATURES.map((f, i) => (
              <FeatureCard
                key={f.name}
                feature={f}
                index={i}
                onOpen={f.status === "active" ? () => onNavigate("overview") : undefined}
              />
            ))}
          </div>
        </section>
        </div>{/* /left column */}

        {/* Right: locked "coming soon" direct chat preview */}
        <ComingSoonChat name={user?.displayName?.split(" ")[0] ?? "there"} />
      </div>
    </div>
  );
}

function ComingSoonChat({ name }: { name: string }) {
  return (
    <div className="flex w-full shrink-0 flex-col lg:w-1/3">
      <div className="relative flex h-full min-h-[500px] flex-col overflow-hidden rounded-xl border-2 border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
        {/* Coming soon overlay */}
        <div
          className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 rounded-xl"
          style={{ backdropFilter: "blur(3px)", background: "rgba(248,250,252,0.85)" }}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-[1.5px] border-slate-200 bg-slate-100">
            <Lock className="h-5 w-5 text-slate-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-extrabold text-slate-900">Coming Soon</p>
            <p className="mt-1 max-w-[200px] text-[11px] text-slate-400">
              This feature is currently under development.
            </p>
          </div>
        </div>

        {/* History button */}
        <div className="shrink-0 px-4 pt-3.5">
          <button className="flex text-slate-400" aria-label="History">
            <History className="h-4 w-4" />
          </button>
        </div>

        {/* Greeting */}
        <div className="flex min-h-[380px] flex-1 flex-col items-center gap-5 overflow-y-auto p-4">
          <div
            className="flex h-[70px] w-[70px] shrink-0 items-center justify-center overflow-hidden rounded-full border-[2.5px] border-[#4cc9f0]/40"
            style={{ background: "linear-gradient(145deg,#e0f9ff,#b8eeff)", boxShadow: "0 0 0 6px rgba(76,201,240,0.1)" }}
          >
            <Image src="/Aria.webp" alt="Aria" width={70} height={70} className="h-full w-full object-cover" />
          </div>
          <div className="px-5 text-center">
            <p className="text-sm font-black leading-tight text-black">
              <span className="text-[#4cc9f0]">Hey {name}, </span>how can I help you today?
            </p>
            <p className="mt-2.5 max-w-[270px] text-[10px] leading-relaxed text-gray-500">
              I can manage your inbox, calendar, reminders and drafting — all in one place.
            </p>
          </div>
          <button className="rounded-full border border-[#4cc9f0]/25 bg-[#4cc9f0]/[0.08] px-3.5 py-1.5 text-[11px] font-semibold text-[#4cc9f0]">
            Load demo conversation ↓
          </button>
        </div>

        {/* Composer */}
        <div className="shrink-0 px-3 pb-3">
          <div
            className="flex flex-col gap-2 rounded-[10px] border-[1.5px] border-[#4cc9f0] bg-white px-3 pb-2 pt-2.5"
            style={{ boxShadow: "0 0 0 3px rgba(76,201,240,0.07)" }}
          >
            <textarea placeholder="Ask anything" rows={1} className="max-h-20 w-full resize-none bg-transparent text-sm text-slate-900 outline-none" />
            <div className="flex items-center justify-between">
              <button className="flex items-center gap-1.5 rounded-[10px] bg-slate-100 px-2.5 py-1.5 text-[13px] font-medium text-slate-500">
                <Upload className="h-3.5 w-3.5" /> Upload
              </button>
              <div className="flex items-center gap-2">
                <button className="flex items-center rounded-[10px] bg-slate-100 p-1.5 text-slate-500">
                  <Mic className="h-[18px] w-[18px]" />
                </button>
                <button className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] bg-[#4cc9f0] text-white">
                  <ArrowUp className="h-[15px] w-[15px]" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ feature, onOpen, index = 0 }: { feature: Feature; onOpen?: () => void; index?: number }) {
  const isActive = feature.status === "active";
  return (
    <div
      onClick={onOpen}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={onOpen ? (e) => e.key === "Enter" && onOpen() : undefined}
      style={{ animationDelay: `${index * 60}ms` }}
      className={`animate-bubble-up group flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-5 transition-all duration-200 dark:border-slate-800 dark:bg-slate-900 ${
        isActive ? "cursor-pointer hover:-translate-y-0.5 hover:border-[#4cc9f0]/40 hover:shadow-md" : "cursor-default opacity-70"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={
            isActive
              ? { background: "rgba(76,201,240,0.1)", color: PRIMARY }
              : { background: "#fef3c7", color: "#d97706" }
          }
        >
          {feature.icon}
        </div>
        {!isActive && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-600">
            <Lock className="h-2.5 w-2.5" /> LOCKED
          </span>
        )}
      </div>
      <div className="flex-1">
        <p className={`text-[15px] font-bold leading-tight ${isActive ? "text-slate-900 dark:text-slate-100" : "text-slate-400"}`}>
          {feature.name}
        </p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400">{feature.description}</p>
      </div>
    </div>
  );
}
