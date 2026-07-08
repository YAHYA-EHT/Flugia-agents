"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Mic, ArrowUp, Loader2, Trash2, CornerDownLeft, Square, Plus, MessageSquare, MessagesSquare, PanelLeftClose } from "lucide-react";
import { getApi } from "@/lib/aria";
import type { ConversationSummary, SuggestedReply } from "@/lib/aria/types";
import { useChatStore } from "@/lib/aria/state/chatStore";
import { useVoiceRecorder } from "@/lib/aria/useVoiceRecorder";
import { MessageBubble } from "./MessageBubble";
import { PendingActionBanner } from "./PendingActionBanner";
import { EmailReferences } from "./EmailReferences";
import { Skeleton } from "./Skeleton";
import { AiOrb } from "./AiOrb";
import { ConfirmDialog } from "./ConfirmDialog";

const SUGGESTIONS = [
  "Summarize my unread emails",
  "What's on my calendar today?",
  "Remind me to call the supplier at 3pm",
];

export function ChatScreen() {
  const {
    messages, pendingAction, sending, historyLoaded, hasMore, loadingMore,
    conversations, conversationId,
    loadMoreHistory, loadConversations, switchConversation, newConversation, removeConversation,
    sendMessage, applySuggestion, resolvePendingAction, retryFailedAction,
  } = useChatStore();

  const [text, setText] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [agentName, setAgentName] = useState("Aria");
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef(0);
  const initialScrolledRef = useRef(false);

  const voice = useVoiceRecorder((transcript) => {
    void sendMessage(transcript);
  });

  useEffect(() => {
    void getApi().getUserStatus().then((s) => setGmailConnected(s.gmailConnected));
    void getApi().getAgentProfile().then((p) => { if (p.agentName) setAgentName(p.agentName); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (gmailConnected) {
      // Default to a fresh, empty conversation — past ones live in the sidebar.
      newConversation();
      void loadConversations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmailConnected]);

  // Re-run the initial scroll-to-bottom when the conversation changes.
  useEffect(() => {
    initialScrolledRef.current = false;
  }, [conversationId]);

  // Instant scroll-to-bottom on first load (runs after DOM is updated)
  useLayoutEffect(() => {
    if (historyLoaded && messages.length > 0 && !initialScrolledRef.current) {
      const el = scrollRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
        initialScrolledRef.current = true;
      }
    }
  }, [historyLoaded, messages.length]);

  // Smooth scroll-to-bottom when a new message is added during the session
  useEffect(() => {
    if (!initialScrolledRef.current || loadingMore) return;
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // Preserve scroll position when prepending older messages
  useEffect(() => {
    if (loadingMore) {
      prevScrollHeightRef.current = scrollRef.current?.scrollHeight ?? 0;
    } else if (prevScrollHeightRef.current && scrollRef.current) {
      const diff = scrollRef.current.scrollHeight - prevScrollHeightRef.current;
      scrollRef.current.scrollTop += diff;
      prevScrollHeightRef.current = 0;
    }
  }, [loadingMore, messages.length]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el || !hasMore || loadingMore) return;
    if (el.scrollTop < 80) void loadMoreHistory();
  }

  async function submit(value?: string) {
    const t = (value ?? text).trim();
    if (!t) return;
    setText("");
    await sendMessage(t);
  }

  if (gmailConnected === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
      </div>
    );
  }

  if (!gmailConnected) return <SetupRequired agentName={agentName} />;

  const isRecording = voice.state === "recording";
  const isTranscribing = voice.state === "transcribing";

  return (
    <div className="flex h-full min-h-0">
      <ConversationsPanel
        conversations={conversations}
        activeId={conversationId}
        open={panelOpen}
        onToggle={() => setPanelOpen((v) => !v)}
        onSelect={(id) => void switchConversation(id)}
        onNew={() => newConversation()}
        onDelete={(id) => setDeleteId(id)}
      />
      <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto" onScroll={handleScroll}>
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          {!historyLoaded ? (
            <ChatSkeleton />
          ) : messages.length === 0 ? (
            // "Hi, I'm Aria" only for a brand-new user with no conversations yet.
            // Keyed on conversationId so the entrance animation replays on "New chat".
            <EmptyState key={conversationId} onPick={(s) => submit(s)} minimal={conversations.length > 0} agentName={agentName} />
          ) : (
            <>
              {/* Load-more indicator at top */}
              {(hasMore || loadingMore) && (
                <div className="flex justify-center pb-4">
                  {loadingMore ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                  ) : (
                    <button
                      onClick={() => void loadMoreHistory()}
                      className="text-xs text-slate-400 hover:text-slate-600 transition"
                    >
                      Load older messages
                    </button>
                  )}
                </div>
              )}

              {messages.map((m, i) => (
                <div key={m.id ?? i} className="mb-1">
                  <MessageBubble
                    message={m}
                    onRetry={(s) => void applySuggestion(s)}
                    onRetryAction={(a) => retryFailedAction(a)}
                  />
                  {m.role === "assistant" && m.references?.length ? (
                    <div className="flex justify-start px-3 mt-1">
                      <div className="w-full max-w-[85%]">
                        <EmailReferences refs={m.references} />
                      </div>
                    </div>
                  ) : null}
                  {m.role === "assistant" && m.suggestions?.length && i === messages.length - 1 ? (
                    <SuggestionChips suggestions={m.suggestions} onApply={applySuggestion} />
                  ) : null}
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-slate-200 dark:border-slate-800">
        <div className="mx-auto w-full max-w-3xl px-4 py-3">
          {pendingAction && (
            <div className="mb-3">
              <PendingActionBanner
                action={pendingAction}
                onCancel={() => resolvePendingAction(false)}
                onConfirm={(opts) => resolvePendingAction(true, opts)}
              />
            </div>
          )}

          {isRecording || isTranscribing ? (
            <RecordingBar
              state={voice.state}
              duration={voice.duration}
              onStop={voice.stop}
            />
          ) : (
            <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm focus-within:ring-2 focus-within:ring-brand-strong dark:border-slate-700 dark:bg-slate-900">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submit();
                  }
                }}
                rows={1}
                placeholder={`Ask ${agentName} anything…`}
                className="max-h-40 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none"
              />
              {voice.supported && (
                <button
                  onClick={() => void voice.start()}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Voice input"
                  aria-label="Voice input"
                >
                  <Mic className="h-5 w-5" />
                </button>
              )}
              <button
                onClick={() => void submit()}
                disabled={sending || !text.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white transition hover:bg-brand-600 disabled:opacity-40"
                aria-label="Send"
              >
                {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
              </button>
            </div>
          )}

          {!isRecording && !isTranscribing && (
            <p className="mt-1.5 px-1 text-xs text-slate-400">
              Enter to send · Shift+Enter for a new line
            </p>
          )}
        </div>
      </div>
      </div>{/* /chat column */}

      {/* Delete-conversation confirmation */}
      <ConfirmDialog
        open={deleteId !== null}
        title="Delete this conversation?"
        message={
          <>
            &ldquo;{conversations.find((c) => c.conversationId === deleteId)?.title ?? "This chat"}&rdquo; will be
            permanently deleted — from your device and our database. This can&apos;t be undone.
          </>
        }
        onCancel={() => setDeleteId(null)}
        onConfirm={() => { const id = deleteId; setDeleteId(null); if (id) void removeConversation(id); }}
      />
    </div>
  );
}

// ── Conversations history panel ───────────────────────────────────────────────

function relTime(iso?: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ConversationsPanel({
  conversations,
  activeId,
  open,
  onToggle,
  onSelect,
  onNew,
  onDelete,
}: {
  conversations: ConversationSummary[];
  activeId?: string;
  open: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside
      className={`relative hidden shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-gray-50/50 transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] md:flex ${
        open ? "w-60" : "w-12"
      }`}
    >
      {/* Collapsed rail */}
      <div
        className={`absolute inset-0 flex flex-col items-center gap-2 py-3 transition-opacity duration-150 ${
          open ? "pointer-events-none opacity-0" : "opacity-100 delay-150"
        }`}
      >
        <button
          onClick={onToggle}
          title="Show chats"
          aria-label="Show chats"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-slate-600 transition hover:bg-gray-200"
        >
          <MessagesSquare className="h-4 w-4" />
        </button>
        <button
          onClick={onNew}
          title="New chat"
          aria-label="New chat"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4cc9f0] text-white shadow-sm transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Expanded panel */}
      <div
        className={`absolute inset-0 flex min-w-60 flex-col transition-opacity duration-150 ${
          open ? "opacity-100 delay-150" : "pointer-events-none opacity-0"
        }`}
      >
        <div className="flex items-center justify-between px-3 py-3">
          <div className="flex items-center gap-1.5">
            <button
              onClick={onToggle}
              title="Hide chats"
              aria-label="Hide chats"
              className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-gray-100 hover:text-slate-600"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Chats</span>
          </div>
          <button
            onClick={onNew}
            title="New chat"
            aria-label="New chat"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#4cc9f0] text-white shadow-sm transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {conversations.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-slate-400">No conversations yet</p>
          ) : (
            <div className="space-y-0.5">
              {conversations.map((c) => {
                const active = c.conversationId === activeId;
                return (
                  <div
                    key={c.conversationId}
                    onClick={() => onSelect(c.conversationId)}
                    className={`group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 transition ${
                      active ? "bg-[#4cc9f0]/10" : "hover:bg-gray-100"
                    }`}
                  >
                    <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${active ? "text-[#4cc9f0]" : "text-slate-400"}`} />
                    <p className={`min-w-0 flex-1 truncate text-[13px] ${active ? "font-semibold text-[#4cc9f0]" : "text-slate-700"}`}>
                      {c.title}
                    </p>
                    {/* fixed-height slot so the row doesn't grow when the trash button appears */}
                    <span className="flex h-6 w-9 shrink-0 items-center justify-end">
                      <span className="text-[10px] text-slate-400 group-hover:hidden">{relTime(c.lastAt)}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(c.conversationId); }}
                        title="Delete conversation"
                        aria-label="Delete conversation"
                        className="hidden h-6 w-6 items-center justify-center rounded text-slate-400 transition hover:bg-red-50 hover:text-red-500 group-hover:flex"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

// ── Recording bar ────────────────────────────────────────────────────────────

function RecordingBar({ state, duration, onStop }: {
  state: import("@/lib/aria/useVoiceRecorder").VoiceState;
  duration: number;
  onStop: () => void;
}) {
  const mins = String(Math.floor(duration / 60)).padStart(2, "0");
  const secs = String(duration % 60).padStart(2, "0");

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      {state === "transcribing" ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-slate-400 shrink-0" />
          <span className="flex-1 text-sm text-slate-400">Transcribing…</span>
        </>
      ) : (
        <>
          {/* Pulsing dot */}
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
          </span>

          {/* Waveform bars */}
          <div className="flex flex-1 items-center gap-[3px]">
            {Array.from({ length: 24 }).map((_, i) => (
              <span
                key={i}
                className="inline-block w-[3px] rounded-full bg-brand-strong/60"
                style={{
                  height: `${8 + Math.sin(i * 0.7 + Date.now() / 200) * 6 + Math.random() * 6}px`,
                  animation: `aria-bar-wave ${0.6 + (i % 4) * 0.15}s ease-in-out infinite alternate`,
                  animationDelay: `${(i % 6) * 0.08}s`,
                }}
              />
            ))}
          </div>

          {/* Timer */}
          <span className="shrink-0 font-mono text-sm tabular-nums text-slate-500">
            {mins}:{secs}
          </span>

          {/* Stop */}
          <button
            onClick={onStop}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500 text-white transition hover:bg-red-600 active:scale-95"
            aria-label="Stop recording"
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
        </>
      )}
    </div>
  );
}

// ── Suggestion chips ─────────────────────────────────────────────────────────

function SuggestionChips({
  suggestions,
  onApply,
}: {
  suggestions: SuggestedReply[];
  onApply: (s: SuggestedReply) => Promise<void>;
}) {
  const [loadingIdx, setLoadingIdx] = useState<number | null>(null);
  const [done, setDone] = useState(false);

  if (done) return null;

  return (
    <div className="flex justify-start px-3 pb-2 pt-2">
      <div className="w-full max-w-[85%]">
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
          Suggested replies
        </p>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s, i) => (
            <button
              key={i}
              disabled={loadingIdx !== null}
              onClick={async () => {
                setLoadingIdx(i);
                try {
                  await onApply(s);
                  setDone(true);
                } finally {
                  setLoadingIdx(null);
                }
              }}
              className="flex items-center gap-1.5 rounded-full border border-brand-strong/25 bg-brand-strong/5 px-3 py-1.5 text-xs font-medium text-brand-strong transition hover:bg-brand-strong/10 active:scale-95 disabled:opacity-50"
            >
              {loadingIdx === i ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CornerDownLeft className="h-3 w-3 shrink-0 opacity-60" />
              )}
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Setup / empty ─────────────────────────────────────────────────────────────

function SetupRequired({ agentName }: { agentName: string }) {
  const [busy, setBusy] = useState(false);

  async function connectGmail() {
    // Feature-level connection: attaches Gmail to the logged-in user and
    // persists tokens server-side. Not tied to the platform session.
    setBusy(true);
    try {
      const { redirectUrl } = await getApi().connectGmailFeature(window.location.href);
      window.location.href = redirectUrl;
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
      <AiOrb size={264} />
      <h2 className="mt-4 text-lg font-semibold text-gray-900">Set up {agentName} first</h2>
      <p className="mt-2 max-w-xs text-sm text-slate-500">
        Connect your Google account so {agentName} can read your inbox, manage your calendar, and set reminders on your behalf.
      </p>
      <button
        onClick={connectGmail}
        disabled={busy}
        className="mt-6 flex items-center gap-2 rounded-xl bg-[#4cc9f0] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src="/google-white-icon.webp" alt="Google" className="h-4 w-4 object-contain" />
        )}
        Continue with Google
      </button>
      <p className="mt-3 text-xs text-slate-400">
        You&apos;ll be redirected to Google to grant access — just once.
      </p>
    </div>
  );
}

function ChatSkeleton() {
  // Alternating message-bubble placeholders while history loads.
  const rows: ("left" | "right")[] = ["left", "right", "left", "right", "left"];
  return (
    <div className="space-y-5 py-2">
      {rows.map((side, i) => (
        <div key={i} className={`flex ${side === "right" ? "justify-end" : "justify-start"}`}>
          <div className={`space-y-2 ${side === "right" ? "items-end" : "items-start"}`}>
            <Skeleton
              className="h-10 rounded-2xl"
              style={{ width: side === "right" ? 180 + (i % 3) * 30 : 240 - (i % 2) * 40 }}
            />
            {side === "left" && i % 2 === 0 && (
              <Skeleton className="h-10 rounded-2xl" style={{ width: 160 }} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onPick, minimal = false, agentName = "Aria" }: { onPick: (s: string) => void; minimal?: boolean; agentName?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center py-16 text-center">
      {minimal ? (
        <>
          <div className="animate-orb-pop"><AiOrb size={156} /></div>
          <h2 className="animate-bubble-up mt-4 text-lg font-semibold" style={{ animationDelay: "140ms" }}>New chat</h2>
          <p className="animate-bubble-up mt-1 text-sm text-slate-500 dark:text-slate-400" style={{ animationDelay: "200ms" }}>
            Ask about your inbox, calendar, or set a reminder.
          </p>
        </>
      ) : (
        <>
          <div className="animate-orb-pop"><AiOrb size={156} /></div>
          <h2 className="animate-bubble-up mt-4 text-xl font-semibold" style={{ animationDelay: "140ms" }}>Hi, I&apos;m {agentName}</h2>
          <p className="animate-bubble-up mt-1 text-sm text-slate-500 dark:text-slate-400" style={{ animationDelay: "200ms" }}>
            Ask about your inbox, calendar, or set a reminder.
          </p>
        </>
      )}
      {/* Suggestion chips only for a virgin agent (no conversations yet). */}
      {!minimal && (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={s}
              onClick={() => onPick(s)}
              className="animate-bubble-up rounded-full border border-slate-200 px-3.5 py-1.5 text-sm text-slate-600 transition hover:border-brand-strong/40 hover:bg-brand-strong/5 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              style={{ animationDelay: `${260 + i * 70}ms` }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
