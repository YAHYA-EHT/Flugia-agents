"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AtSign, Bell, Clock, Trash2, Plus, Ban, MailOpen, Archive, BellOff } from "lucide-react";
import { format } from "date-fns";
import { getApi } from "@/lib/aria";
import { useSettingsStore } from "@/lib/aria/state/settingsStore";
import {
  EMAIL_RULE_ACTIONS,
  autonomyDisplayName,
  emailRuleActionLabel,
  type AutonomyLevel,
  type ActionType,
  type EmailRuleAction,
  type EmailAccount,
  type WhatsAppNumber,
} from "@/lib/aria/types";
import { Skeleton, SkeletonListItem } from "./Skeleton";
import { Select } from "./Select";

export type SettingsSection = "autonomy" | "rules" | "agenda" | "notifications";

const LEVELS: AutonomyLevel[] = ["auto", "ask", "never"];

function emailRuleActionIcon(action: EmailRuleAction) {
  switch (action) {
    case "block": return <Ban className="h-3.5 w-3.5" />;
    case "mark_read": return <MailOpen className="h-3.5 w-3.5" />;
    case "archive": return <Archive className="h-3.5 w-3.5" />;
    case "notify_never": return <BellOff className="h-3.5 w-3.5" />;
  }
}

const META: Record<SettingsSection, { title: string; subtitle: string }> = {
  autonomy: {
    title: "Autonomy",
    subtitle: "What Aria can do on its own, ask about, or never do.",
  },
  rules: {
    title: "Email Rules",
    subtitle: "Per-sender rules applied before Aria acts.",
  },
  agenda: {
    title: "Agenda",
    subtitle: "Upcoming scheduled reminders and automated alerts.",
  },
  notifications: {
    title: "Notifications",
    subtitle: "Control how and when you're notified.",
  },
};

const AUTONOMY_GROUPS: { label: string; icon: React.ReactNode; types: ActionType[] }[] = [
  {
    label: "Email",
    icon: (
      <Image src="/gmail-logo.webp" alt="Gmail" width={16} height={16} className="h-4 w-4 object-contain" />
    ),
    types: ["reply_email", "send_email", "draft_email", "mark_read", "archive_email", "block_sender"],
  },
  {
    label: "Calendar",
    icon: (
      <Image src="/google-calendar.webp" alt="Calendar" width={16} height={16} className="h-4 w-4 object-contain" />
    ),
    types: ["create_event", "delete_event"],
  },
  {
    label: "Other",
    icon: <Clock className="h-4 w-4 text-gray-400" />,
    types: ["schedule_reminder"],
  },
];

export function SettingsScreen({
  section,
  onGoToEmail,
  onGoToWhatsapp,
}: {
  section: SettingsSection;
  onGoToEmail?: () => void;
  onGoToWhatsapp?: () => void;
}) {
  const store = useSettingsStore();
  const [showAdd, setShowAdd] = useState(false);
  // Show skeletons from the first paint until the initial load resolves
  // (store.loading starts false, so gate on this to avoid a content flash).
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void store.loadAll().finally(() => setHydrated(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meta = META[section];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{meta.title}</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{meta.subtitle}</p>
          </div>
          {section === "rules" && (
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#4cc9f0] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Add rule
            </button>
          )}
        </div>

        {store.error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {store.error}
          </div>
        )}

        {!hydrated || store.loading ? (
          <SettingsSkeleton section={section} />
        ) : section === "autonomy" ? (
          <AutonomySection />
        ) : section === "notifications" ? (
          <NotificationsSection onGoToEmail={onGoToEmail} onGoToWhatsapp={onGoToWhatsapp} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            {section === "rules" && <RulesSection />}
            {section === "agenda" && <AgendaSection />}
          </div>
        )}
      </div>

      {showAdd && <AddRuleDialog onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function SettingsSkeleton({ section }: { section: SettingsSection }) {
  if (section === "autonomy") {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, g) => (
          <div key={g} className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-800/50">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3.5">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-7 w-40 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonListItem key={i} />)}
      </div>
    </div>
  );
}

function AutonomySection() {
  const store = useSettingsStore();

  return (
    <div className="space-y-4">
      {AUTONOMY_GROUPS.map((group) => {
        const items = group.types.map(
          (t) => store.autonomy.find((s) => s.actionType === t) ?? { actionType: t, level: "ask" as AutonomyLevel },
        );
        return (
          <div key={group.label} className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-800/50">
              {group.icon}
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{group.label}</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((s) => (
                <div
                  key={s.actionType}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
                >
                  <span className="text-sm">{autonomyDisplayName(s.actionType)}</span>
                  <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                    {LEVELS.map((lvl) => (
                      <button
                        key={lvl}
                        onClick={() => store.setAutonomy(s.actionType, lvl)}
                        className={`cursor-pointer px-3.5 py-1 text-sm capitalize transition ${
                          s.level === lvl
                            ? "bg-[#4cc9f0] text-white"
                            : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Toggle({ checked, onChange, disabled = false }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? "bg-[#4cc9f0]" : "bg-slate-200 dark:bg-slate-700"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// Local drag state so the number updates smoothly while sliding, but the API
// call only fires once on release — not on every intermediate value. Keyed by
// the caller on `value` so it resets cleanly whenever the persisted value
// changes externally, instead of syncing via a setState-in-effect.
function NoticeSlider({ value, disabled, onCommit }: { value: number; disabled: boolean; onCommit: (v: number) => void }) {
  const [local, setLocal] = useState(value);

  return (
    <>
      <div className="mt-3 flex items-center gap-3">
        <input
          type="range"
          min={2}
          max={45}
          step={1}
          value={local}
          disabled={disabled}
          onChange={(e) => setLocal(Number(e.target.value))}
          onMouseUp={() => onCommit(local)}
          onTouchEnd={() => onCommit(local)}
          onKeyUp={() => onCommit(local)}
          className="w-full accent-[#4cc9f0] disabled:opacity-50"
        />
        <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums">{local} min</span>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>2 min</span>
        <span>45 min</span>
      </div>
    </>
  );
}

function EmailAccountPicker({ accounts, value, onChange }: { accounts: EmailAccount[]; value: string | null; onChange: (id: string) => void }) {
  const current = accounts.find((a) => a.id === value) ?? accounts[0];
  return (
    <Select
      value={current?.id ?? ""}
      onChange={onChange}
      options={accounts.map((a) => ({
        value: a.id,
        label: a.displayName || a.email,
        icon: a.pictureUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.pictureUrl} alt="" className="h-4 w-4 rounded-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-strong/10 text-[8px] font-semibold text-brand-strong">
            {(a.displayName || a.email)[0]?.toUpperCase()}
          </span>
        ),
      }))}
      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
    />
  );
}

function WhatsappNumberPicker({ numbers, value, onChange }: { numbers: WhatsAppNumber[]; value: string | null; onChange: (id: string) => void }) {
  const current = numbers.find((n) => n.id === value) ?? numbers[0];
  return (
    <Select
      value={current?.id ?? ""}
      onChange={onChange}
      options={numbers.map((n) => ({
        value: n.id,
        label: n.phoneNumber,
        icon: <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#25D366]/10 text-[#25D366]"><Bell className="h-2.5 w-2.5" /></span>,
      }))}
      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
    />
  );
}

function NotificationsSection({ onGoToEmail, onGoToWhatsapp }: { onGoToEmail?: () => void; onGoToWhatsapp?: () => void }) {
  const store = useSettingsStore();
  const prefs = store.notificationPrefs;
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [waNumbers, setWaNumbers] = useState<WhatsAppNumber[]>([]);

  useEffect(() => {
    getApi().listEmailAccounts().then(setEmailAccounts).catch(() => {});
    getApi().listWhatsappNumbers().then((info) => setWaNumbers(info.numbers.filter((n) => n.status === "active"))).catch(() => {});
  }, []);

  if (!prefs) return null;
  const hasEmail = emailAccounts.length > 0;
  const hasWhatsapp = waNumbers.length > 0;

  function setEmailChannel(v: boolean) {
    void store.setNotificationPrefs({
      channelEmail: v,
      ...(v && !prefs!.notifyEmailAccountId && emailAccounts[0] ? { notifyEmailAccountId: emailAccounts[0].id } : {}),
    });
  }
  function setWhatsappChannel(v: boolean) {
    void store.setNotificationPrefs({
      channelWhatsapp: v,
      ...(v && !prefs!.notifyWhatsappNumberId && waNumbers[0] ? { notifyWhatsappNumberId: waNumbers[0].id } : {}),
    });
  }

  return (
    <div className="space-y-4">
      {/* Master toggle */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div>
            <p className="text-sm font-medium">Notifications</p>
            <p className="mt-0.5 text-xs text-slate-400">Turn all notifications on or off.</p>
          </div>
          <Toggle checked={prefs.enabled} onChange={(v) => void store.setNotificationPrefs({ enabled: v })} />
        </div>
      </div>

      {/* Channels — no overflow-hidden here (unlike the other cards) so the
          notify-target dropdowns below aren't clipped by the card's border. */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5 rounded-t-xl border-b border-slate-100 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-800/50">
          <Bell className="h-4 w-4 text-slate-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Where you get notified</span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {/* Flugia — always on, represents this platform itself. Named "Flugia"
              rather than "App" so non-technical users don't read it as their
              phone's app notifications. */}
          <div className="flex items-center justify-between gap-3 px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <Image src="/flugia-logo.png" alt="" width={20} height={20} className="h-5 w-5 object-contain" />
              <div>
                <p className="text-sm">Flugia</p>
                <p className="text-xs text-slate-400">Always on</p>
              </div>
            </div>
            <Toggle checked disabled onChange={() => {}} />
          </div>

          {/* Email */}
          <div className="px-5 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Image src="/gmail-logo.webp" alt="" width={16} height={16} className="h-4 w-4 object-contain" />
                <span className="text-sm">Email</span>
              </div>
              <Toggle checked={prefs.channelEmail} disabled={!prefs.enabled || !hasEmail} onChange={setEmailChannel} />
            </div>
            {!hasEmail ? (
              <p className="mt-2 text-xs text-slate-400">
                Add an email account to enable this.{" "}
                {onGoToEmail && (
                  <button onClick={onGoToEmail} className="font-medium text-[#4cc9f0] hover:underline">Add email</button>
                )}
              </p>
            ) : prefs.channelEmail && (
              <div className="mt-2.5">
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">Send to</label>
                <EmailAccountPicker
                  accounts={emailAccounts}
                  value={prefs.notifyEmailAccountId}
                  onChange={(id) => void store.setNotificationPrefs({ notifyEmailAccountId: id })}
                />
              </div>
            )}
          </div>

          {/* WhatsApp */}
          <div className="px-5 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Image src="/whatsapp.png" alt="" width={16} height={16} className="h-4 w-4 object-contain" />
                <span className="text-sm">WhatsApp</span>
              </div>
              <Toggle checked={prefs.channelWhatsapp} disabled={!prefs.enabled || !hasWhatsapp} onChange={setWhatsappChannel} />
            </div>
            {!hasWhatsapp ? (
              <p className="mt-2 text-xs text-slate-400">
                Add a WhatsApp number to enable this.{" "}
                {onGoToWhatsapp && (
                  <button onClick={onGoToWhatsapp} className="font-medium text-[#4cc9f0] hover:underline">Add number</button>
                )}
              </p>
            ) : prefs.channelWhatsapp && (
              <div className="mt-2.5">
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-400">Send to</label>
                <WhatsappNumberPicker
                  numbers={waNumbers}
                  value={prefs.notifyWhatsappNumberId}
                  onChange={(id) => void store.setNotificationPrefs({ notifyWhatsappNumberId: id })}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Event notice period */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-800/50">
          <Clock className="h-4 w-4 text-slate-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Calendar events</span>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm">Notify me before events start</p>
          <NoticeSlider
            key={prefs.eventNoticeMinutes}
            value={prefs.eventNoticeMinutes}
            disabled={!prefs.enabled}
            onCommit={(v) => void store.setNotificationPrefs({ eventNoticeMinutes: v })}
          />
        </div>
      </div>
    </div>
  );
}

function RulesSection() {
  const store = useSettingsStore();
  if (store.rules.length === 0) return <Empty>No rules yet.</Empty>;
  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {store.rules.map((r) => (
        <div key={r.id} className="flex items-center gap-3 px-5 py-3.5">
          <AtSign className="h-4 w-4 shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{r.senderPattern}</div>
            <div className="text-xs text-slate-500">
              {emailRuleActionLabel(r.action)}
              {r.notify ? " · notify" : ""}
            </div>
          </div>
          <IconButton onClick={() => store.deleteEmailRule(r.id)} label="Delete rule">
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </div>
      ))}
    </div>
  );
}

function AgendaSection() {
  const store = useSettingsStore();
  if (store.reminders.length === 0)
    return <Empty>Nothing scheduled yet.</Empty>;
  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {store.reminders.map((r) => (
        <div key={r.id} className="flex items-center gap-3 px-5 py-3.5">
          <Clock className="h-4 w-4 shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{r.message}</div>
            <div className="text-xs text-slate-500">
              {format(new Date(r.fireAt), "EEE d MMM, HH:mm")}
            </div>
          </div>
          <IconButton onClick={() => store.deleteReminder(r.id)} label="Delete">
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </div>
      ))}
    </div>
  );
}

function IconButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-slate-400">{children}</p>;
}

function AddRuleDialog({ onClose }: { onClose: () => void }) {
  const addEmailRule = useSettingsStore((s) => s.addEmailRule);
  const [pattern, setPattern] = useState("");
  const [action, setAction] = useState<EmailRuleAction>(EMAIL_RULE_ACTIONS[0]);
  const [notify, setNotify] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <h3 className="text-lg font-semibold">Add email rule</h3>
        <label className="mt-4 block text-sm">Sender</label>
        <input
          autoFocus
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="name@example.com or @domain.com"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[#4cc9f0] dark:border-slate-700 dark:bg-slate-800"
        />
        <label className="mt-4 block text-sm">Action</label>
        <Select
          value={action}
          onChange={setAction}
          options={EMAIL_RULE_ACTIONS.map((a) => ({ value: a, label: emailRuleActionLabel(a), icon: emailRuleActionIcon(a) }))}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
        />
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Notify me
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!pattern.trim()) return;
              void addEmailRule({ senderPattern: pattern.trim(), action, notify });
              onClose();
            }}
            className="cursor-pointer rounded-lg bg-[#4cc9f0] px-4 py-1.5 text-sm font-medium text-white"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
