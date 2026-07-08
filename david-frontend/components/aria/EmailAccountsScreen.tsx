"use client";

import { useEffect, useState } from "react";
import {
  Mail,
  Trash2,
  Loader2,
  ToggleLeft,
  ToggleRight,
  X,
  Plus,
} from "lucide-react";
import { getApi } from "@/lib/aria";
import { getRuntimeConfig } from "@/lib/aria/config";
import { tokenStorage } from "@/lib/aria/tokenStorage";
import type { EmailAccount } from "@/lib/aria/types";
import { SkeletonCard } from "./Skeleton";
import { ConfirmDialog } from "./ConfirmDialog";

// ─── Account Avatar ───────────────────────────────────────────────────────────

function AccountAvatar({ account }: { account: EmailAccount }) {
  const initials = (account.displayName ?? account.email)
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  if (account.pictureUrl) {
    return (
      <img
        src={account.pictureUrl}
        alt={account.displayName ?? account.email}
        className="h-9 w-9 shrink-0 rounded-xl object-cover"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-strong/10">
      {initials ? (
        <span className="text-xs font-semibold text-brand-strong">{initials}</span>
      ) : (
        <Mail className="h-4 w-4 text-brand-strong" />
      )}
    </div>
  );
}

// ─── Account Card ─────────────────────────────────────────────────────────────
// The agent's system prompt and knowledge bases are configured once for the
// whole agent during onboarding — no per-mailbox pipeline/KB config here.

function AccountCard({
  account,
  onUpdate,
  onDelete,
}: {
  account: EmailAccount;
  onUpdate: (id: string, patch: { isActive?: boolean }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function toggleActive() {
    await onUpdate(account.id, { isActive: !account.isActive });
  }

  async function handleDelete() {
    setConfirmDelete(false);
    setDeleting(true);
    await onDelete(account.id);
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 px-5 py-4">
          <AccountAvatar account={account} />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900">{account.email}</p>
            {account.displayName && (
              <p className="truncate text-xs text-gray-400">{account.displayName}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={toggleActive}
              title={account.isActive ? "Deactivate" : "Activate"}
              className="text-gray-400 transition hover:text-brand-strong"
            >
              {account.isActive ? (
                <ToggleRight className="h-5 w-5 text-brand-strong" />
              ) : (
                <ToggleLeft className="h-5 w-5" />
              )}
            </button>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                account.isActive
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {account.isActive ? "Active" : "Paused"}
            </span>
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={deleting}
              className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Remove this account?"
        message={<>&ldquo;{account.email}&rdquo; will be unlinked. This can&apos;t be undone.</>}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}

// ─── Add Account Modal ────────────────────────────────────────────────────────

function AddAccountModal({
  onAdd,
  onClose,
}: {
  onAdd: (email: string, displayName: string) => Promise<void>;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!email.trim()) return;
    setSaving(true);
    await onAdd(email.trim(), displayName.trim());
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <h3 className="font-semibold text-gray-900">Add email account</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="info@yourcompany.com"
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-brand-strong/50 focus:ring-2 focus:ring-brand-strong/10"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Display name <span className="text-gray-300">(optional)</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Info Mailbox"
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-brand-strong/50 focus:ring-2 focus:ring-brand-strong/10"
            />
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !email.trim()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-strong py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Add account
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function EmailAccountsScreen() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const isMock = getRuntimeConfig().useMockData;

  function loadData() {
    return getApi().listEmailAccounts().then((accs) => { setAccounts(accs); setLoading(false); });
  }

  useEffect(() => { void loadData(); }, []);

  // Detect return from Google OAuth (#account_linked=1)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.hash.includes("account_linked=1")) return;
    history.replaceState(null, "", window.location.pathname);
    setLoading(true);
    void loadData();
  }, []);

  async function linkWithGoogle() {
    setLinking(true);
    try {
      const base = getRuntimeConfig().apiBaseUrl;
      const returnTo = window.location.href.split("#")[0];
      const res = await fetch(
        `${base}/email-accounts/oauth/start?return_to=${encodeURIComponent(returnTo)}`,
        { headers: { Authorization: `Bearer ${tokenStorage.access ?? ""}` } },
      );
      const data = await res.json() as { redirect_url?: string };
      if (data.redirect_url) window.location.href = data.redirect_url;
    } catch {
      setLinking(false);
    }
  }

  async function handleUpdate(id: string, patch: { isActive?: boolean }) {
    const updated = await getApi().updateEmailAccount(id, patch);
    setAccounts((prev) => prev.map((a) => (a.id === id ? updated : a)));
  }

  async function handleDelete(id: string) {
    await getApi().deleteEmailAccount(id);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  }

  // Mock-only: manual add
  const [showAdd, setShowAdd] = useState(false);
  async function handleAdd(email: string, displayName: string) {
    const account = await getApi().createEmailAccount(email, displayName || undefined);
    setAccounts((prev) => [...prev, account]);
  }

  // mode="first"   → initial connection (empty state): "Continue with Google"
  // mode="another"  → header when accounts exist: "Add another account"
  const LinkButton = ({ className, mode = "first" }: { className?: string; mode?: "first" | "another" }) => {
    const another = mode === "another";
    if (isMock) {
      return (
        <button
          onClick={() => setShowAdd(true)}
          className={className ?? "flex items-center gap-2 rounded-xl bg-brand-strong px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"}
        >
          {another ? <Plus className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
          {another ? "Add another account (dev)" : "Add account (dev)"}
        </button>
      );
    }
    return (
      <button
        onClick={() => void linkWithGoogle()}
        disabled={linking}
        className={className ?? "flex items-center gap-2 rounded-xl bg-[#4cc9f0] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"}
      >
        {linking ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : another ? (
          <Plus className="h-4 w-4" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/google-white-icon.webp" alt="Google" className="h-4 w-4 object-contain" />
        )}
        {linking ? "Redirecting…" : another ? "Add another account" : "Continue with Google"}
      </button>
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-3.5">
        <div>
          <h1 className="text-sm font-bold leading-tight text-slate-900">Email Accounts</h1>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {accounts.length} account{accounts.length !== 1 ? "s" : ""} configured
          </p>
        </div>
        {!loading && accounts.length > 0 && <LinkButton mode="another" />}
      </div>

      <div className="p-6 space-y-4">
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center">
            <Mail className="h-10 w-10 text-gray-200" />
            <p className="mt-3 text-sm font-medium text-gray-400">No email accounts yet</p>
            <p className="mt-1 text-xs text-gray-300">
              Link a Google account so your assistant can read and send email
            </p>
            <div className="mt-4">
              <LinkButton />
            </div>
          </div>
        ) : (
          accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {showAdd && (
        <AddAccountModal onAdd={handleAdd} onClose={() => setShowAdd(false)} />
      )}
    </div>
  );
}
