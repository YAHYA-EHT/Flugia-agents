"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowUp, Loader2, Plus, PanelLeftClose, MessagesSquare, MessageSquare, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { HandoffPanel, detectHandoff } from "@/components/shared/HandoffPanel";

type Role = "user" | "assistant";
type EmilyContext = "emily" | "chatbot" | "agent_call";

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
  context: EmilyContext;
  title: string;
  updatedAt: string;
  messages: { role: Role; content: string }[];
}

const API = "http://localhost:8001";
const STORAGE_KEY = "flugia_emily_conversations_v1";

const CTX_CONFIG: Record<EmilyContext, { label: string; welcome: string; chips: [string, string][] }> = {
  emily:      { label: "Support",     welcome: "Salut ! Je gère tout ce qui touche au support client — chatbots et agents vocaux. Qu'est-ce qu'on regarde ?", chips: [["Nos chatbots", "Montre-moi nos chatbots"], ["Nos appels", "Comment se passent nos appels ?"], ["Tâches urgentes", "Y a-t-il des tâches urgentes ?"], ["Balance minutes", "Combien de minutes il nous reste ?"]] },
  chatbot:    { label: "Chatbot",     welcome: "Dans l'espace Chatbot. On analyse les performances ou on configure un bot ?", chips: [["Nos chatbots", "Montre-moi nos chatbots"], ["Performances", "Stats de nos chatbots cette semaine"], ["Notifications", "Nouvelles notifications chatbot ?"], ["Historique", "Historique des conversations"]] },
  agent_call: { label: "Agent Call",  welcome: "Dans l'espace Agent Call. On regarde les appels ou les agents ?", chips: [["Dashboard appels", "Montre-moi le dashboard des appels"], ["Appels manqués", "Y a-t-il des appels manqués ?"], ["Transcriptions", "Dernières transcriptions d'appels"], ["Balance", "Combien de minutes il nous reste ?"]] },
};

// ── localStorage helpers ──────────────────────────────────────
function loadAllConvs(): Conversation[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}
function saveAllConvs(convs: Conversation[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(convs)); } catch {}
}
function getConvsByContext(ctx: EmilyContext): Conversation[] {
  return loadAllConvs().filter(c => c.context === ctx).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
function upsertConv(conv: Conversation) {
  saveAllConvs([conv, ...loadAllConvs().filter(c => c.id !== conv.id)]);
}
function deleteConvById(id: string) {
  saveAllConvs(loadAllConvs().filter(c => c.id !== id));
}
function newConvId() { return `ec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }

let seq = 0;
const uid = () => `em${++seq}_${Date.now()}`;

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
  const EMILY_COLOR = "#4cc9f0";
  return (
    <aside className={`relative hidden shrink-0 flex-col overflow-hidden border-r border-gray-100 bg-gray-50/60 transition-[width] duration-300 md:flex ${open ? "w-64" : "w-12"}`}>
      <div className={`absolute inset-0 flex flex-col items-center gap-2 py-3 transition-opacity ${open ? "pointer-events-none opacity-0" : "opacity-100 delay-150"}`}>
        <button onClick={onToggle} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm text-slate-500 hover:text-cyan-400"><MessagesSquare className="h-4 w-4" /></button>
        <button onClick={onNew} className="flex h-8 w-8 items-center justify-center rounded-lg text-white hover:opacity-90" style={{ background: EMILY_COLOR }}><Plus className="h-4 w-4" /></button>
      </div>
      <div className={`absolute inset-0 flex min-w-64 flex-col transition-opacity ${open ? "opacity-100 delay-150" : "pointer-events-none opacity-0"}`}>
        <div className="flex items-center justify-between border-b border-gray-100 px-3 py-3">
          <div className="flex items-center gap-1.5">
            <button onClick={onToggle} className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-gray-100"><PanelLeftClose className="h-4 w-4" /></button>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Conversations</span>
          </div>
          <button onClick={onNew} className="flex h-7 w-7 items-center justify-center rounded-lg text-white hover:opacity-90" style={{ background: EMILY_COLOR }}><Plus className="h-4 w-4" /></button>
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
                    className={`group mx-2 mb-0.5 flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 transition ${active ? "ring-1" : "hover:bg-white"}`}
                    style={active ? { backgroundColor: `${EMILY_COLOR}15`, ringColor: `${EMILY_COLOR}30` } : {}}>
                    <MessageSquare className="h-3.5 w-3.5 shrink-0" style={{ color: active ? EMILY_COLOR : "#cbd5e1" }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium" style={{ color: active ? EMILY_COLOR : "#374151" }}>{c.title}</p>
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
  const EMILY_GRADIENT = "linear-gradient(135deg, #4cc9f0, #0096C7)";
  return (
    <div className={`flex items-start gap-2.5 px-4 py-1.5 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black text-white" style={{ background: "linear-gradient(135deg, #4cc9f0, #0096C7)" }}>E</div>
      )}
      <div className={`flex max-w-[78%] flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
        {msg.tools && msg.tools.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {msg.tools.map(t => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1" style={{ background: "#4cc9f015", color: "#4cc9f0", ringColor: "#4cc9f030" }}>
                <span className="h-1 w-1 rounded-full" style={{ background: "#4cc9f0" }} />{t}
              </span>
            ))}
          </div>
        )}
        <div className={`rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${isUser ? "text-white rounded-tr-sm" : "bg-white text-slate-900 shadow-sm ring-1 ring-slate-100 rounded-tl-sm"}`}
          style={isUser ? { background: EMILY_GRADIENT } : {}}>
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
export function EmilyChatScreen({ context }: { context: EmilyContext }) {
  const cfg = CTX_CONFIG[context];
  const EMILY_COLOR = "#4cc9f0";

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
  const msgsRef = useRef<Message[]>([]);
  const convIdRef = useRef<string | null>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const refreshConvs = useCallback(() => {
    setConvs(getConvsByContext(context));
  }, [context]);

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

    const history = msgsRef.current
      .filter(m => !m.pending && m.id !== aId)
      .map(m => ({ role: m.role, content: m.content }));

    let accumulated = "";
    let capturedDownloadUrl = "";
    let capturedFileName = "";
    const tools: string[] = [];

    const patch = (upd: Partial<Message>) =>
      setMsgs(prev => {
        const updated = prev.map(m => m.id === aId ? { ...m, ...upd } : m);
        msgsRef.current = updated;
        return updated;
      });

    const saveConversation = (finalContent: string) => {
      const finalMsgs = msgsRef.current
        .filter(m => !m.pending)
        .map(m => ({ role: m.role, content: m.content }));
      const cid = convIdRef.current ?? newConvId();
      convIdRef.current = cid;
      setConvId(cid);
      upsertConv({
        id: cid, context,
        title: trimmed.slice(0, 55) + (trimmed.length > 55 ? "…" : ""),
        updatedAt: new Date().toISOString(),
        messages: finalMsgs,
      });
      refreshConvs();
    };

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    let processed = 0;

    xhr.onprogress = () => {
      const chunk = xhr.responseText.slice(processed);
      processed = xhr.responseText.length;
      for (const line of chunk.split("\n")) {
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
                capturedDownloadUrl = `http://localhost:8001${evt.data.download_url}`;
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
      const finalContent = accumulated || "…";
      const finalized = msgsRef.current.map(m =>
        m.id === aId
          ? { ...m, content: finalContent, pending: false,
              ...(capturedDownloadUrl ? { downloadUrl: capturedDownloadUrl, fileName: capturedFileName } : {}) }
          : m
      );
      msgsRef.current = finalized;
      setMsgs(finalized);
      saveConversation(finalContent);
      // Detect handoff
      const target = detectHandoff(finalContent, "emily");
      if (target) setTimeout(() => setHandoffTarget(target), 800);
      setBusy(false);
      scrollToBottom();
    };

    xhr.onerror = () => { patch({ content: "Impossible de joindre le serveur Emily.", pending: false }); setBusy(false); };
    xhr.onabort = () => { setBusy(false); };

    xhr.open("POST", `${API}/chat`, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(JSON.stringify({ message: trimmed, history, context, user_id: "flugia_user" }));
  }, [busy, context, scrollToBottom, refreshConvs]);

  return (
    <div className="flex h-full min-h-0">
      <ConversationsPanel
        convs={convs} activeId={convId} open={panelOpen}
        onToggle={() => setPanelOpen(v => !v)}
        onNew={newConv} onSelect={selectConv}
        onDelete={id => setDeleteTarget(id)}
      />
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl py-6">
            {msgs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-black text-white shadow-lg" style={{ background: "linear-gradient(135deg, #4cc9f0, #0096C7)" }}>E</div>
                <h2 className="mt-4 text-lg font-black text-slate-900">Emily — {cfg.label}</h2>
                <p className="mt-1 text-sm text-slate-400">{cfg.welcome}</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {cfg.chips.map(([label, msg]) => (
                    <button key={label} onClick={() => send(msg)}
                      className="rounded-full border border-slate-200 px-3.5 py-1.5 text-sm text-slate-600 transition hover:border-cyan-200 hover:bg-cyan-50">
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
            <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm transition focus-within:border-cyan-400 focus-within:ring-2 focus-within:ring-cyan-100">
              <textarea value={text} onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
                rows={1} placeholder="Posez une question à Emily…"
                className="max-h-36 flex-1 resize-none bg-transparent py-1.5 text-[14px] outline-none" />
              <button onClick={() => send(text)} disabled={busy || !text.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white transition hover:opacity-90 disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #4cc9f0, #0096C7)" }}>
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
                className="flex-1 rounded-xl py-2 text-sm font-medium text-white hover:opacity-90" style={{ background: "#ef4444" }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
      <HandoffPanel
        targetAgent={handoffTarget}
        onDismiss={() => setHandoffTarget(null)}
        currentAgentName="Emily"
      />
    </div>
  );
}