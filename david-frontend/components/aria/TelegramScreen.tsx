"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Loader2, Lock, Mail, MessageCircle, Send, Trash2 } from "lucide-react";
import { getApi } from "@/lib/aria";
import type { TelegramStatus } from "@/lib/aria/types";
import { SkeletonCard } from "./Skeleton";

export function TelegramScreen({ onGoToEmail }: { onGoToEmail?: () => void }) {
  const [info, setInfo] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    try { setInfo(await getApi().getTelegramStatus()); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    void load();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // While waiting for the user to tap Start in Telegram, poll for the link to complete.
  useEffect(() => {
    if (info?.status !== "pending_link") {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = setInterval(() => { void load(); }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [info?.status]);

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-6 py-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <Image src="/telegram-logo.webp" alt="Telegram" width={36} height={36} className="h-9 w-9 shrink-0 object-contain" />
          <div>
            <h1 className="text-sm font-bold leading-tight text-slate-900 dark:text-slate-100">Telegram</h1>
            <p className="mt-0.5 text-[11px] text-slate-400">Message your assistant from Telegram</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {loading || !info ? (
          <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        ) : !info.emailConnected ? (
          <EmailRequired onGoToEmail={onGoToEmail} />
        ) : (
          <Manager info={info} reload={load} />
        )}
      </div>
    </div>
  );
}

// Hard gate: no Telegram without a connected email.
function EmailRequired({ onGoToEmail }: { onGoToEmail?: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border-2 border-dashed border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
        <Lock className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">Connect an email first</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        Telegram relays your inbox and calendar, so your assistant needs a connected email
        account before you can link it.
      </p>
      {onGoToEmail && (
        <button
          onClick={onGoToEmail}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#4cc9f0] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
        >
          <Mail className="h-4 w-4" /> Connect email
        </button>
      )}
    </div>
  );
}

function Manager({ info, reload }: { info: TelegramStatus; reload: () => Promise<void> }) {
  const [connecting, setConnecting] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setError(null);
    setConnecting(true);
    try { await getApi().createTelegramLink(); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't start the connection."); }
    finally { setConnecting(false); }
  }

  async function unlink() {
    setUnlinking(true);
    try { await getApi().unlinkTelegram(); await reload(); }
    finally { setUnlinking(false); }
  }

  function copyLink() {
    if (!info.link) return;
    void navigator.clipboard.writeText(info.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        Connect Telegram to message your assistant from there. One tap opens a chat with the bot —
        no phone number or code needed.
      </p>

      {info.status === "not_linked" && (
        <div>
          <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center dark:border-slate-800">
            <Image src="/telegram-logo.webp" alt="" width={40} height={40} className="h-10 w-10 object-contain opacity-60" />
            <p className="mt-3 text-sm font-medium text-slate-400">Not connected yet</p>
            <button
              onClick={() => void connect()}
              disabled={connecting}
              className="mt-4 flex items-center gap-2 rounded-xl bg-[#26A5E4] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Connect Telegram
            </button>
          </div>
          {error && <p className="mt-2 text-center text-xs text-red-500">{error}</p>}
        </div>
      )}

      {info.status === "pending_link" && info.link && (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#26A5E4]/10 text-[#26A5E4]">
              <MessageCircle className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Almost there</p>
              <p className="text-xs text-slate-400">Open the link, then tap Start in Telegram</p>
            </div>
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-300" />
          </div>
          <div className="mt-4 flex gap-2">
            <a
              href={info.link}
              target="_blank"
              rel="noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#26A5E4] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
            >
              <ExternalLink className="h-4 w-4" /> Open in Telegram
            </a>
            <button
              onClick={copyLink}
              title="Copy link"
              aria-label="Copy link"
              className="flex shrink-0 items-center justify-center rounded-xl border border-slate-200 px-3 text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {info.status === "active" && (
        <div className="rounded-2xl border border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#26A5E4]/10 text-[#26A5E4]">
              <MessageCircle className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Telegram connected</p>
              <span className="mt-0.5 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                <Check className="h-2.5 w-2.5" /> Active
              </span>
            </div>
            <button
              onClick={() => void unlink()}
              disabled={unlinking}
              aria-label="Disconnect"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
            >
              {unlinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
