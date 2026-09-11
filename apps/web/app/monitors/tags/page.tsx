"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, X, Tag } from "lucide-react";
import { AppFrame } from "../../../components/app-frame";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { getUser } from "../../../components/auth";
import { api } from "../../../lib/api";
import { useToast } from "../../../components/ui/toast";
import { PRESET_COLORS, getTagMonitorCount } from "./helpers";

interface TagItem {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-5 h-5 rounded-full transition-transform ${value === c ? "scale-125 ring-2 ring-white ring-offset-1 ring-offset-surface" : "hover:scale-110"}`}
          style={{ backgroundColor: c }}
          title={c}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-7 h-7 rounded cursor-pointer border border-border bg-surface"
        title="Custom color"
      />
    </div>
  );
}

export default function TagsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [tags, setTags] = useState<TagItem[]>([]);
  const [monitors, setMonitors] = useState<Array<{ id: string; name: string; tags?: Array<{ id: string }> }>>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  useEffect(() => {
    const user = getUser();
    if (!user) { router.push("/login"); return; }
    Promise.all([
      api<TagItem[]>("/v1/tags", user.id),
      api<Array<{ id: string; name: string; tags?: Array<{ id: string }> }>>("/v1/monitors", user.id).catch(() => []),
    ])
      .then(([t, m]) => { setTags(t); setMonitors(m); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);


  const handleCreate = async () => {
    if (!newName.trim()) return;
    const user = getUser(); if (!user) return;
    try {
      const created = await api<TagItem>("/v1/tags", user.id, {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      });
      setTags((prev) => [...prev, created]);
      setNewName(""); setNewColor(PRESET_COLORS[0]); setShowCreate(false);
      toast("Tag created", "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const handleUpdate = async (id: string) => {
    const user = getUser(); if (!user) return;
    try {
      const updated = await api<TagItem>(`/v1/tags/${id}`, user.id, {
        method: "PATCH",
        body: JSON.stringify({ name: editName.trim(), color: editColor }),
      });
      setTags((prev) => prev.map((t) => t.id === id ? updated : t));
      setEditingId(null);
      toast("Tag updated", "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete tag "${name}"? It will be removed from all monitors.`)) return;
    const user = getUser(); if (!user) return;
    try {
      await api(`/v1/tags/${id}`, user.id, { method: "DELETE" });
      setTags((prev) => prev.filter((t) => t.id !== id));
      toast("Tag deleted", "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const startEdit = (tag: TagItem) => {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
  };

  return (
    <AppFrame title="Monitor Tags" breadcrumbs={[{ label: "Monitors", href: "/monitors" }, { label: "Tags" }]}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Monitor Tags</h1>
            <p className="text-sm text-text-secondary mt-1">
              Organize monitors with color-coded tags. Tags can be used in alert routing rules, filters, and bulk actions.
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 shrink-0">
            <Plus className="w-4 h-4" />New Tag
          </Button>
        </div>

        {/* Create form */}
        {showCreate && (
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-3">New Tag</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder="e.g. production, critical, frontend"
                  className="w-full max-w-xs px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-2">Color</label>
                <ColorPicker value={newColor} onChange={setNewColor} />
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="px-3 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: newColor + "22", color: newColor }}
                >
                  {newName || "Preview"}
                </span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleCreate} disabled={!newName.trim()} className="flex items-center gap-1"><Save className="w-3.5 h-3.5" />Create</Button>
                <Button size="sm" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
              </div>
            </div>
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" /></div>
        ) : tags.length === 0 && !showCreate ? (
          <Card className="p-12 text-center">
            <Tag className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-text-primary mb-2">No tags yet</h3>
            <p className="text-sm text-text-secondary mb-4">
              Tags help you organize monitors and drive alert routing rules. Create your first tag to get started.
            </p>
            <Button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 mx-auto">
              <Plus className="w-4 h-4" />Create First Tag
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tags.map((tag) => {
              const monitorCount = getTagMonitorCount(tag.id, monitors);
              const isEditing = editingId === tag.id;
              return (
                <Card key={tag.id} className="p-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleUpdate(tag.id)} className="w-full px-3 py-1.5 text-sm rounded-xl border border-border bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" autoFocus />
                      <ColorPicker value={editColor} onChange={setEditColor} />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleUpdate(tag.id)} className="flex items-center gap-1"><Save className="w-3 h-3" />Save</Button>
                        <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}><X className="w-3 h-3" /></Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="font-medium text-text-primary truncate">{tag.name}</span>
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                          style={{ backgroundColor: tag.color + "22", color: tag.color }}
                        >
                          {monitorCount} monitor{monitorCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => startEdit(tag)} className="p-1 rounded text-text-muted hover:text-accent transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button onClick={() => handleDelete(tag.id, tag.name)} className="p-1 rounded text-text-muted hover:text-danger transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppFrame>
  );
}
