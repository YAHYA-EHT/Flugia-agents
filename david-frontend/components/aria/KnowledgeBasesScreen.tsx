"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
  FileText,
  Globe,
  Link2,
  Upload,
  X,
  CheckCircle2,
} from "lucide-react";
import { getApi } from "@/lib/aria";
import type { KnowledgeBase, KnowledgeDocument } from "@/lib/aria/types";
import { SkeletonCard } from "./Skeleton";
import { ConfirmDialog } from "./ConfirmDialog";

// ─── Add Document Modal ───────────────────────────────────────────────────────

type AddTab = "file" | "url" | "scrape";

function AddDocumentModal({
  kbId,
  onAdd,
  onClose,
}: {
  kbId: string;
  onAdd: (doc: KnowledgeDocument | null, scrapeStarted?: boolean) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<AddTab>("file");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  // File tab
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // URL tab
  const [url, setUrl] = useState("");
  const [urlName, setUrlName] = useState("");

  // Scrape tab
  const [siteUrl, setSiteUrl] = useState("");
  const [maxPages, setMaxPages] = useState(100);

  function pickFile(f: File) {
    setSelectedFile(f);
    setDone(null);
  }

  async function uploadFile() {
    if (!selectedFile) return;
    setBusy(true);
    try {
      const doc = await getApi().uploadDocument(kbId, selectedFile);
      onAdd(doc);
      setDone(`"${doc.name}" added successfully.`);
      setSelectedFile(null);
    } catch (e: unknown) {
      setDone(`Error: ${e instanceof Error ? e.message : "Upload failed"}`);
    } finally {
      setBusy(false);
    }
  }

  async function ingestUrl() {
    if (!url.trim()) return;
    setBusy(true);
    try {
      const doc = await getApi().ingestUrl(kbId, url.trim(), urlName.trim() || undefined);
      onAdd(doc);
      setDone(`"${doc.name}" ingested successfully.`);
      setUrl("");
      setUrlName("");
    } catch (e: unknown) {
      setDone(`Error: ${e instanceof Error ? e.message : "Ingest failed"}`);
    } finally {
      setBusy(false);
    }
  }

  async function startScrape() {
    if (!siteUrl.trim()) return;
    setBusy(true);
    try {
      const res = await getApi().scrapeWebsite(kbId, siteUrl.trim(), maxPages);
      onAdd(null, true);
      setDone(res.message);
      setSiteUrl("");
    } catch (e: unknown) {
      setDone(`Error: ${e instanceof Error ? e.message : "Scrape failed"}`);
    } finally {
      setBusy(false);
    }
  }

  const tabs: { id: AddTab; label: string; icon: React.ReactNode }[] = [
    { id: "file", label: "Upload file", icon: <Upload className="h-4 w-4" /> },
    { id: "url", label: "From URL", icon: <Link2 className="h-4 w-4" /> },
    { id: "scrape", label: "Scrape website", icon: <Globe className="h-4 w-4" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-lg flex-col gap-0 rounded-2xl bg-white shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4">
          <div>
            <h3 className="font-semibold text-gray-900">Add to knowledge base</h3>
            <p className="mt-0.5 text-sm text-gray-400">PDF, DOCX, XLSX · file URL · website</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setDone(null); }}
              className={`flex items-center gap-1.5 border-b-2 px-3 pb-3 text-xs font-medium transition ${
                tab === t.id
                  ? "border-brand-strong text-brand-strong"
                  : "border-transparent text-gray-400 hover:text-gray-700"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Success / error message */}
          {done && (
            <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${
              done.startsWith("Error") ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"
            }`}>
              {!done.startsWith("Error") && <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />}
              {done}
            </div>
          )}

          {/* ── File upload tab ── */}
          {tab === "file" && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.doc,.xlsx,.xls,.txt,.md"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])}
              />
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) pickFile(f);
                }}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-10 transition ${
                  dragOver ? "border-brand-strong bg-brand-strong/5" : "border-gray-200 hover:border-brand-strong/40 hover:bg-gray-50"
                }`}
              >
                <Upload className="h-8 w-8 text-gray-300" />
                <p className="mt-2 text-sm font-medium text-gray-500">
                  {selectedFile ? selectedFile.name : "Click or drag a file here"}
                </p>
                <p className="mt-1 text-xs text-gray-300">PDF · DOCX · XLSX · TXT · MD</p>
              </div>
              <button
                onClick={uploadFile}
                disabled={busy || !selectedFile}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-strong py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {busy ? "Uploading…" : "Upload & embed"}
              </button>
            </>
          )}

          {/* ── URL tab ── */}
          {tab === "url" && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">File or page URL</label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/manual.pdf"
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-brand-strong/50 focus:ring-2 focus:ring-brand-strong/10"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Name <span className="text-gray-300">(auto-detected if empty)</span>
                </label>
                <input
                  type="text"
                  value={urlName}
                  onChange={(e) => setUrlName(e.target.value)}
                  placeholder="Product Manual v3"
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-brand-strong/50 focus:ring-2 focus:ring-brand-strong/10"
                />
              </div>
              <button
                onClick={ingestUrl}
                disabled={busy || !url.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-strong py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                {busy ? "Fetching…" : "Fetch & embed"}
              </button>
            </>
          )}

          {/* ── Scrape tab ── */}
          {tab === "scrape" && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Website URL</label>
                <input
                  type="url"
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  placeholder="https://yourcompany.com"
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-brand-strong/50 focus:ring-2 focus:ring-brand-strong/10"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Aria discovers pages via sitemap.xml, then scrapes and embeds each page.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Max pages <span className="text-gray-400">({maxPages})</span>
                </label>
                <input
                  type="range"
                  min={10}
                  max={500}
                  step={10}
                  value={maxPages}
                  onChange={(e) => setMaxPages(Number(e.target.value))}
                  className="w-full accent-brand-strong"
                />
                <div className="flex justify-between text-[10px] text-gray-300">
                  <span>10</span><span>500</span>
                </div>
              </div>
              <div className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-700">
                Scraping runs in the background. Documents appear in the list as pages are processed.
                Large sites may take a few minutes.
              </div>
              <button
                onClick={startScrape}
                disabled={busy || !siteUrl.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-strong py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                {busy ? "Discovering pages…" : "Start scraping"}
              </button>
            </>
          )}
        </div>

        <div className="border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Knowledge Base Card ──────────────────────────────────────────────────────

function KbCard({
  kb,
  onDelete,
}: {
  kb: KnowledgeBase;
  onDelete: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null);
  const [deletingKb, setDeletingKb] = useState(false);
  const [confirmDeleteKb, setConfirmDeleteKb] = useState(false);
  const [scraping, setScraping] = useState(false);

  function refreshDocs() {
    setLoadingDocs(true);
    getApi().listDocuments(kb.id).then((docs) => {
      setDocuments(docs);
      setLoadingDocs(false);
    });
  }

  useEffect(() => {
    if (expanded) refreshDocs();
  }, [expanded, kb.id]);

  // Poll document list while scraping is in progress
  useEffect(() => {
    if (!scraping || !expanded) return;
    const t = setInterval(() => {
      getApi().listDocuments(kb.id).then((docs) => {
        setDocuments(docs);
        // Stop polling after 5 minutes (backend task will have finished)
      });
    }, 4000);
    const timeout = setTimeout(() => setScraping(false), 5 * 60 * 1000);
    return () => { clearInterval(t); clearTimeout(timeout); };
  }, [scraping, expanded, kb.id]);

  async function handleDeleteDoc(docId: string) {
    setDeletingDoc(docId);
    await getApi().deleteDocument(kb.id, docId);
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
    setDeletingDoc(null);
  }

  async function handleDeleteKb() {
    setConfirmDeleteKb(false);
    setDeletingKb(true);
    await onDelete(kb.id);
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: kb.isGlobal ? "#4361ee18" : "#008cfc18" }}
          >
            {kb.isGlobal ? (
              <Globe className="h-4 w-4" style={{ color: "#4361ee" }} />
            ) : (
              <BookOpen className="h-4 w-4 text-brand-strong" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-gray-900">{kb.name}</p>
              {kb.isGlobal && (
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                  Global
                </span>
              )}
            </div>
            {kb.description && (
              <p className="truncate text-xs text-gray-400">{kb.description}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
              {kb.documentCount} doc{kb.documentCount !== 1 ? "s" : ""}
            </span>
            <button
              onClick={() => setExpanded((e) => !e)}
              className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {!kb.isGlobal && (
              <button
                onClick={() => setConfirmDeleteKb(true)}
                disabled={deletingKb}
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500"
              >
                {deletingKb ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Documents list */}
        {expanded && (
          <div className="border-t border-gray-100 px-5 py-4 space-y-3">
            {loadingDocs ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-gray-300" />
              </div>
            ) : documents.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-2">No documents yet.</p>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3"
                  >
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800">{doc.name}</p>
                      {doc.source && (
                        <p className="text-xs text-gray-400">{doc.source}</p>
                      )}
                      <p className="mt-1 line-clamp-2 text-xs text-gray-500">{doc.content}</p>
                    </div>
                    {!kb.isGlobal && (
                      <button
                        onClick={() => handleDeleteDoc(doc.id)}
                        disabled={deletingDoc === doc.id}
                        className="rounded-lg p-1.5 text-gray-300 transition hover:bg-red-50 hover:text-red-400"
                      >
                        {deletingDoc === doc.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {scraping && (
              <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-xs text-amber-700">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Scraping in progress — pages will appear here as they&apos;re processed…
              </div>
            )}
            {!kb.isGlobal && (
              <button
                onClick={() => setShowAddDoc(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 py-2.5 text-sm font-medium text-gray-400 transition hover:border-brand-strong/40 hover:text-brand-strong"
              >
                <Plus className="h-4 w-4" />
                Add document
              </button>
            )}
          </div>
        )}
      </div>

      {showAddDoc && (
        <AddDocumentModal
          kbId={kb.id}
          onAdd={(doc, scrapeStarted) => {
            if (doc) setDocuments((prev) => [...prev, doc]);
            if (scrapeStarted) { setScraping(true); setExpanded(true); }
          }}
          onClose={() => setShowAddDoc(false)}
        />
      )}

      <ConfirmDialog
        open={confirmDeleteKb}
        title="Delete this knowledge base?"
        message={<>&ldquo;{kb.name}&rdquo; and all its documents will be removed. This can&apos;t be undone.</>}
        onCancel={() => setConfirmDeleteKb(false)}
        onConfirm={() => void handleDeleteKb()}
      />
    </>
  );
}

// ─── Create KB Modal ──────────────────────────────────────────────────────────

function CreateKbModal({
  onCreate,
  onClose,
}: {
  onCreate: (kb: KnowledgeBase) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    const kb = await getApi().createKnowledgeBase(name.trim(), description.trim());
    onCreate(kb);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <h3 className="font-semibold text-gray-900">New knowledge base</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Product Documentation"
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-brand-strong/50 focus:ring-2 focus:ring-brand-strong/10"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Description <span className="text-gray-300">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Internal specs, manuals and spare parts"
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
            disabled={saving || !name.trim()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-strong py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function KnowledgeBasesScreen() {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    getApi().listKnowledgeBases().then((data) => {
      setKbs(data);
      setLoading(false);
    });
  }, []);

  async function handleDelete(id: string) {
    await getApi().deleteKnowledgeBase(id);
    setKbs((prev) => prev.filter((k) => k.id !== id));
  }

  const globalKbs = kbs.filter((k) => k.isGlobal);
  const myKbs = kbs.filter((k) => !k.isGlobal);

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-3.5">
        <div>
          <h1 className="text-sm font-bold leading-tight text-slate-900">Knowledge Bases</h1>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {myKbs.length} private · {globalKbs.length} global
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-xl bg-brand-strong px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          New KB
        </button>
      </div>

      <div className="p-6 space-y-6">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <>
            {/* Global KBs */}
            {globalKbs.length > 0 && (
              <section>
                <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                  Global knowledge bases
                </h2>
                <div className="space-y-3">
                  {globalKbs.map((kb) => (
                    <KbCard key={kb.id} kb={kb} onDelete={handleDelete} />
                  ))}
                </div>
              </section>
            )}

            {/* My KBs */}
            <section>
              <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                My knowledge bases
              </h2>
              {myKbs.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 py-12 text-center">
                  <BookOpen className="h-10 w-10 text-gray-200" />
                  <p className="mt-3 text-sm font-medium text-gray-400">No knowledge bases yet</p>
                  <p className="mt-1 text-xs text-gray-300">
                    Create one and add documents your pipeline can reference
                  </p>
                  <button
                    onClick={() => setShowCreate(true)}
                    className="mt-4 flex items-center gap-2 rounded-xl bg-brand-strong px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                  >
                    <Plus className="h-4 w-4" />
                    Create first KB
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {myKbs.map((kb) => (
                    <KbCard key={kb.id} kb={kb} onDelete={handleDelete} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {showCreate && (
        <CreateKbModal
          onCreate={(kb) => setKbs((prev) => [...prev, kb])}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
