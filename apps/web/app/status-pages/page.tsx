"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Globe,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  ExternalLink,
  LayoutTemplate,
} from "lucide-react";
import { api } from "../../lib/api";
import { getUser } from "../../components/auth";
import { AppFrame } from "../../components/app-frame";
import { FadeIn } from "../components/FadeIn";
import { useToast } from "../../components/ui/toast";

interface StatusPage {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  isPublished: boolean;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function StatusPagesPage() {
  const router = useRouter();
  const toastCtx = useToast();
  const [pages, setPages] = useState<StatusPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const slugInputRef = useRef<HTMLInputElement>(null);
  const [createSlug, setCreateSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const u = getUser();
    if (!u) router.replace("/login");
    fetchPages();
  }, []);

  async function fetchPages() {
    setLoading(true);
    try {
      const data = await api<StatusPage[]>("/v1/status-pages");
      setPages(data);
    } catch {
      toastCtx.error("Failed to load status pages");
    } finally {
      setLoading(false);
    }
  }

  function autoSlug(title: string) {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    // Ensure minimum length of 3 — fallback to timestamp-based slug
    return slug.length >= 3 ? slug : `page-${Date.now().toString(36)}`;
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Read from DOM ref as well — 1Password and other autofill tools write directly
    // to the DOM without triggering React's synthetic onChange, leaving React state stale.
    const titleVal = (titleInputRef.current?.value ?? createTitle).trim();
    const slugVal = (slugInputRef.current?.value ?? createSlug).trim();

    if (!titleVal) return;
    setCreating(true);
    try {
      // Only send slug if user explicitly typed one (min 3 chars).
      // If empty, let the API auto-generate from the title — avoids stale timestamp collisions.
      const body: Record<string, string> = { title: titleVal };
      if (slugVal && slugVal.length >= 3) body.slug = slugVal;
      const page = await api<StatusPage>("/v1/status-pages", undefined, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setShowCreate(false);
      setCreateTitle("");
      setCreateSlug("");
      toastCtx.success("Status page created");
      router.push(`/status-pages/${page.id}/edit`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      toastCtx.error(msg || "Failed to create status page");
    } finally {
      setCreating(false);
    }
  }

  async function togglePublish(page: StatusPage) {
    try {
      const updated = await api<StatusPage>(`/v1/status-pages/${page.id}/publish`, undefined, { method: "POST" });
      setPages((prev) => prev.map((p) => (p.id === page.id ? { ...p, isPublished: updated.isPublished } : p)));
      toastCtx.success(updated.isPublished ? "Page published" : "Page unpublished");
    } catch {
      toastCtx.error("Failed to update publish state");
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await api(`/v1/status-pages/${id}`, undefined, { method: "DELETE" });
      setPages((prev) => prev.filter((p) => p.id !== id));
      toastCtx.success("Status page deleted");
    } catch {
      toastCtx.error("Failed to delete status page");
    } finally {
      setDeletingId(null);
    }
  }

  const publicBase = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <AppFrame title="Status Pages" subtitle="Build and share public status pages">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div />
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            New Page
          </button>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface" />
            ))}
          </div>
        ) : pages.length === 0 ? (
          <FadeIn>
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/50 px-8 py-20 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
                <LayoutTemplate className="h-8 w-8 text-accent" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary">No status pages yet</h3>
              <p className="mt-2 max-w-sm text-sm text-text-secondary">
                Create a public status page to share your service health with your users. Fully customizable with drag &amp; drop widgets.
              </p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-6 flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 active:scale-95"
              >
                <Plus className="h-4 w-4" />
                Create your first page
              </button>
            </div>
          </FadeIn>
        ) : (
          <FadeIn>
            <div className="space-y-3">
              {pages.map((page) => (
                <div
                  key={page.id}
                  className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm transition hover:border-accent/30 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10">
                      <Globe className="h-5 w-5 text-accent" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold text-text-primary">{page.title}</span>
                        {page.isPublished ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2.5 py-0.5 text-xs font-semibold text-green-400 ring-1 ring-green-500/30">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                            Live
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-surface/80 px-2.5 py-0.5 text-xs font-medium text-text-secondary ring-1 ring-border">
                            Draft
                          </span>
                        )}
                        {page.hasPassword && (
                          <span className="inline-flex items-center rounded-full bg-yellow-500/10 px-2.5 py-0.5 text-xs font-medium text-yellow-400 ring-1 ring-yellow-500/30">
                            🔒 Password
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-text-secondary">
                        <code className="rounded bg-bg px-1.5 py-0.5 font-mono text-text-secondary">
                          /{page.slug}
                        </code>
                        {page.isPublished && (
                          <a
                            href={`${publicBase}/status/${page.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-accent hover:underline"
                          >
                            View <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      {page.description && (
                        <p className="mt-1 truncate text-xs text-text-secondary">{page.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => togglePublish(page)}
                      title={page.isPublished ? "Unpublish" : "Publish"}
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:border-accent/50 hover:text-text-primary"
                    >
                      {page.isPublished ? (
                        <><EyeOff className="h-3.5 w-3.5" /> Unpublish</>
                      ) : (
                        <><Eye className="h-3.5 w-3.5" /> Publish</>
                      )}
                    </button>
                    <button
                      onClick={() => router.push(`/status-pages/${page.id}/edit`)}
                      title="Edit"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-bg text-text-secondary transition hover:border-accent/50 hover:text-text-primary"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(page.id)}
                      disabled={deletingId === page.id}
                      title="Delete"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-bg text-text-secondary transition hover:border-red-500/50 hover:text-red-400 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </FadeIn>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-5 text-lg font-semibold text-text-primary">Create Status Page</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                  Page title <span className="text-red-400">*</span>
                </label>
                <input
                  ref={titleInputRef}
                  type="text"
                  name="title"
                  autoComplete="off"
                  value={createTitle}
                  onChange={(e) => {
                    setCreateTitle(e.target.value);
                    if (!createSlug) setCreateSlug(autoSlug(e.target.value));
                  }}
                  placeholder="My Service Status"
                  className="w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/50 focus:border-accent focus:outline-none"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                  Slug <span className="text-text-secondary/50 font-normal">(URL-friendly, auto-generated)</span>
                </label>
                <div className={`flex items-center gap-0 overflow-hidden rounded-xl border bg-bg focus-within:border-accent ${createSlug && createSlug.length < 3 ? 'border-danger' : 'border-border'}`}>
                  <span className="border-r border-border bg-surface px-3 py-2.5 text-xs text-text-secondary">/status/</span>
                  <input
                    ref={slugInputRef}
                    type="text"
                    name="slug"
                    value={createSlug}
                    onChange={(e) => setCreateSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="my-service-status"
                    className="flex-1 bg-transparent px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none"
                  />
                </div>
                {createSlug && createSlug.length < 3 && (
                  <p className="mt-1 text-xs text-danger">Slug must be at least 3 characters.</p>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 rounded-xl border border-border bg-bg py-2.5 text-sm font-medium text-text-secondary transition hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !createTitle.trim() || (createSlug.length > 0 && createSlug.length < 3)}
                  className="flex-1 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
                >
                  {creating ? "Creating…" : "Create & Edit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppFrame>
  );
}
