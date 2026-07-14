"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowUp, Loader2, Plus, PanelLeftClose, MessagesSquare, MessageSquare, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { HandoffPanel, detectHandoff } from "@/components/shared/HandoffPanel";

// ── Types ─────────────────────────────────────────────────────
type Role = "user" | "assistant";
type SalesContext = "john" | "prospecting" | "campaigns";

interface Message {
  id: string;
  role: Role;
  content: string;
  pending?: boolean;
  tools?: string[];
  downloadUrl?: string;
  fileName?: string;
}

interface Conversation {
  id: string;
  context: SalesContext;
  title: string;
  updatedAt: string;
  messages: { role: Role; content: string }[];
}

// ── Config ────────────────────────────────────────────────────
const API = "http://localhost:8002";
const STORAGE_KEY = "flugia_conversations_sales_v1";

const CTX_CONFIG: Record<SalesContext, { label: string; welcome: string; chips: [string, string][] }> = {
  john:        { label: "Sales",       welcome: "Salut ! Je m'occupe de la partie commerciale. Je peux te montrer nos leads, l'état de nos campagnes, ou t'aider à réfléchir stratégie.", chips: [["Mes campagnes", "Montre-moi l'état de nos campagnes d'outreach"], ["Mes leads", "Combien de leads avons-nous et de quelle qualité ?"], ["Bilan global", "Fais-moi un bilan de la prospection"]] },
  prospecting: { label: "Prospecting", welcome: "Dans l'espace Prospecting. Je peux te montrer tes listes de leads ou en chercher un précis.", chips: [["Mes listes", "Montre-moi mes listes de leads"], ["Chercher un lead", "Cherche un lead par entreprise ou secteur"], ["Statut", "Quel est le statut de la feature Prospecting ?"]] },
  campaigns:   { label: "Campaigns",   welcome: "Dans l'espace Campaigns. On regarde l'état des campagnes en cours ?", chips: [["Mes campagnes", "Liste mes campagnes actives"], ["Statistiques", "Donne-moi les statistiques de toutes les campagnes"], ["Détail campagne", "Montre-moi le détail d'une campagne"]] },
};

// ── localStorage helpers ──────────────────────────────────────
function loadAllConvs(): Conversation[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}

function saveAllConvs(convs: Conversation[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(convs)); } catch {}
}

function getConvsByContext(ctx: SalesContext): Conversation[] {
  return loadAllConvs().filter(c => c.context === ctx).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function upsertConv(conv: Conversation) {
  const all = loadAllConvs().filter(c => c.id !== conv.id);
  saveAllConvs([conv, ...all]);
}

function deleteConvById(id: string) {
  saveAllConvs(loadAllConvs().filter(c => c.id !== id));
}

function newConvId() { return `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }

let seq = 0;
const uid = () => `m${++seq}_${Date.now()}`;

function relTime(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "aujourd'hui"; if (d === 1) return "hier";
  if (d < 7) return `${d}j`; return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function groupConvs(convs: Conversation[]) {
  const g: Record<string, Conversation[]> = {};
  convs.forEach(c => {
    const d = Math.floor((Date.now() - new Date(c.updatedAt).getTime()) / 86400000);
    const k = d === 0 ? "Aujourd'hui" : d === 1 ? "Hier" : d < 7 ? "Cette semaine" : "Plus ancien";
    (g[k] = g[k] || []).push(c);
  });
  return ["Aujourd'hui","Hier","Cette semaine","Plus ancien"].filter(k => g[k]).map(k => ({ label: k, items: g[k] }));
}

// ── ConversationsPanel ────────────────────────────────────────
function ConversationsPanel({ convs, activeId, open, onToggle, onNew, onSelect, onDelete }: {
  convs: Conversation[]; activeId: string | null; open: boolean;
  onToggle: () => void; onNew: () => void;
  onSelect: (c: Conversation) => void; onDelete: (id: string) => void;
}) {
  const groups = groupConvs(convs);
  return (
    <aside className={`relative hidden shrink-0 flex-col overflow-hidden border-r border-gray-100 bg-gray-50/60 transition-[width] duration-300 md:flex ${open ? "w-64" : "w-12"}`}>
      <div className={`absolute inset-0 flex flex-col items-center gap-2 py-3 transition-opacity ${open ? "pointer-events-none opacity-0" : "opacity-100 delay-150"}`}>
        <button onClick={onToggle} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm text-slate-500 hover:text-[#4cc9f0]"><MessagesSquare className="h-4 w-4" /></button>
        <button onClick={onNew} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4cc9f0] text-white hover:opacity-90"><Plus className="h-4 w-4" /></button>
      </div>
      <div className={`absolute inset-0 flex min-w-64 flex-col transition-opacity ${open ? "opacity-100 delay-150" : "pointer-events-none opacity-0"}`}>
        <div className="flex items-center justify-between border-b border-gray-100 px-3 py-3">
          <div className="flex items-center gap-1.5">
            <button onClick={onToggle} className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-gray-100"><PanelLeftClose className="h-4 w-4" /></button>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Conversations</span>
          </div>
          <button onClick={onNew} className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#4cc9f0] text-white hover:opacity-90"><Plus className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto pb-3">
          {convs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <MessagesSquare className="h-8 w-8 text-slate-200" />
              <p className="text-xs text-slate-400">Aucune conversation</p>
              <p className="text-[11px] text-slate-300">Envoyez un message pour commencer</p>
            </div>
          ) : groups.map(({ label, items }) => (
            <div key={label}>
              <p className="px-3 pb-1 pt-3 text-[9px] font-bold uppercase tracking-wider text-slate-300">{label}</p>
              {items.map(c => {
                const active = c.id === activeId;
                return (
                  <div key={c.id} onClick={() => onSelect(c)}
                    className={`group mx-2 mb-0.5 flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 transition ${active ? "bg-[#4cc9f0]/10 ring-1 ring-[#4cc9f0]/20" : "hover:bg-white"}`}>
                    <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${active ? "text-[#4cc9f0]" : "text-slate-300"}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[12px] font-medium ${active ? "text-[#4cc9f0]" : "text-slate-700"}`}>{c.title}</p>
                      <p className="text-[10px] text-slate-400">{relTime(c.updatedAt)}</p>
                    </div>
                    <button onClick={e => { e.stopPropagation(); onDelete(c.id); }}
                      className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-slate-300 hover:bg-red-50 hover:text-red-400 group-hover:flex">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

// ── Bubble ────────────────────────────────────────────────────
function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex items-start gap-2.5 px-4 py-1.5 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4cc9f0] to-[#4361ee] text-xs font-black text-white">J</div>
      )}
      <div className={`flex max-w-[78%] flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
        {msg.tools && msg.tools.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {msg.tools.map((t, i) => (
              <span key={`${t}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-[#4cc9f0]/10 px-2 py-0.5 text-[10px] font-medium text-[#4cc9f0] ring-1 ring-[#4cc9f0]/20">
                <span className="h-1 w-1 rounded-full bg-[#4cc9f0]" />{t}
              </span>
            ))}
          </div>
        )}
        <div className={`rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${isUser ? "bg-[#4361ee] text-white rounded-tr-sm" : "bg-white text-slate-900 shadow-sm ring-1 ring-slate-100 rounded-tl-sm"}`}>
          {msg.pending ? (
            msg.content ? (
              <><span className="md-prose"><ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown></span><span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-slate-400" /></>
            ) : (
              <span className="flex items-center gap-1 py-0.5">
                {[0,150,300].map(d => <span key={d} className="h-1.5 w-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
              </span>
            )
          ) : isUser ? (
            <span className="whitespace-pre-wrap">{msg.content}</span>
          ) : (
            <span className="md-prose"><ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown></span>
          )}
        </div>
        {msg.downloadUrl && (
          <a href={msg.downloadUrl} download={msg.fileName} target="_blank" rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-2 rounded-xl bg-[#4cc9f0] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Télécharger le rapport PDF
          </a>
        )}
      </div>
      {isUser && (
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">Y</div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export function JohnChatScreen({ context }: { context: SalesContext }) {
  const cfg = CTX_CONFIG[context];

  const [msgs, setMsgs] = useState<Message[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [handoffTarget, setHandoffTarget] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  // Keep a mutable ref to current messages for saving after XHR completes
  const msgsRef = useRef<Message[]>([]);
  const convIdRef = useRef<string | null>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const refreshConvs = useCallback(() => {
    setConvs(getConvsByContext(context));
  }, [context]);

  // Init: load conversations from localStorage and open latest
  useEffect(() => {
    xhrRef.current?.abort();
    setBusy(false);
    setText("");
    const list = getConvsByContext(context);
    setConvs(list);
    if (list.length > 0) {
      const latest = list[0];
      const restored: Message[] = latest.messages.map(m => ({ id: uid(), role: m.role, content: m.content }));
      setMsgs(restored);
      setConvId(latest.id);
      msgsRef.current = restored;
      convIdRef.current = latest.id;
      setTimeout(() => bottomRef.current?.scrollIntoView(), 80);
    } else {
      setMsgs([]);
      setConvId(null);
      msgsRef.current = [];
      convIdRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context]);

  const newConv = useCallback(() => {
    xhrRef.current?.abort();
    setBusy(false);
    setMsgs([]);
    setText("");
    setConvId(null);
    msgsRef.current = [];
    convIdRef.current = null;
  }, []);

  const selectConv = useCallback((c: Conversation) => {
    xhrRef.current?.abort();
    setBusy(false);
    const restored: Message[] = c.messages.map(m => ({ id: uid(), role: m.role, content: m.content }));
    setMsgs(restored);
    setConvId(c.id);
    msgsRef.current = restored;
    convIdRef.current = c.id;
    setPanelOpen(false);
    setTimeout(() => bottomRef.current?.scrollIntoView(), 80);
  }, []);

  const deleteConv = useCallback((id: string) => {
    deleteConvById(id);
    if (id === convIdRef.current) newConv();
    refreshConvs();
  }, [newConv, refreshConvs]);

  const send = useCallback((userText: string) => {
    const trimmed = userText.trim();
    if (!trimmed || busy) return;
    setText("");
    setBusy(true);

    const userMsg: Message = { id: uid(), role: "user", content: trimmed };
    const aId = uid();
    const aMsg: Message = { id: aId, role: "assistant", content: "", pending: true };

    const newMsgs = [...msgsRef.current, userMsg, aMsg];
    setMsgs(newMsgs);
    msgsRef.current = newMsgs;
    scrollToBottom();

    // History to send = all previous messages (no pending)
    const history = msgsRef.current
      .filter(m => !m.pending && m.id !== aId)
      .map(m => ({ role: m.role, content: m.content }));

    let accumulated = "";
    const tools: string[] = [];

    const patch = (upd: Partial<Message>) => {
      setMsgs(prev => {
        const updated = prev.map(m => m.id === aId ? { ...m, ...upd } : m);
        msgsRef.current = updated;
        return updated;
      });
    };

    const saveConversation = (finalContent: string) => {
      // Build the final messages list (replace pending assistant with final)
      const finalMsgs = msgsRef.current
        .filter(m => !m.pending)
        .map(m => ({ role: m.role, content: m.content }));

      // If assistant message exists but wasn't finalized yet, add it
      const hasAssistant = finalMsgs.some((m, i) => i === finalMsgs.length - 1 && m.role === "assistant" && m.content === finalContent);
      const toSave = hasAssistant ? finalMsgs : [...finalMsgs.filter(m => m.content !== "" || m.role === "user")];

      const cid = convIdRef.current ?? newConvId();
      convIdRef.current = cid;
      setConvId(cid);

      const title = trimmed.slice(0, 55) + (trimmed.length > 55 ? "…" : "");
      const conv: Conversation = {
        id: cid,
        context,
        title,
        updatedAt: new Date().toISOString(),
        messages: toSave,
      };
      upsertConv(conv);
      refreshConvs();
    };

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    let processed = 0;
    let capturedDownloadUrl = "";
    let capturedFileName = "";

    xhr.onprogress = () => {
      const chunk = xhr.responseText.slice(processed);
      processed = xhr.responseText.length;
      const lines = chunk.split("\n");
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const raw = t.slice(5).trim();
        if (!raw) continue;
        try {
          const evt = JSON.parse(raw);
          switch (evt.type) {
            case "token":
            case "delta":
              accumulated += (evt.text ?? evt.content ?? "");
              patch({ content: accumulated, pending: true });
              break;
            case "tool_end":
              tools.push(evt.tool ?? "");
              patch({ tools: [...tools] });
              if (evt.data?.download_url) {
                capturedDownloadUrl = `${API}${evt.data.download_url}`;
                capturedFileName = evt.data.file_name ?? "rapport.pdf";
                patch({ downloadUrl: capturedDownloadUrl, fileName: capturedFileName });
              }
              break;
            case "done":
              patch({ content: accumulated, pending: false });
              break;
          }
        } catch { /* bad json */ }
      }
    };

    xhr.onload = () => {
      // Finalize assistant message
      const finalContent = accumulated || "…";
      patch({
        content: finalContent, pending: false,
        ...(capturedDownloadUrl ? { downloadUrl: capturedDownloadUrl, fileName: capturedFileName } : {}),
      });

      // Update msgsRef with the final state
      const finalized = msgsRef.current.map(m =>
        m.id === aId
          ? { ...m, content: finalContent, pending: false,
              ...(capturedDownloadUrl ? { downloadUrl: capturedDownloadUrl, fileName: capturedFileName } : {}) }
          : m
      );
      msgsRef.current = finalized;
      setMsgs(finalized);

      // Save to localStorage
      saveConversation(finalContent);

      // Detect handoff
      const target = detectHandoff(finalContent, "john");
      if (target) setTimeout(() => setHandoffTarget(target), 800);

      setBusy(false);
      scrollToBottom();
    };


    xhr.onerror = () => {
      patch({ content: "Impossible de joindre le serveur.", pending: false });
      setBusy(false);
    };

    xhr.onabort = () => { setBusy(false); };

    xhr.open("POST", `${API}/chat`, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(JSON.stringify({
      message: trimmed,
      history,
      context,
      agent: "john",
      user_id: "flugia_user",
      conv_id: null,
    }));
  }, [busy, context, scrollToBottom, refreshConvs]);

  const showWelcome = msgs.length === 0;

  return (
    <div className="flex h-full min-h-0">
      <ConversationsPanel
        convs={convs} activeId={convId} open={panelOpen}
        onToggle={() => setPanelOpen(v => !v)}
        onNew={newConv}
        onSelect={selectConv}
        onDelete={id => setDeleteTarget(id)}
      />

      <div className="flex h-full min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl py-6">
            {showWelcome ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4cc9f0] to-[#4361ee] text-xl font-black text-white shadow-lg">J</div>
                <h2 className="mt-4 text-lg font-black text-slate-900">John — {cfg.label}</h2>
                <p className="mt-1 text-sm text-slate-400">{cfg.welcome}</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {cfg.chips.map(([label, msg]) => (
                    <button key={label} onClick={() => send(msg)}
                      className="rounded-full border border-slate-200 px-3.5 py-1.5 text-sm text-slate-600 transition hover:border-[#4cc9f0]/40 hover:bg-[#4cc9f0]/5">
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : msgs.map(m => <Bubble key={m.id} msg={m} />)}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t border-slate-100">
          <div className="mx-auto w-full max-w-3xl px-4 py-3">
            <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm focus-within:border-[#4cc9f0] focus-within:ring-2 focus-within:ring-[#4cc9f0]/20 transition">
              <textarea value={text} onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
                rows={1} placeholder="Posez une question à John…"
                className="max-h-36 flex-1 resize-none bg-transparent py-1.5 text-[14px] outline-none" />
              <button onClick={() => send(text)} disabled={busy || !text.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#4361ee] text-white transition hover:bg-[#3a52d6] disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 px-1 text-[11px] text-slate-400">Entrée pour envoyer · Maj+Entrée pour nouvelle ligne</p>
          </div>
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-80 rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="font-bold text-slate-900">Supprimer cette conversation ?</h3>
            <p className="mt-1 text-sm text-slate-400">Cette action est irréversible.</p>
            <div className="mt-4 flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 rounded-xl border py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Annuler</button>
              <button onClick={() => { deleteConv(deleteTarget); setDeleteTarget(null); }}
                className="flex-1 rounded-xl bg-red-500 py-2 text-sm font-medium text-white hover:bg-red-600">Supprimer</button>
            </div>
          </div>
        </div>
      )}

      <HandoffPanel
        targetAgent={handoffTarget}
        onDismiss={() => setHandoffTarget(null)}
        currentAgentName="John"
      />
    </div>
  );
}