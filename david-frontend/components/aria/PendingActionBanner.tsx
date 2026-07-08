"use client";

import { useRef, useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import type { PendingAction } from "@/lib/aria/types";

// ─── human labels ────────────────────────────────────────────────────────────

function title(actionType: string): string {
  switch (actionType) {
    case "reply_email":       return "Aria wants to send a reply";
    case "send_email":        return "Aria wants to send an email";
    case "draft_email":       return "Aria wants to save a draft";
    case "block_sender":      return "Aria wants to block a sender";
    case "mark_read":         return "Aria wants to mark an email as read";
    case "archive_email":     return "Aria wants to archive an email";
    case "create_event":      return "Aria wants to create a calendar event";
    case "delete_event":      return "Aria wants to delete a calendar event";
    case "schedule_reminder": return "Aria wants to schedule a reminder";
    default:                  return "Aria wants to take an action";
  }
}

function alwaysLabel(actionType: string): string {
  switch (actionType) {
    case "reply_email":       return "Always send reply emails automatically, without asking me";
    case "send_email":        return "Always send new emails automatically, without asking me";
    case "draft_email":       return "Always save drafts automatically, without asking me";
    case "block_sender":      return "Always block senders automatically, without asking me";
    case "mark_read":         return "Always mark emails as read automatically, without asking me";
    case "archive_email":     return "Always archive emails automatically, without asking me";
    case "create_event":      return "Always create calendar events automatically, without asking me";
    case "delete_event":      return "Always delete calendar events automatically, without asking me";
    case "schedule_reminder": return "Always schedule reminders automatically, without asking me";
    default:                  return "Always perform this action automatically, without asking me";
  }
}

function confirmLabel(actionType: string): string {
  switch (actionType) {
    case "reply_email":
    case "send_email":        return "Send";
    case "draft_email":       return "Save draft";
    case "block_sender":      return "Block";
    case "mark_read":         return "Mark as read";
    case "archive_email":     return "Archive";
    case "create_event":      return "Create";
    case "delete_event":      return "Delete";
    case "schedule_reminder": return "Schedule";
    default:                  return "Confirm";
  }
}

const str = (v: unknown) => (v != null ? String(v).trim() : "");

// ─── component ───────────────────────────────────────────────────────────────

type ConfirmOpts = {
  alwaysAllow?: boolean;
  payloadOverride?: Record<string, unknown>;
  saveAsDraft?: boolean;
};

export function PendingActionBanner({
  action,
  onCancel,
  onConfirm,
}: {
  action: PendingAction;
  onCancel: () => void;
  onConfirm: (opts: ConfirmOpts) => void;
}) {
  const p = action.payload ?? {};
  const isEmail = ["reply_email", "send_email", "draft_email"].includes(action.actionType);
  const destructive = action.actionType === "block_sender" || action.actionType === "delete_event";

  // ── view state ──
  const [editMode, setEditMode] = useState(false);
  const [alwaysAllow, setAlwaysAllow] = useState(false);
  const [bodyExpanded, setBodyExpanded] = useState(false);

  // ── editable field state (email only) ──
  const [editTo, setEditTo] = useState(str(p.to ?? p.sender_email ?? ""));
  const [editSubject, setEditSubject] = useState(str(p.subject ?? p.summary ?? ""));
  const [editBody, setEditBody] = useState(str(p.body ?? p.message ?? ""));

  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function enterEdit() {
    setEditMode(true);
    setBodyExpanded(true);
    setTimeout(() => bodyRef.current?.focus(), 30);
  }

  function buildOverride(): Record<string, unknown> | undefined {
    if (!isEmail) return undefined;
    const orig = { to: str(p.to ?? ""), subject: str(p.subject ?? ""), body: str(p.body ?? "") };
    const changed = editTo !== orig.to || editSubject !== orig.subject || editBody !== orig.body;
    if (!changed) return undefined;
    return { to: editTo, subject: editSubject, body: editBody };
  }

  // ── non-email: simple view ──
  if (!isEmail) {
    const blockValue = str(p.sender_email ?? p.summary ?? p.message ?? "");
    return (
      <div className="animate-aria-slide-up overflow-hidden rounded-xl border border-stone-200 bg-[#faf9f6] shadow-sm dark:border-stone-700/60 dark:bg-[#1e1c19]">
        <div className="px-4 pt-4 pb-3">
          <p className="text-[13px] font-semibold text-stone-800 dark:text-stone-100">{title(action.actionType)}</p>
        </div>
        {blockValue && (
          <div className="mx-4 mb-4 rounded-lg border border-stone-200/70 bg-white/70 px-3.5 py-3 dark:border-stone-700/40 dark:bg-white/5">
            <p className="font-mono text-[12px] text-stone-500 dark:text-stone-400">{blockValue}</p>
          </div>
        )}
        <div className="border-t border-stone-100 px-4 py-3 dark:border-stone-700/40">
          <label className="mb-3 flex cursor-pointer items-center gap-2.5 select-none">
            <input
              type="checkbox"
              checked={alwaysAllow}
              onChange={(e) => setAlwaysAllow(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer rounded border-stone-300 accent-stone-800 dark:border-stone-600 dark:accent-stone-200"
            />
            <span className="text-[11px] text-stone-400 dark:text-stone-500">{alwaysLabel(action.actionType)}</span>
          </label>
          <div className="flex items-center justify-end gap-2">
            <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs font-medium text-stone-400 transition hover:text-stone-700 dark:text-stone-500 dark:hover:text-stone-200">
              Cancel
            </button>
            <button
              onClick={() => onConfirm({ alwaysAllow })}
              className={[
                "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition active:scale-[0.97]",
                destructive ? "bg-rose-600 text-white hover:bg-rose-500" : "bg-stone-800 text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white",
              ].join(" ")}
            >
              {confirmLabel(action.actionType)}
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── email: inline editable ──
  return (
    <div className="animate-aria-slide-up overflow-hidden rounded-xl border border-stone-200 bg-[#faf9f6] shadow-sm dark:border-stone-700/60 dark:bg-[#1e1c19]">
      {/* Title */}
      <div className="px-4 pt-4 pb-3">
        <p className="text-[13px] font-semibold text-stone-800 dark:text-stone-100">
          {title(action.actionType)}
        </p>
        {editMode && (
          <p className="mt-0.5 text-[11px] text-stone-400 dark:text-stone-500">
            Edit the content below, then choose to send or save as draft.
          </p>
        )}
      </div>

      {/* Content card */}
      <div className="mx-4 mb-4 overflow-hidden rounded-lg border border-stone-200/70 bg-white/70 dark:border-stone-700/40 dark:bg-white/5">
        {/* To */}
        <div className="flex items-center gap-3 border-b border-stone-100 px-3.5 py-2.5 dark:border-stone-700/40">
          <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">To</span>
          {editMode ? (
            <input
              value={editTo}
              onChange={(e) => setEditTo(e.target.value)}
              className="flex-1 bg-transparent text-[13px] text-stone-700 outline-none placeholder-stone-300 dark:text-stone-200"
              placeholder="recipient@example.com"
            />
          ) : (
            <span className="flex-1 truncate font-mono text-[12px] text-stone-500 dark:text-stone-400">{editTo || "—"}</span>
          )}
        </div>

        {/* Subject */}
        <div className="flex items-center gap-3 border-b border-stone-100 px-3.5 py-2.5 dark:border-stone-700/40">
          <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">Subject</span>
          {editMode ? (
            <input
              value={editSubject}
              onChange={(e) => setEditSubject(e.target.value)}
              className="flex-1 bg-transparent text-[13px] text-stone-700 outline-none placeholder-stone-300 dark:text-stone-200"
              placeholder="Subject line"
            />
          ) : (
            <span className="flex-1 truncate text-[13px] text-stone-700 dark:text-stone-200">{editSubject || "—"}</span>
          )}
        </div>

        {/* Body */}
        <div className="px-3.5 py-2.5">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">Body</span>
          {editMode ? (
            <textarea
              ref={bodyRef}
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={6}
              className="w-full resize-none bg-transparent text-[13px] leading-relaxed text-stone-700 outline-none placeholder-stone-300 dark:text-stone-200"
              placeholder="Email body…"
            />
          ) : (
            <>
              <p
                className={[
                  "whitespace-pre-line text-[13px] leading-relaxed text-stone-700 dark:text-stone-200",
                  bodyExpanded ? "" : "line-clamp-5",
                ].join(" ")}
              >
                {editBody || "—"}
              </p>
              {editBody.length > 0 && (
                <button
                  onClick={() => setBodyExpanded((v) => !v)}
                  className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-stone-400 transition hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
                >
                  {bodyExpanded ? (
                    <><ChevronUp className="h-3 w-3" />Show less</>
                  ) : (
                    <><ChevronDown className="h-3 w-3" />Show more</>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="border-t border-stone-100 px-4 py-3 dark:border-stone-700/40">
        {!editMode && (
          <label className="mb-3 flex cursor-pointer items-center gap-2.5 select-none">
            <input
              type="checkbox"
              checked={alwaysAllow}
              onChange={(e) => setAlwaysAllow(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer rounded border-stone-300 accent-stone-800 dark:border-stone-600 dark:accent-stone-200"
            />
            <span className="text-[11px] text-stone-400 dark:text-stone-500">{alwaysLabel(action.actionType)}</span>
          </label>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-stone-400 transition hover:text-stone-700 dark:text-stone-500 dark:hover:text-stone-200"
          >
            Cancel
          </button>

          {/* Save as draft — always visible for send-type actions */}
          {action.actionType !== "draft_email" && (
            <button
              onClick={() => onConfirm({ payloadOverride: buildOverride(), saveAsDraft: true })}
              className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-300 hover:bg-stone-50 active:scale-[0.97] dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
            >
              Save as draft
            </button>
          )}

          <div className="flex-1" />

          {/* Edit toggle */}
          {!editMode ? (
            <button
              onClick={enterEdit}
              className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-300 hover:bg-stone-50 active:scale-[0.97] dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
            >
              Edit
            </button>
          ) : (
            <button
              onClick={() => setEditMode(false)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-stone-400 transition hover:text-stone-700 dark:text-stone-500 dark:hover:text-stone-200"
            >
              Done
            </button>
          )}

          {/* Primary confirm */}
          <button
            onClick={() => onConfirm({ alwaysAllow: editMode ? false : alwaysAllow, payloadOverride: buildOverride() })}
            className="flex items-center gap-1.5 rounded-lg bg-stone-800 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-stone-700 active:scale-[0.97] dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
          >
            {confirmLabel(action.actionType)}
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
