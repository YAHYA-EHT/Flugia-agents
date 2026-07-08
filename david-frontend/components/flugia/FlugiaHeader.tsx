"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Search, Globe, Bell, LogOut, ChevronDown } from "lucide-react";
import { useAuthStore } from "@/lib/aria/state/authStore";
import { dashboardPath } from "@/lib/aria/routes";

function useTime() {
  const fmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Africa/Casablanca",
    hour12: true,
  });
  const [time, setTime] = useState(() => fmt.format(new Date()));
  useEffect(() => {
    const id = setInterval(() => setTime(fmt.format(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);
  return time;
}

const TOKEN_MAX = 10_000;
const TOKEN_USED = 3_420; // placeholder — replace with real store value when available

function UserMenu({ name, email }: { name: string; email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const signOut = useAuthStore((s) => s.signOut);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const tokenPct = Math.min(100, (TOKEN_USED / TOKEN_MAX) * 100);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 rounded-xl px-2 py-1 transition hover:bg-gray-100"
      >
        <span className="hidden text-right text-xs font-bold text-gray-700 md:block">
          {name}
        </span>
        {/* Avatar */}
        <span className="relative flex h-9 w-9 shrink-0 overflow-hidden rounded-full border border-gray-200 shadow-sm">
          <span className="absolute inset-0 flex items-center justify-center bg-brand-strong text-[11px] font-semibold text-white">
            {initials}
          </span>
          <Image
            src="/profile.png"
            alt={name}
            width={36}
            height={36}
            className="relative z-10 h-full w-full object-cover"
          />
        </span>
        <ChevronDown className={`hidden h-3.5 w-3.5 text-gray-400 transition-transform md:block ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-60 mt-2 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          {/* User info card */}
          <div className="border-b border-gray-100 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full border border-gray-200">
                <span className="absolute inset-0 flex items-center justify-center bg-brand-strong text-xs font-semibold text-white">
                  {initials}
                </span>
                <Image
                  src="/profile.png"
                  alt={name}
                  width={40}
                  height={40}
                  className="relative z-10 h-full w-full object-cover"
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">{name}</p>
                <p className="truncate text-xs text-gray-400">{email}</p>
              </div>
            </div>
          </div>

          {/* Token usage */}
          <div className="border-b border-gray-100 px-4 py-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Flugia Pro
              </span>
              <span className="text-[11px] text-gray-500">
                {TOKEN_USED.toLocaleString()} / {TOKEN_MAX.toLocaleString()} tokens
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-[#4cc9f0] transition-all"
                style={{ width: `${tokenPct}%` }}
              />
            </div>
            <p className="mt-1.5 text-[10px] text-gray-400">
              {(TOKEN_MAX - TOKEN_USED).toLocaleString()} tokens remaining this cycle
            </p>
          </div>

          {/* Sign out */}
          <button
            onClick={() => { setOpen(false); void signOut(); }}
            className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function FlugiaHeader() {
  const time = useTime();
  const user = useAuthStore((s) => s.user);
  const router = useRouter();

  const name = user?.displayName ?? "Ouchen Oussama";
  const email = user?.email ?? "";

  return (
    <header className="fixed left-0 right-0 top-0 z-50 flex h-16 items-center border-b border-gray-200 bg-white/80 pr-6 backdrop-blur-md">
      {/* Logo block */}
      <button
        onClick={() => router.push(dashboardPath())}
        title="Go to dashboard"
        aria-label="Go to dashboard"
        className="flex h-full w-64 shrink-0 cursor-pointer items-center justify-center border-r border-gray-200 transition hover:bg-gray-50"
      >
        <Image
          src="/logo-name.svg"
          alt="Flugia"
          width={115}
          height={28}
          style={{ width: 115, height: "auto" }}
          className="object-contain"
          priority
        />
      </button>

      {/* Search */}
      <div className="flex flex-1 items-center pl-6">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Find a tool…"
            className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-16 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-strong/50 focus:outline-none focus:ring-2 focus:ring-brand-strong/20"
          />
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            <kbd className="inline-flex h-5 items-center justify-center gap-0.5 rounded border border-gray-200 bg-gray-100 px-1.5 font-mono text-[10px] leading-none text-gray-500">
              ⌘K
            </kbd>
          </div>
        </div>
      </div>

      {/* Right cluster */}
      <div className="flex shrink-0 items-center gap-4">
        {/* Timezone */}
        <div className="hidden items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2 text-[11px] font-medium text-gray-500 lg:flex">
          <Globe className="h-3.5 w-3.5 text-gray-400" />
          <span className="whitespace-nowrap">{time} · Africa/Casablanca</span>
        </div>

        <div className="hidden h-4 w-px bg-gray-200 lg:block" />

        {/* Bell */}
        <div className="relative">
          <button className="relative flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white shadow-xs hover:bg-gray-50">
            <Bell className="h-4 w-4 text-gray-600" />
            <span className="absolute -top-2 left-full -translate-x-1/2 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-brand-strong text-[11px] font-bold text-white">
              4
            </span>
          </button>
        </div>

        <div className="hidden h-4 w-px bg-gray-200 lg:block" />

        {/* User menu */}
        <UserMenu name={name} email={email} />
      </div>
    </header>
  );
}
