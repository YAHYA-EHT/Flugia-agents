import { create } from "zustand";
import { ApiException } from "@/lib/aria/api";
import { getApi } from "@/lib/aria";
import type { ActionData, ChatMessage, ConversationSummary, PendingAction, SuggestedReply } from "@/lib/aria/types";
import { useSettingsStore } from "./settingsStore";

let typingSeq = 0;

const CONV_KEY = "aria_conversation_id";

function saveConvId(id: string) {
  if (typeof localStorage !== "undefined") localStorage.setItem(CONV_KEY, id);
}
function loadConvId(): string | undefined {
  if (typeof localStorage === "undefined") return undefined;
  return localStorage.getItem(CONV_KEY) ?? undefined;
}
function clearConvId() {
  if (typeof localStorage !== "undefined") localStorage.removeItem(CONV_KEY);
}

function actionTypeLabel(actionType: string): string {
  const map: Record<string, string> = {
    reply_email: "Reply sent",
    send_email: "Email sent",
    draft_email: "Draft saved",
    block_sender: "Sender blocked",
    mark_read: "Marked as read",
    archive_email: "Email archived",
    create_event: "Event created",
    delete_event: "Event deleted",
    schedule_reminder: "Reminder scheduled",
  };
  return map[actionType] ?? "Done";
}

function actionDataFromPending(action: PendingAction): ActionData {
  const p = action.payload ?? {};
  const str = (v: unknown) => (v != null ? String(v).trim() : "");
  return {
    label: actionTypeLabel(action.actionType),
    to: str(p.to ?? p.sender_email ?? p.summary ?? ""),
    subject: str(p.subject ?? p.summary ?? p.message ?? ""),
    bodyPreview: str(p.body ?? p.message ?? "").slice(0, 200),
  };
}

interface ChatState {
  messages: ChatMessage[];
  conversationId?: string;
  conversations: ConversationSummary[];
  pendingAction: PendingAction | null;
  sending: boolean;
  historyLoaded: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  error: string | null;
  loadHistory: () => Promise<void>;
  loadMoreHistory: () => Promise<void>;
  loadConversations: () => Promise<void>;
  switchConversation: (id: string) => Promise<void>;
  newConversation: () => void;
  removeConversation: (id: string) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  applySuggestion: (s: SuggestedReply) => Promise<void>;
  resolvePendingAction: (
    approved: boolean,
    opts?: { alwaysAllow?: boolean; payloadOverride?: Record<string, unknown>; saveAsDraft?: boolean },
  ) => Promise<void>;
  retryFailedAction: (action: PendingAction) => void;
  setPendingActionFromPush: (action: PendingAction) => void;
  clearConversation: () => Promise<void>;
}

const browserLocale = () =>
  typeof navigator !== "undefined"
    ? navigator.language.split("-")[0]
    : undefined;

const browserTimezone = () =>
  typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : undefined;

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  conversationId: loadConvId(),
  conversations: [],
  pendingAction: null,
  sending: false,
  historyLoaded: false,
  hasMore: false,
  loadingMore: false,
  error: null,

  loadHistory: async () => {
    if (get().historyLoaded) return;
    try {
      const h = await getApi().getHistory({ limit: 10, conversationId: get().conversationId });
      const messages: ChatMessage[] = h.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
          createdAt: m.createdAt,
          isAction: m.isAction ?? false,
          actionCancelled: m.actionCancelled ?? false,
          actionError: m.actionError,
          actionData: m.actionData,
          failedAction: m.failedAction,
          suggestions: m.suggestions,
        }));
      saveConvId(h.conversationId);
      set({ conversationId: h.conversationId, messages, historyLoaded: true, hasMore: h.hasMore });
    } catch {
      set({ historyLoaded: true });
    }
  },

  loadMoreHistory: async () => {
    if (!get().hasMore || get().loadingMore) return;
    const oldest = get().messages[0]?.createdAt;
    if (!oldest) return;
    set({ loadingMore: true });
    try {
      const h = await getApi().getHistory({ limit: 10, before: oldest, conversationId: get().conversationId });
      const older: ChatMessage[] = h.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
          createdAt: m.createdAt,
          isAction: m.isAction ?? false,
          actionCancelled: m.actionCancelled ?? false,
          actionError: m.actionError,
          actionData: m.actionData,
          failedAction: m.failedAction,
          suggestions: m.suggestions,
        }));
      set((s) => ({ messages: [...older, ...s.messages], hasMore: h.hasMore }));
    } catch {
      /* silent — user can scroll up again */
    } finally {
      set({ loadingMore: false });
    }
  },

  loadConversations: async () => {
    try {
      const conversations = await getApi().listConversations();
      set({ conversations });
    } catch {
      /* non-fatal — sidebar stays as-is */
    }
  },

  switchConversation: async (id) => {
    if (id === get().conversationId && get().historyLoaded) return;
    saveConvId(id);
    set({ conversationId: id, messages: [], pendingAction: null, error: null, historyLoaded: false, hasMore: false });
    await get().loadHistory();
  },

  newConversation: () => {
    clearConvId();
    set({ conversationId: undefined, messages: [], pendingAction: null, error: null, historyLoaded: true, hasMore: false });
  },

  removeConversation: async (id) => {
    try { await getApi().deleteConversation(id); } catch { /* best-effort */ }
    const wasActive = get().conversationId === id;
    const remaining = get().conversations.filter((c) => c.conversationId !== id);
    set({ conversations: remaining });
    if (wasActive) {
      if (remaining.length > 0) {
        await get().switchConversation(remaining[0].conversationId);
      } else {
        get().newConversation();
      }
    }
  },

  sendMessage: async (text) => {
    const trimmed = text.trim();
    if (!trimmed || get().sending) return;

    const typingId = `typing-${++typingSeq}`;
    set((s) => ({
      error: null,
      sending: true,
      messages: [
        ...s.messages,
        { role: "user", content: trimmed, createdAt: new Date().toISOString() },
        { id: typingId, role: "assistant", content: "", pending: true, createdAt: new Date().toISOString() },
      ],
    }));

    const patchTyping = (patch: Partial<ChatMessage>) =>
      set((s) => ({ messages: s.messages.map((m) => (m.id === typingId ? { ...m, ...patch } : m)) }));

    try {
      const prevConvId = get().conversationId;
      const result = await getApi().chatStream(
        {
          message: trimmed,
          conversationId: prevConvId,
          locale: browserLocale(),
          timezone: browserTimezone(),
        },
        {
          onStart: (cid) => { saveConvId(cid); set({ conversationId: cid }); },
          onStatus: (msg) => patchTyping({ statusText: msg, pending: true }),
          onDelta: (delta) =>
            set((s) => ({
              messages: s.messages.map((m) =>
                m.id === typingId ? { ...m, content: m.content + delta, statusText: undefined, pending: true } : m,
              ),
            })),
          onReset: () => patchTyping({ content: "", statusText: undefined }),
        },
      );
      const isNewConversation = prevConvId !== result.conversationId;
      saveConvId(result.conversationId);
      set((s) => ({
        conversationId: result.conversationId,
        pendingAction: result.pendingAction ?? null,
        messages: s.messages.map((m) =>
          m.id === typingId
            ? {
                ...m,
                content: result.reply,
                pending: false,
                statusText: undefined,
                references: result.references,
                suggestions: result.suggestions,
                isAction: result.isAction ?? false,
                actionData: result.actionData,
              }
            : m,
        ),
      }));
      // Refresh the history sidebar (new conversation appears / title updates).
      if (isNewConversation || !get().conversations.some((c) => c.conversationId === result.conversationId)) {
        void get().loadConversations();
        if (isNewConversation) {
          // The backend generates a real title from the first exchange in the
          // background (after this response already returned) — refetch once
          // more shortly after so it replaces the truncated placeholder title.
          setTimeout(() => void get().loadConversations(), 2500);
        }
      }
    } catch (e) {
      const msg = e instanceof ApiException ? e.message : String(e);
      set((s) => ({
        error: msg,
        messages: s.messages.map((m) =>
          m.id === typingId
            ? { ...m, pending: false, content: `Sorry — I couldn't reach the server just now. (${msg})` }
            : m,
        ),
      }));
    } finally {
      set({ sending: false });
    }
  },

  applySuggestion: async (suggestion) => {
    const typingId = `typing-${++typingSeq}`;
    set((s) => ({
      sending: true,
      messages: [
        ...s.messages,
        { id: typingId, role: "assistant", content: "", pending: true, isAction: true, createdAt: new Date().toISOString() },
      ],
    }));
    try {
      const result = await getApi().sendSuggestion(suggestion, get().conversationId);
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === typingId
            ? {
                ...m,
                content: result.message,
                pending: false,
                isAction: true,
                actionData: {
                  label: "Reply sent",
                  to: suggestion.to,
                  subject: suggestion.subject,
                  bodyPreview: suggestion.body.slice(0, 200),
                },
              }
            : m,
        ),
      }));
    } catch (e) {
      const msg = e instanceof ApiException ? e.message : String(e);
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === typingId
            ? {
                ...m,
                pending: false,
                isAction: true,
                actionError: msg,
                failedSuggestion: suggestion,
              }
            : m,
        ),
      }));
    } finally {
      set({ sending: false });
    }
  },

  resolvePendingAction: async (approved, opts = {}) => {
    const action = get().pendingAction;
    if (!action) return;
    set({ pendingAction: null });

    if (!approved) {
      set((s) => ({
        messages: [
          ...s.messages,
          {
            role: "assistant" as const,
            content: "",
            createdAt: new Date().toISOString(),
            isAction: true,
            actionCancelled: true,
            actionData: actionDataFromPending(action),
          },
        ],
      }));
      void getApi().confirm(action.id, false).catch(() => {/* best-effort */});
      return;
    }

    const { alwaysAllow, payloadOverride, saveAsDraft } = opts;
    const typingId = `typing-${++typingSeq}`;
    set((s) => ({
      messages: [
        ...s.messages,
        { id: typingId, role: "assistant", content: "", pending: true, isAction: true, createdAt: new Date().toISOString() },
      ],
    }));

    try {
      await getApi().confirm(action.id, true, { payloadOverride, saveAsDraft });
      if (alwaysAllow) {
        useSettingsStore.getState().setAutonomy(action.actionType, "auto");
      }
      // Build action data from the effective payload (merged with any overrides)
      const effectiveAction = payloadOverride
        ? { ...action, payload: { ...action.payload, ...payloadOverride } }
        : action;
      const baseData = actionDataFromPending(saveAsDraft ? { ...effectiveAction, actionType: "draft_email" } : effectiveAction);
      set((s) => ({
        messages: s.messages
          .filter((m) => m.failedAction?.id !== action.id)
          .map((m) =>
            m.id === typingId ? { ...m, pending: false, isAction: true, actionData: baseData } : m,
          ),
      }));
    } catch (e) {
      const msg = e instanceof ApiException ? e.message : String(e);
      const failedAction = action;
      set((s) => ({
        error: msg,
        messages: s.messages.map((m) =>
          m.id === typingId ? { ...m, pending: false, isAction: true, actionError: msg, failedAction } : m,
        ),
      }));
    }
  },

  retryFailedAction: (action) => {
    set((s) => ({
      pendingAction: action,
      error: null,
      messages: s.messages.filter((m) => m.failedAction?.id !== action.id),
    }));
  },

  setPendingActionFromPush: (action) => set({ pendingAction: action }),

  clearConversation: async () => {
    const id = get().conversationId;
    if (id) {
      await get().removeConversation(id);
    } else {
      get().newConversation();
    }
  },
}));
