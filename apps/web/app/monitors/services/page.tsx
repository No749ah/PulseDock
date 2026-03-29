'use client';

import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Layers,
  Plus,
  Trash2,
  Edit2,
  X,
  Search,
  Circle,
} from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/toast';

interface ServiceGroup {
  id: string;
  name: string;
  description?: string;
  monitorIds: string[];
  monitorCount: number;
  createdAt: string;
}

interface MonitorStatus {
  id: string;
  name: string;
  level: string | null;
  latencyMs: number | null;
  checkedAt: string | null;
}

interface ServiceGroupStatus {
  id: string;
  name: string;
  description?: string;
  status: 'operational' | 'degraded' | 'outage' | 'unknown';
  monitors: MonitorStatus[];
}

interface Monitor {
  id: string;
  name: string;
  type: string;
  target: string;
  enabled: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    operational: { label: 'Operational', cls: 'bg-green-500/20 text-green-400 border-green-500/30' },
    degraded: { label: 'Degraded', cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    outage: { label: 'Outage', cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
    unknown: { label: 'Unknown', cls: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  };
  const s = map[status] ?? map.unknown;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${s.cls}`}>{s.label}</span>
  );
}

function LevelDot({ level }: { level: string | null }) {
  const cls =
    level === 'green' ? 'text-green-400' :
    level === 'yellow' ? 'text-yellow-400' :
    level === 'red' ? 'text-red-400' :
    'text-gray-500';
  return <Circle className={`w-2.5 h-2.5 fill-current ${cls}`} />;
}

export default function ServicesPage() {
  const [groups, setGroups] = useState<ServiceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedStatus, setExpandedStatus] = useState<ServiceGroupStatus | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editGroup, setEditGroup] = useState<ServiceGroup | null>(null);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [monitorSearch, setMonitorSearch] = useState('');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formMonitorIds, setFormMonitorIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const { error: showError, success: showSuccess } = useToast();

  async function loadGroups() {
    try {
      const user = await getUser();
      if (!user) return;
      const data = await api<ServiceGroup[]>('/v1/service-groups');
      setGroups(data);
    } catch {
      showError('Failed to load service groups');
    } finally {
      setLoading(false);
    }
  }

  async function loadMonitors() {
    try {
      const data = await api<Monitor[]>('/v1/monitors');
      setMonitors(data);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadGroups();
    loadMonitors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedStatus(null);
      return;
    }
    setExpandedId(id);
    setExpandedStatus(null);
    setExpandedLoading(true);
    try {
      const data = await api<ServiceGroupStatus>(`/v1/service-groups/${id}/status`);
      setExpandedStatus(data);
    } catch {
      showError('Failed to load group status');
    } finally {
      setExpandedLoading(false);
    }
  }

  function openCreate() {
    setEditGroup(null);
    setFormName('');
    setFormDescription('');
    setFormMonitorIds([]);
    setMonitorSearch('');
    setShowModal(true);
  }

  function openEdit(g: ServiceGroup) {
    setEditGroup(g);
    setFormName(g.name);
    setFormDescription(g.description ?? '');
    setFormMonitorIds([...g.monitorIds]);
    setMonitorSearch('');
    setShowModal(true);
  }

  async function handleSave() {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      if (editGroup) {
        await api(`/v1/service-groups/${editGroup.id}`, undefined, {
          method: 'PATCH',
          body: JSON.stringify({ name: formName.trim(), description: formDescription.trim() || undefined, monitorIds: formMonitorIds }),
        });
        showSuccess('Service group updated');
      } else {
        await api('/v1/service-groups', undefined, {
          method: 'POST',
          body: JSON.stringify({ name: formName.trim(), description: formDescription.trim() || undefined, monitorIds: formMonitorIds }),
        });
        showSuccess('Service group created');
      }
      setShowModal(false);
      await loadGroups();
    } catch {
      showError('Failed to save service group');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(g: ServiceGroup) {
    if (!window.confirm(`Delete "${g.name}"?`)) return;
    try {
      await api(`/v1/service-groups/${g.id}`, undefined, { method: 'DELETE' });
      showSuccess('Deleted');
      if (expandedId === g.id) {
        setExpandedId(null);
        setExpandedStatus(null);
      }
      await loadGroups();
    } catch {
      showError('Failed to delete service group');
    }
  }

  function toggleMonitor(id: string) {
    setFormMonitorIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const filteredMonitors = monitors.filter((m) =>
    m.name.toLowerCase().includes(monitorSearch.toLowerCase()) ||
    m.target.toLowerCase().includes(monitorSearch.toLowerCase()),
  );

  return (
    <AppFrame title="Service Groups">
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Layers className="w-6 h-6 text-accent" />
              Service Groups
            </h1>
            <p className="text-sm text-muted mt-1">Group monitors into logical services and track aggregate status.</p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/80 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Group
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center text-muted py-20">Loading…</div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Layers className="w-12 h-12 text-muted mb-4" />
            <p className="text-lg font-medium">No service groups yet</p>
            <p className="text-sm text-muted mt-1 mb-4">Group monitors into logical services to track aggregate health.</p>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/80 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create your first group
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groups.map((g) => {
              const isExpanded = expandedId === g.id;
              return (
                <div
                  key={g.id}
                  className="rounded-xl border border-border bg-card overflow-hidden"
                >
                  <div
                    className="flex items-start gap-3 p-4 cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => handleExpand(g.id)}
                  >
                    <div className="mt-0.5 text-muted">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm truncate">{g.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-muted border border-border">
                          {g.monitorCount} monitor{g.monitorCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {g.description && (
                        <p className="text-xs text-muted mt-0.5 truncate">{g.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      {expandedStatus && expandedId === g.id && (
                        <StatusBadge status={expandedStatus.status} />
                      )}
                      <button
                        onClick={() => openEdit(g)}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-muted hover:text-foreground transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(g)}
                        className="p-1.5 rounded-lg hover:bg-red-500/20 text-muted hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border bg-black/20 px-4 py-3">
                      {expandedLoading ? (
                        <div className="text-xs text-muted py-2">Loading status…</div>
                      ) : expandedStatus ? (
                        <>
                          <div className="flex items-center gap-2 mb-3">
                            <StatusBadge status={expandedStatus.status} />
                            <span className="text-xs text-muted">Aggregate status</span>
                          </div>
                          {expandedStatus.monitors.length === 0 ? (
                            <p className="text-xs text-muted">No monitors assigned.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {expandedStatus.monitors.map((m) => (
                                <div key={m.id} className="flex items-center gap-2 text-xs">
                                  <LevelDot level={m.level} />
                                  <span className="flex-1 truncate">{m.name}</span>
                                  {m.latencyMs != null && (
                                    <span className="text-muted">{m.latencyMs}ms</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl">
              <div className="flex items-center justify-between p-5 border-b border-border">
                <h2 className="font-semibold">{editGroup ? 'Edit Group' : 'New Service Group'}</h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-muted transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Name *</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Payment Service"
                    className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Description</label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Optional description"
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-2">
                    Monitors ({formMonitorIds.length} selected)
                  </label>
                  <div className="relative mb-2">
                    <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted" />
                    <input
                      type="text"
                      value={monitorSearch}
                      onChange={(e) => setMonitorSearch(e.target.value)}
                      placeholder="Search monitors…"
                      className="w-full pl-8 pr-3 py-2 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1 border border-border rounded-lg p-2">
                    {filteredMonitors.length === 0 ? (
                      <p className="text-xs text-muted text-center py-4">No monitors found</p>
                    ) : (
                      filteredMonitors.map((m) => (
                        <label
                          key={m.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={formMonitorIds.includes(m.id)}
                            onChange={() => toggleMonitor(m.id)}
                            className="accent-accent"
                          />
                          <span className="text-xs flex-1 truncate">{m.name}</span>
                          <span className="text-xs text-muted">{m.type}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg text-sm text-muted hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !formName.trim()}
                  className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving…' : editGroup ? 'Save Changes' : 'Create Group'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppFrame>
  );
}
