"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export function Select<T extends string>({
  value,
  onChange,
  options,
  className = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center justify-between gap-2 text-left outline-none transition focus:ring-2 focus:ring-[#4cc9f0] ${className}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {current?.icon && <span className="shrink-0 text-slate-400">{current.icon}</span>}
          <span className="truncate">{current?.label ?? ""}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 max-h-64 min-w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className="flex w-full items-center justify-between gap-2 whitespace-nowrap px-3 py-1.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {o.icon && <span className="shrink-0 text-slate-400">{o.icon}</span>}
                  <span className="truncate">{o.label}</span>
                </span>
                {o.value === value && <Check className="h-3.5 w-3.5 shrink-0 text-[#4cc9f0]" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
