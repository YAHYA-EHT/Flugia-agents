"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, Mail, Loader2 } from "lucide-react";
import { getApi } from "@/lib/aria";
import { gmailLink, type EmailContent, type EmailRef } from "@/lib/aria/types";

export function EmailReferences({ refs }: { refs: EmailRef[] }) {
  return (
    <div className="mt-2.5 space-y-2">
      <div className="px-1 text-xs font-medium text-slate-400">
        {refs.length} email{refs.length > 1 ? "s" : ""} referenced
      </div>
      {refs.map((r) => (
        <EmailCard key={r.id} email={r} />
      ))}
    </div>
  );
}

function EmailCard({ email }: { email: EmailRef }) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState<EmailContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !full && !loading) {
      setLoading(true);
      setError(null);
      try {
        setFull(await getApi().getEmail(email.id));
      } catch {
        setError("Couldn't load the full email.");
      } finally {
        setLoading(false);
      }
    }
  }

  const name = email.sender.split("<")[0].trim() || email.sender;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <button
        onClick={toggle}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
      >
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            email.unread
              ? "bg-brand-strong/10 text-brand-strong"
              : "bg-slate-100 text-slate-400 dark:bg-slate-800"
          }`}
        >
          <Mail className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{name}</span>
            {email.unread && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-strong" />
            )}
            <span className="ml-auto shrink-0 text-[11px] text-slate-400">
              {email.date}
            </span>
          </span>
          <span className="block truncate text-sm text-slate-700 dark:text-slate-300">
            {email.subject}
          </span>
          {!open && (
            <span className="block truncate text-xs text-slate-400">
              {email.snippet}
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="border-t border-slate-100 px-3 py-3 dark:border-slate-800">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : error ? (
            <p className="text-sm text-red-500">{error}</p>
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {full?.body || email.snippet}
            </p>
          )}
          <a
            href={gmailLink(email)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand-strong hover:opacity-80"
          >
            Open in Gmail <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}
