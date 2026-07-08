"use client";

import {
  LayoutPanelLeft, TrendingUp, ShieldCheck, HeadphonesIcon,
  Users, Scale, Cpu, Package, BarChart3, Globe,
  ChevronRight, Settings, PanelLeftOpen, PanelLeftClose,
} from "lucide-react";

interface Props {
  activePage: string | null;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: (id: string) => void; // ← unique callback qui reçoit l'id
}

function Label({ expanded, className = "", children }: { expanded: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ${expanded ? "max-w-[10rem] opacity-100 delay-100" : "max-w-0 opacity-0"} ${className}`}>
      {children}
    </span>
  );
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  color?: string;
  isOrchestrator?: boolean;
  sub?: { id: string; label: string; icon: React.ReactNode }[];
}

const NAV: NavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: <LayoutPanelLeft className="h-5 w-5 shrink-0" />,
  },
  {
    id: "global",
    label: "Roger",
    icon: <Globe className="h-5 w-5 shrink-0" />,
    color: "#ef4444",
    isOrchestrator: true,
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: <TrendingUp className="h-5 w-5 shrink-0" />,
    color: "#4cc9f0",
    sub: [
      { id: "e-reputation", label: "E-Reputation", icon: <ShieldCheck className="h-4 w-4 shrink-0" /> },
      { id: "seo", label: "SEO Content", icon: <BarChart3 className="h-4 w-4 shrink-0" /> },
      { id: "linkedin", label: "LinkedIn", icon: <span className="h-4 w-4 shrink-0 flex items-center justify-center text-[10px] font-black">in</span> },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    icon: <ShieldCheck className="h-5 w-5 shrink-0" />,
    color: "#4cc9f0",
    sub: [
      { id: "prospecting", label: "Prospecting", icon: <Users className="h-4 w-4 shrink-0" /> },
      { id: "campaigns", label: "Campaigns", icon: <TrendingUp className="h-4 w-4 shrink-0" /> },
    ],
  },
  {
    id: "support",
    label: "Support",
    icon: <HeadphonesIcon className="h-5 w-5 shrink-0" />,
    color: "#4cc9f0",
    sub: [
      { id: "chatbot", label: "Chatbot", icon: <HeadphonesIcon className="h-4 w-4 shrink-0" /> },
      { id: "call-agent", label: "Call Agent", icon: <HeadphonesIcon className="h-4 w-4 shrink-0" /> },
    ],
  },
  {
    id: "bureau",
    label: "Bureau",
    icon: <Users className="h-5 w-5 shrink-0" />,
    color: "#4cc9f0",
    sub: [
      { id: "secretary", label: "Executive Assistant", icon: <Users className="h-4 w-4 shrink-0" /> },
    ],
  },
  {
    id: "hr",
    label: "HR",
    icon: <Users className="h-5 w-5 shrink-0" />,
    color: "#4cc9f0",
  },
  {
    id: "legal",
    label: "Legal",
    icon: <Scale className="h-5 w-5 shrink-0" />,
    color: "#4cc9f0",
  },
  {
    id: "technology",
    label: "Technology",
    icon: <Cpu className="h-5 w-5 shrink-0" />,
    color: "#4cc9f0",
  },
  {
    id: "product",
    label: "Product",
    icon: <Package className="h-5 w-5 shrink-0" />,
    color: "#4cc9f0",
  },
  {
    id: "strategy",
    label: "Strategy",
    icon: <BarChart3 className="h-5 w-5 shrink-0" />,
    color: "#4cc9f0",
  },
];

export function FlugiaSidebar({ activePage, expanded, onToggle, onNavigate }: Props) {
  const activeId = activePage === "secretary" ? "secretary"
    : activePage === "dept" ? "bureau"
    : activePage ?? "";

  return (
    <div className={`fixed left-0 top-16 z-40 hidden h-[calc(100vh-64px)] flex-col overflow-hidden whitespace-nowrap border-r border-gray-200 bg-white transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[width] lg:flex ${expanded ? "w-64" : "w-20"}`}>
      <div className="flex h-full flex-col">
        <div className="flex-1 overflow-y-auto py-4">
          {/* Toggle */}
          <div className="mb-3 px-2">
            <button
              onClick={onToggle}
              title={expanded ? "Collapse" : "Expand"}
              className="flex w-full items-center justify-center rounded-xl p-2.5 transition-all duration-200 hover:bg-[#4cc9f0] hover:text-white text-[#4cc9f0]"
              style={{ backgroundColor: "rgba(76,201,240,0.1)" }}
            >
              {expanded ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
            </button>
          </div>

          <nav className="px-3 space-y-1">
            {NAV.map((item) => {
              const isActive = activeId === item.id || (item.sub?.some(s => s.id === activeId) ?? false);
              const color = item.color ?? "#4cc9f0";
              const hasSub = item.sub && item.sub.length > 0;

              return (
                <div key={item.id}>
                  <button
                    onClick={() => onNavigate(item.id)}
                    title={expanded ? undefined : item.label}
                    className={`flex w-full items-center rounded-lg py-2.5 transition-all duration-200 ${expanded ? "gap-3 px-3" : "justify-center px-2"} ${isActive ? "font-semibold" : "text-gray-700 hover:bg-gray-50"}`}
                    style={isActive ? { backgroundColor: `${color}18`, color } : {}}
                  >
                    <span style={isActive ? { color } : { color: "#6b7280" }}>{item.icon}</span>
                    <Label expanded={expanded} className="flex-1 text-left text-sm">{item.label}</Label>
                    {hasSub && expanded && <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />}
                  </button>

                  {/* Sub-items */}
                  {hasSub && (
                    <div className={`grid transition-[grid-template-rows] duration-200 ${expanded ? "grid-rows-[1fr] delay-100" : "grid-rows-[0fr]"}`}>
                      <div className="overflow-hidden">
                        <div className="ml-4 mt-1 space-y-0.5 border-l-2 border-gray-100 py-1 pl-3">
                          {item.sub!.map((sub) => {
                            const subActive = activeId === sub.id;
                            return (
                              <button
                                key={sub.id}
                                onClick={() => onNavigate(sub.id)}
                                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${subActive ? "font-medium" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"}`}
                                style={subActive ? { backgroundColor: `${color}18`, color } : {}}
                              >
                                <span style={subActive ? { color } : { color: "#9ca3af" }}>{sub.icon}</span>
                                <span className="whitespace-nowrap">{sub.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Settings */}
        <div className="border-t border-gray-100 px-3 py-4">
          <Label expanded={expanded} className="mb-2 block px-3 text-[11px] font-medium uppercase tracking-wider text-gray-400">Account</Label>
          <button
            onClick={() => onNavigate("settings")}
            className={`flex w-full items-center rounded-lg py-2.5 text-gray-700 transition-all duration-200 hover:bg-gray-50 ${expanded ? "gap-3 px-3" : "justify-center px-2"}`}
            title={expanded ? undefined : "Settings"}
          >
            <Settings className="h-5 w-5 shrink-0" />
            <Label expanded={expanded} className="text-sm">Settings</Label>
          </button>
        </div>
      </div>
    </div>
  );
}