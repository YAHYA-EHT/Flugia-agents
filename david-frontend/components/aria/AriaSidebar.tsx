"use client";

import Image from "next/image";
import {
  Home,
  MessageSquare,
  SlidersHorizontal,
  Bell,
  BellRing,
  LogOut,
  Mail,
  AtSign,
  BookOpen,
  Contact,
  Sparkles,
} from "lucide-react";

export type AriaPage =
  | "overview"
  | "assistant"
  | "agent"
  | "autonomy"
  | "rules"
  | "agenda"
  | "notifications"
  | "email-accounts"
  | "knowledge-bases"
  | "whatsapp";

type NavItem = {
  id: AriaPage;
  label: string;
  icon: React.ReactNode;
  section: "pages" | "channels" | "automation";
};

const PAGES: NavItem[] = [
  {
    id: "overview",
    label: "Overview",
    icon: <Home className="h-5 w-5 shrink-0" />,
    section: "pages",
  },
  {
    id: "assistant",
    label: "Chat",
    icon: <MessageSquare className="h-5 w-5 shrink-0" />,
    section: "pages",
  },
  {
    id: "autonomy",
    label: "Autonomy",
    icon: <SlidersHorizontal className="h-5 w-5 shrink-0" />,
    section: "pages",
  },
  {
    id: "rules",
    label: "Email Rules",
    icon: <AtSign className="h-5 w-5 shrink-0" />,
    section: "pages",
  },
  {
    id: "agenda",
    label: "Agenda",
    icon: <Bell className="h-5 w-5 shrink-0" />,
    section: "pages",
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: <BellRing className="h-5 w-5 shrink-0" />,
    section: "pages",
  },
  {
    id: "agent",
    label: "Agent",
    icon: <Sparkles className="h-5 w-5 shrink-0" />,
    section: "pages",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    icon: <Image src="/whatsapp.png" alt="" width={20} height={20} className="h-5 w-5 shrink-0 object-contain" />,
    section: "channels",
  },
  {
    id: "email-accounts",
    label: "Email Accounts",
    icon: <Mail className="h-5 w-5 shrink-0" />,
    section: "automation",
  },
  {
    id: "knowledge-bases",
    label: "Knowledge Bases",
    icon: <BookOpen className="h-5 w-5 shrink-0" />,
    section: "automation",
  },
];

export function AriaSidebar({
  active,
  onSelect,
  embedded = false,
  onSignOut,
}: {
  active: AriaPage;
  onSelect: (p: AriaPage) => void;
  embedded?: boolean;
  onSignOut?: () => void;
}) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-white">
      {/* Clickable VS header — goes back to overview */}
      <button
        onClick={() => onSelect("overview")}
        className="flex h-16 shrink-0 cursor-pointer items-center border-b border-gray-200 bg-gray-50/50 px-6 text-left transition hover:bg-gray-100"
      >
        <div className="flex items-center gap-2.5">
          <Contact className="h-4 w-4 text-[#4cc9f0] shrink-0" />
          <div className="flex flex-col justify-center">
            <h3 className="text-sm font-bold leading-tight text-gray-900">
              Executive Assistant
            </h3>
            <p className="mt-0.5 text-[10px] font-medium text-gray-400">
              {active === "overview" ? "Home" : PAGES.find((p) => p.id === active)?.label ?? ""}
            </p>
          </div>
        </div>
      </button>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto p-4">
        <nav className="space-y-1">
          {(["pages", "channels", "automation"] as const).map((section) => {
            const items = PAGES.filter((p) => p.section === section);
            return (
              <div key={section} className={section !== "pages" ? "mt-4" : ""}>
                <div className="flex items-center gap-2 px-1 py-1">
                  <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-300">
                    {section === "pages" ? "Pages" : section === "channels" ? "Channels" : "Automation"}
                  </span>
                  <div className="h-px flex-1 bg-gray-100" />
                </div>
                {items.map((p) => {
                  const isActive = p.id === active;
                  return (
                    <button
                      key={p.id}
                      onClick={() => onSelect(p.id)}
                      className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? "bg-[#4cc9f0]/10 text-[#4cc9f0]"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      }`}
                    >
                      <span className={`transition-colors duration-200 ${isActive ? "text-[#4cc9f0]" : "text-gray-400"}`}>
                        {p.icon}
                      </span>
                      <span>{p.label}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </div>

      {!embedded && onSignOut && (
        <div className="border-t border-gray-100 p-4">
          <button
            onClick={onSignOut}
            className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-medium text-gray-500 transition-all hover:bg-gray-50 hover:text-gray-700"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            Sign out
          </button>
        </div>
      )}
    </aside>
  );
}
