import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertTriangle, CheckCircle2, FileText, X } from "lucide-react";
import type { ChatMessage, PendingAction, SuggestedReply } from "@/lib/aria/types";
import { AiOrb } from "./AiOrb";

export function MessageBubble({
  message,
  onRetry,
  onRetryAction,
}: {
  message: ChatMessage;
  onRetry?: (suggestion: SuggestedReply) => void;
  onRetryAction?: (action: PendingAction) => void;
}) {
  const isUser = message.role === "user";

  if (message.isAction) {
    const d = message.actionData;
    const isDraft = d?.label === "Draft saved";

    // Cancelled chip
    if (message.actionCancelled) {
      const cancelledLabel = cancelledActionLabel(d?.label ?? "");
      return (
        <div className="flex justify-center px-3 py-3">
          <div className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-3.5 py-1.5 text-xs font-medium text-stone-400 dark:border-stone-700/60 dark:bg-stone-800/40 dark:text-stone-500">
            <X className="h-3 w-3 shrink-0" />
            {cancelledLabel}
          </div>
        </div>
      );
    }

    // Error card
    if (message.actionError) {
      return (
        <div className="flex justify-center px-3 py-3">
          <div className="w-full max-w-sm overflow-hidden rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/30">
            <div className="flex items-start gap-3 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Action failed</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-amber-600/80 dark:text-amber-400/80">
                  {message.actionError}
                </p>
              </div>
            </div>
            {((message.failedSuggestion && onRetry) || (message.failedAction && onRetryAction)) && (
              <div className="border-t border-amber-200/70 px-4 py-2.5 dark:border-amber-800/40">
                <button
                  onClick={() => {
                    if (message.failedAction && onRetryAction) onRetryAction(message.failedAction);
                    else if (message.failedSuggestion && onRetry) onRetry(message.failedSuggestion);
                  }}
                  className="text-xs font-medium text-amber-600 transition hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (message.pending || !d) {
      return (
        <div className="flex justify-center px-3 py-3">
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent dark:border-slate-500" />
            {isDraft ? "Saving draft…" : "Sending…"}
          </div>
        </div>
      );
    }

    if (isDraft) {
      return (
        <div className="flex justify-center px-3 py-3">
          <div className="w-full max-w-sm overflow-hidden rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/30">
            <div className="flex items-center gap-2 border-b border-amber-200 px-4 py-2.5 dark:border-amber-800/40">
              <FileText className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
              <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                {d.label}
              </span>
              <span className="ml-auto rounded-full bg-amber-200/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:bg-amber-800/40 dark:text-amber-400">
                Draft
              </span>
            </div>
            <ActionFields
              to={d.to}
              subject={d.subject}
              bodyPreview={d.bodyPreview}
              prependRe={false}
              textClass="text-amber-800 dark:text-amber-300"
            />
          </div>
        </div>
      );
    }

    return (
      <div className="flex justify-center px-3 py-3">
        <div className="w-full max-w-sm overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2 border-b border-emerald-200 px-4 py-2.5 dark:border-emerald-800/40">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              {d.label}
            </span>
          </div>
          <ActionFields
            to={d.to}
            subject={d.label === "Reply sent" ? "" : d.subject}
            bodyPreview={d.bodyPreview}
            prependRe={false}
            textClass="text-emerald-800 dark:text-emerald-300"
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-2 px-3 py-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && <AiOrb size={30} interactive={false} className="mt-0.5" />}
      <div
        className={[
          "max-w-[80%] rounded-2xl px-4 py-2.5",
          isUser
            ? "bg-brand-500 text-white rounded-tr-sm"
            : "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 rounded-tl-sm dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700",
        ].join(" ")}
      >
        {message.pending ? (
          message.content ? (
            // Streaming: show partial reply as it arrives, with a live cursor.
            <div className="md-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
              <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-slate-400" />
            </div>
          ) : message.statusText ? (
            <StatusLine text={message.statusText} />
          ) : (
            <TypingDots />
          )
        ) : isUser ? (
          <span className="text-[15px] leading-relaxed whitespace-pre-wrap">
            {message.content}
          </span>
        ) : (
          <div className="md-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
      {isUser && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/profile.png" alt="You" className="mt-0.5 h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700" />
      )}
    </div>
  );
}

function ActionFields({
  to,
  subject,
  bodyPreview,
  prependRe,
  textClass,
}: {
  to: string;
  subject: string;
  bodyPreview: string;
  prependRe: boolean;
  textClass: string;
}) {
  const displaySubject = subject ? (prependRe ? `Re: ${subject}` : subject) : "—";
  return (
    <div className={`space-y-1.5 px-4 py-3 text-xs ${textClass}`}>
      {to && (
        <div className="flex gap-2">
          <span className="w-14 shrink-0 font-medium opacity-60">To</span>
          <span className="truncate">{to}</span>
        </div>
      )}
      <div className="flex gap-2">
        <span className="w-14 shrink-0 font-medium opacity-60">Subject</span>
        <span className="truncate">{displaySubject}</span>
      </div>
      {bodyPreview && (
        <div className="flex gap-2">
          <span className="w-14 shrink-0 font-medium opacity-60">Message</span>
          <span className="line-clamp-2 leading-relaxed opacity-80">{bodyPreview}</span>
        </div>
      )}
    </div>
  );
}

function cancelledActionLabel(completedLabel: string): string {
  const map: Record<string, string> = {
    "Reply sent":          "Reply cancelled",
    "Email sent":          "Email cancelled",
    "Draft saved":         "Draft discarded",
    "Sender blocked":      "Block cancelled",
    "Marked as read":      "Mark as read — cancelled",
    "Email archived":      "Archive cancelled",
    "Event created":       "Event cancelled",
    "Event deleted":       "Delete cancelled",
    "Reminder scheduled":  "Reminder cancelled",
  };
  return map[completedLabel] ?? "Action cancelled";
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      {[0, 150, 300].map((d) => (
        <span
          key={d}
          className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce"
          style={{ animationDelay: `${d}ms` }}
        />
      ))}
    </span>
  );
}

function StatusLine({ text }: { text: string }) {
  // Tool-progress indicator shown while the agent is working (before text streams).
  return (
    <span className="inline-flex items-center gap-2 py-0.5 text-[13px] text-slate-500 dark:text-slate-400">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#4cc9f0] border-t-transparent" />
      {text}
    </span>
  );
}
