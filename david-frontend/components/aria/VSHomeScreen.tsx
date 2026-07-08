"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MessageSquare,
  AtSign,
  Bell,
  Contact,
  CheckCircle2,
  Clock,
  Activity,
} from "lucide-react";
import { useChatStore } from "@/lib/aria/state/chatStore";
import { useSettingsStore } from "@/lib/aria/state/settingsStore";
import { AreaChart, Donut, BarChart, ChartCard } from "./Charts";
import { Skeleton, SkeletonStat, SkeletonChart } from "./Skeleton";

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function VSHomeScreen() {
  const messages    = useChatStore((s) => s.messages);
  const pending     = useChatStore((s) => s.pendingAction);
  const rules       = useSettingsStore((s) => s.rules);
  const reminders   = useSettingsStore((s) => s.reminders);
  const autonomy    = useSettingsStore((s) => s.autonomy);

  // Feature screens show skeletons while data settles (no entrance "pop" — that
  // is reserved for the dashboard + department overview). Also avoids SSR/CSR
  // hydration drift on the time-based charts.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 450);
    return () => clearTimeout(t);
  }, []);

  const totalMsgs       = messages.length;
  const userMsgs        = messages.filter((m) => m.role === "user").length;
  const assistantMsgs   = messages.filter((m) => m.role === "assistant").length;
  const autoActions     = autonomy.filter((a) => a.level === "auto").length;
  const askActions      = autonomy.filter((a) => a.level === "ask").length;

  // 7-day message activity (past)
  const weekly = useMemo(() => {
    const now = new Date();
    const out: { label: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const label = d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 1);
      const value = messages.reduce((acc, m) => {
        const ts = m.createdAt ? new Date(m.createdAt) : null;
        return acc + (ts && sameDay(ts, d) ? 1 : 0);
      }, 0);
      out.push({ label, value });
    }
    return out;
  }, [messages]);

  // Upcoming scheduled items over the next 7 days (agenda / reminders)
  const upcoming = useMemo(() => {
    const now = new Date();
    const out: { label: string; value: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      const label = i === 0 ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" });
      const value = reminders.reduce((acc, r) => {
        const ts = r.fireAt ? new Date(r.fireAt) : null;
        return acc + (ts && sameDay(ts, d) ? 1 : 0);
      }, 0);
      out.push({ label, value });
    }
    return out;
  }, [reminders]);

  // Who is driving the conversation — a real engagement signal
  const conversationSegments = [
    { label: "You", value: userMsgs, color: "#4361ee" },
    { label: "Aria", value: assistantMsgs, color: "#4cc9f0" },
  ];

  const STATS = [
    { label: "Total messages", value: totalMsgs, sub: `${assistantMsgs} from Aria`, icon: <MessageSquare className="h-5 w-5" />, color: "#4cc9f0" },
    { label: "Pending action", value: pending ? 1 : 0, sub: pending ? "awaiting approval" : "none waiting", icon: <Clock className="h-5 w-5" />, color: pending ? "#f59e0b" : "#94a3b8", highlight: !!pending },
    { label: "Auto rules active", value: autoActions, sub: `${askActions} set to ask`, icon: <Activity className="h-5 w-5" />, color: "#4cc9f0" },
    { label: "Email rules", value: rules.length, sub: "per-sender filters", icon: <AtSign className="h-5 w-5" />, color: "#4cc9f0" },
    { label: "Agenda items", value: reminders.length, sub: "scheduled", icon: <Bell className="h-5 w-5" />, color: "#4cc9f0" },
    { label: "Status", value: "Active", sub: "all systems running", icon: <CheckCircle2 className="h-5 w-5" />, color: "#22c55e" },
  ];

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="border-b border-slate-100 bg-white px-6 py-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4cc9f0]/10">
            <Contact className="h-5 w-5 text-[#4cc9f0]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Executive Assistant</h1>
            <p className="text-xs text-slate-400">Overview & analytics</p>
          </div>
        </div>
      </div>

      {!ready ? (
        <div className="p-6 space-y-6">
          <section>
            <Skeleton className="mb-3 h-3 w-20" />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <SkeletonChart className="lg:col-span-2" height={168} />
              <SkeletonChart height={168} />
              <SkeletonChart className="lg:col-span-3" height={150} />
            </div>
          </section>
          <section>
            <Skeleton className="mb-3 h-3 w-20" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonStat key={i} />)}
            </div>
          </section>
        </div>
      ) : (
        <div className="p-6 space-y-6">
          {/* Charts — on top */}
          <section>
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">Analytics</h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <ChartCard title="Activity" subtitle="Messages · last 7 days" className="lg:col-span-2">
                <AreaChart data={weekly.map((d) => d.value)} labels={weekly.map((d) => d.label)} />
              </ChartCard>

              <ChartCard title="Conversation" subtitle="You vs Aria">
                <div className="flex items-center justify-center py-2">
                  <Donut
                    segments={conversationSegments}
                    centerLabel={String(totalMsgs)}
                    centerSub="messages"
                  />
                </div>
              </ChartCard>

              <ChartCard title="Upcoming schedule" subtitle="Agenda · next 7 days" className="lg:col-span-3">
                <BarChart data={upcoming} />
              </ChartCard>
            </div>
          </section>

          {/* Summary stats */}
          <section>
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">Summary</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {STATS.map((s) => (
                <div
                  key={s.label}
                  className={`flex flex-col gap-2 rounded-xl border bg-white p-4 dark:bg-slate-900 ${
                    s.highlight ? "border-amber-300 dark:border-amber-700" : "border-slate-100 dark:border-slate-800"
                  }`}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: `${s.color}18`, color: s.color }}>
                    {s.icon}
                  </div>
                  <div>
                    <p className="text-2xl font-black leading-none" style={{ color: s.color }}>{s.value}</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200">{s.label}</p>
                    <p className="text-[10px] text-slate-400">{s.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
