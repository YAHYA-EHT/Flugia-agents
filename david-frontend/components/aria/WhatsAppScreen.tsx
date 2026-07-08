"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { MessageCircle, MessagesSquare, Plus, Trash2, Loader2, Check, Lock, ShieldCheck, Mail, AlertTriangle, RotateCw, ChevronDown, Bell, ArrowRight, CalendarClock, BellRing } from "lucide-react";
import { getApi } from "@/lib/aria";
import type { WhatsAppNumber, WhatsAppNumbersInfo } from "@/lib/aria/types";
import { SkeletonCard } from "./Skeleton";
import { OtpInput } from "./OtpInput";
import { ConfirmDialog } from "./ConfirmDialog";

type Country = { code: string; name: string; dial: string };

// Dial codes for the flags available under public/flags/{code}.webp — sorted alphabetically by name.
const COUNTRIES: Country[] = [
  { code: "dz", name: "Algeria", dial: "213" },
  { code: "ao", name: "Angola", dial: "244" },
  { code: "ar", name: "Argentina", dial: "54" },
  { code: "au", name: "Australia", dial: "61" },
  { code: "at", name: "Austria", dial: "43" },
  { code: "bh", name: "Bahrain", dial: "973" },
  { code: "be", name: "Belgium", dial: "32" },
  { code: "br", name: "Brazil", dial: "55" },
  { code: "ca", name: "Canada", dial: "1" },
  { code: "cn", name: "China", dial: "86" },
  { code: "hr", name: "Croatia", dial: "385" },
  { code: "dk", name: "Denmark", dial: "45" },
  { code: "fi", name: "Finland", dial: "358" },
  { code: "fr", name: "France", dial: "33" },
  { code: "de", name: "Germany", dial: "49" },
  { code: "ie", name: "Ireland", dial: "353" },
  { code: "it", name: "Italy", dial: "39" },
  { code: "jp", name: "Japan", dial: "81" },
  { code: "ma", name: "Morocco", dial: "212" },
  { code: "nl", name: "Netherlands", dial: "31" },
  { code: "nz", name: "New Zealand", dial: "64" },
  { code: "no", name: "Norway", dial: "47" },
  { code: "pl", name: "Poland", dial: "48" },
  { code: "pt", name: "Portugal", dial: "351" },
  { code: "ru", name: "Russia", dial: "7" },
  { code: "sa", name: "Saudi Arabia", dial: "966" },
  { code: "kr", name: "South Korea", dial: "82" },
  { code: "za", name: "South Africa", dial: "27" },
  { code: "es", name: "Spain", dial: "34" },
  { code: "se", name: "Sweden", dial: "46" },
  { code: "ch", name: "Switzerland", dial: "41" },
  { code: "gb", name: "United Kingdom", dial: "44" },
  { code: "us", name: "United States", dial: "1" },
];

const DEFAULT_COUNTRY = COUNTRIES.find((c) => c.code === "ma")!;

function CountrySelect({ value, onChange }: { value: Country; onChange: (c: Country) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-full items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#4cc9f0] dark:border-slate-700 dark:bg-slate-800"
      >
        <Image src={`/flags/${value.code}.webp`} alt="" width={20} height={14} className="h-3.5 w-5 rounded-sm object-cover" />
        <span className="text-slate-500 dark:text-slate-400">+{value.dial}</span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
            {COUNTRIES.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => { onChange(c); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <Image src={`/flags/${c.code}.webp`} alt="" width={20} height={14} className="h-3.5 w-5 shrink-0 rounded-sm object-cover" />
                <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{c.name}</span>
                <span className="text-slate-400">+{c.dial}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  active: { label: "Active", cls: "border-emerald-200 bg-emerald-50 text-emerald-600" },
  pending_verification: { label: "Awaiting verification", cls: "border-amber-200 bg-amber-50 text-amber-600" },
  failed: { label: "Failed", cls: "border-red-200 bg-red-50 text-red-600" },
  revoked: { label: "Removed", cls: "border-slate-200 bg-slate-50 text-slate-400" },
};

export function WhatsAppScreen({ onGoToEmail, onGoToNotifications }: { onGoToEmail?: () => void; onGoToNotifications?: () => void }) {
  const [info, setInfo] = useState<WhatsAppNumbersInfo | null>(null);
  const [channelWhatsapp, setChannelWhatsapp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<{ configured: boolean; tokenValid: boolean } | null>(null);

  const load = async () => {
    try {
      const [numbersInfo, prefs] = await Promise.all([
        getApi().listWhatsappNumbers(),
        getApi().getNotificationPreferences(),
      ]);
      setInfo(numbersInfo);
      setChannelWhatsapp(prefs.channelWhatsapp);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    getApi().whatsappStatus().then(setHealth).catch(() => setHealth(null));
  }, []);

  const serviceDown = health != null && (!health.configured || !health.tokenValid);

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-6 py-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <Image src="/whatsapp.png" alt="WhatsApp" width={36} height={36} className="h-9 w-9 shrink-0 object-contain" />
          <div>
            <h1 className="text-sm font-bold leading-tight text-slate-900 dark:text-slate-100">WhatsApp</h1>
            <p className="mt-0.5 text-[11px] text-slate-400">Message your assistant from WhatsApp</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        ) : !info?.emailConnected ? (
          <EmailRequired onGoToEmail={onGoToEmail} />
        ) : (
          <div className="mx-auto max-w-2xl space-y-4">
            {serviceDown && (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <p className="text-[13px] text-amber-700 dark:text-amber-300">
                  WhatsApp is temporarily unavailable — the server&apos;s WhatsApp connection needs
                  refreshing. You can still manage numbers, but codes and replies won&apos;t send until it&apos;s restored.
                </p>
              </div>
            )}
            <Manager info={info} channelWhatsapp={channelWhatsapp} reload={load} onGoToNotifications={onGoToNotifications} />
          </div>
        )}
      </div>
    </div>
  );
}

// Hard gate: no WhatsApp without a connected email.
function EmailRequired({ onGoToEmail }: { onGoToEmail?: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border-2 border-dashed border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
        <Lock className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">Connect an email first</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        WhatsApp relays your inbox and calendar, so your assistant needs a connected email
        account before you can link a WhatsApp number.
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

// Explains WhatsApp's dual role — a two-way chat channel AND a notification
// channel (reminders + auto calendar alerts). These are two parallel facts,
// not sequential steps, so they're joined by a "+" rather than numbered.
// The notification card only dims once there's an active number to actually
// turn notifications off for — with no number yet it's still just explaining
// the feature, so it stays at full opacity (nothing's actually "off" yet).
function NotificationExplainer({ hasActive, channelWhatsapp, onGoToNotifications }: { hasActive: boolean; channelWhatsapp: boolean; onGoToNotifications?: () => void }) {
  const isOff = hasActive && !channelWhatsapp;
  return (
    <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
      <div className="rounded-2xl border border-slate-100 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#25D366]/10 text-[#25D366]">
          <MessagesSquare className="animate-chat-sway h-5 w-5" />
        </div>
        <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Two-way chat</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Message your assistant anytime from WhatsApp — it reads and replies just like it does here.
        </p>
      </div>

      <div className="hidden items-center justify-center sm:flex">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-400 dark:bg-slate-800 dark:text-slate-500">+</span>
      </div>

      <div className={`rounded-2xl border border-slate-100 bg-white p-5 transition-opacity dark:border-slate-800 dark:bg-slate-900 ${isOff ? "opacity-60" : ""}`}>
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-500 dark:bg-amber-950/40 ${isOff ? "" : "animate-ring-pulse"}`}>
          <BellRing className="h-5 w-5" />
        </div>
        <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Also a notification channel</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          You&apos;ll get notified here for reminders you set, and automatically before upcoming calendar events.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <Bell className="h-2.5 w-2.5" /> Reminders
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <CalendarClock className="h-2.5 w-2.5" /> Calendar alerts
          </span>
        </div>
        {isOff && onGoToNotifications && (
          <button
            onClick={onGoToNotifications}
            className="mt-3 flex items-center gap-1 text-xs font-medium text-[#4cc9f0] transition hover:opacity-80"
          >
            Turn on WhatsApp notifications <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// Contextual banner, distinct from the explainer cards above — only shown once
// a number is actually active, since that's the moment notifications turn on
// automatically for it (see Stage C item 3's backend auto-enable).
function ChatOnlyBanner({ onGoToNotifications }: { onGoToNotifications?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
      <div className="flex items-center gap-2.5">
        <BellRing className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        <p className="text-xs text-amber-800 dark:text-amber-300">
          Reminders and calendar alerts are sent to this number.
        </p>
      </div>
      {onGoToNotifications && (
        <button
          onClick={onGoToNotifications}
          className="flex shrink-0 items-center gap-1 text-xs font-medium text-[#4cc9f0] transition hover:opacity-80"
        >
          Keep your numbers chat-only in settings <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function Manager({
  info,
  channelWhatsapp,
  reload,
  onGoToNotifications,
}: {
  info: WhatsAppNumbersInfo;
  channelWhatsapp: boolean;
  reload: () => Promise<void>;
  onGoToNotifications?: () => void;
}) {
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [phone, setPhone] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visible = info.numbers.filter((n) => n.status !== "revoked");
  const hasActive = visible.some((n) => n.status === "active");

  async function add() {
    setError(null);
    const digits = phone.replace(/\D/g, "");
    if (!digits) return;
    setAdding(true);
    try {
      await getApi().addWhatsappNumber(`+${country.dial}${digits}`);
      setPhone("");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that number.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <NotificationExplainer hasActive={hasActive} channelWhatsapp={channelWhatsapp} onGoToNotifications={onGoToNotifications} />

      <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        Link up to <b>{info.maxNumbers + " "}</b>WhatsApp numbers. We&apos;ll send a welcome message with a
        code — enter it below to verify you own the number. Then just message your assistant on WhatsApp.
      </p>

      {/* Add */}
      {info.canAdd ? (
        <div>
          <div className="flex gap-2">
            <CountrySelect value={country} onChange={setCountry} />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
              placeholder="555 123 4567"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#4cc9f0] dark:border-slate-700 dark:bg-slate-800"
            />
            <button
              onClick={() => void add()}
              disabled={adding || !phone.trim()}
              className="flex shrink-0 items-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        </div>
      ) : (
        <p className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900">
          You&apos;ve reached the maximum of {info.maxNumbers} numbers. Remove one to add another.
        </p>
      )}

      {hasActive && channelWhatsapp && <ChatOnlyBanner onGoToNotifications={onGoToNotifications} />}

      {/* List */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center dark:border-slate-800">
          <Image src="/whatsapp.png" alt="" width={40} height={40} className="h-10 w-10 object-contain opacity-40 grayscale" />
          <p className="mt-3 text-sm font-medium text-slate-400">No numbers linked yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((n) => <NumberRow key={n.id} n={n} reload={reload} />)}
        </div>
      )}
    </div>
  );
}

function NumberRow({ n, reload }: { n: WhatsAppNumber; reload: () => Promise<void> }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const meta = STATUS_META[n.status] ?? STATUS_META.revoked;

  async function verify(codeOverride?: string) {
    const value = (codeOverride ?? code).trim();
    if (value.length < 6) return;
    setErr(null);
    setBusy(true);
    try { await getApi().verifyWhatsappNumber(n.id, value); await reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Invalid code."); setCode(""); }
    finally { setBusy(false); }
  }
  async function resend() {
    setErr(null);
    setBusy(true);
    try { await getApi().resendWhatsappCode(n.id); setResent(true); setTimeout(() => setResent(false), 4000); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't resend the code."); }
    finally { setBusy(false); }
  }
  async function remove() {
    setConfirmRemove(false);
    setBusy(true);
    try { await getApi().removeWhatsappNumber(n.id); await reload(); }
    finally { setBusy(false); }
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
            n.status === "active" ? "bg-[#25D366]/10 text-[#25D366]" : "bg-amber-50 text-amber-500"
          }`}
        >
          {n.status === "active" ? <ShieldCheck className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{n.phoneNumber}</p>
          <span className={`mt-0.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.cls}`}>
            {n.status === "active" && <Check className="h-2.5 w-2.5" />}
            {meta.label}
          </span>
        </div>
        <button
          onClick={() => setConfirmRemove(true)}
          disabled={busy}
          aria-label="Remove"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {n.status === "pending_verification" && (
        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="mb-2 text-[12px] text-slate-500">Enter the code we sent to this number on WhatsApp:</p>
          <div className="flex items-center gap-3">
            <OtpInput
              value={code}
              onChange={setCode}
              onComplete={(v) => void verify(v)}
              disabled={busy}
              autoFocus
            />
            <button
              onClick={() => void verify()}
              disabled={busy || code.trim().length < 6}
              className="flex items-center gap-1.5 rounded-lg bg-[#4cc9f0] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Verify
            </button>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={() => void resend()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-[#4cc9f0] disabled:opacity-50"
            >
              <RotateCw className="h-3 w-3" /> Resend code
            </button>
            {resent && <span className="text-xs text-emerald-600">Sent ✓</span>}
          </div>
          {err && <p className="mt-1.5 text-xs text-red-500">{err}</p>}
        </div>
      )}

      <ConfirmDialog
        open={confirmRemove}
        title="Remove this number?"
        message={<>&ldquo;{n.phoneNumber}&rdquo; will be unlinked from your assistant. This can&apos;t be undone.</>}
        confirmLabel="Remove"
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
