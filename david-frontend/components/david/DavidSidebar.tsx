"use client";

import { ShieldCheck, BarChart3, TrendingUp, PanelLeftClose, MessagesSquare } from "lucide-react";

type DavidContext = "david" | "e_reputation" | "seo" | "linkedin";

interface Tab {
  id: DavidContext;
  label: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  {
    id: "david",
    label: "Marketing",
    icon: <TrendingUp className="h-4 w-4 shrink-0" />,
  },
  {
    id: "e_reputation",
    label: "E-Réputation",
    icon: <ShieldCheck className="h-4 w-4 shrink-0" />,
  },
  {
    id: "seo",
    label: "SEO Content",
    icon: <BarChart3 className="h-4 w-4 shrink-0" />,
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-black ring-1 ring-current">
        in
      </span>
    ),
  },
];

const ACCENT = "#4cc9f0";

export function DavidSidebar({
  active,
  onSelect,
}: {
  active: DavidContext;
  onSelect: (ctx: DavidContext) => void;
}) {
  return (
    <aside className="flex h-full w-48 shrink-0 flex-col border-r border-gray-200 bg-white py-4">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#4cc9f0] to-[#4361ee] text-sm font-black text-white">
          D
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">David</p>
          <p className="text-[10px] text-slate-400">AI Marketing Manager</p>
        </div>
      </div>

      <div className="mb-2 px-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Features</p>
      </div>

      {/* Tabs */}
      <nav className="flex-1 space-y-0.5 px-2">
        {TABS.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-all ${
                isActive
                  ? "font-semibold"
                  : "text-slate-600 hover:bg-gray-50 hover:text-slate-900"
              }`}
              style={
                isActive
                  ? { backgroundColor: `${ACCENT}18`, color: ACCENT }
                  : {}
              }
            >
              <span style={isActive ? { color: ACCENT } : { color: "#9ca3af" }}>
                {tab.icon}
              </span>
              <span className="whitespace-nowrap">{tab.label}</span>
              {isActive && (
                <span
                  className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: ACCENT }}
                />
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}