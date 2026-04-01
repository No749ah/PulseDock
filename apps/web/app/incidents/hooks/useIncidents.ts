'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { getUser } from '../../../components/auth';
import { useToast } from '../../../components/ui/toast';
import { useTableSort, exportCSV } from '../../../lib/useTableSort';
import type { Incident, IncidentStatus, IncidentSeverity, MonitorOption } from '../types';

export function useIncidents() {
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [monitors, setMonitors] = useState<MonitorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Create modal ─────────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ title: '', description: '', severity: 'MEDIUM' as IncidentSeverity });
  const [createMonitorIds, setCreateMonitorIds] = useState<string[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [creating, setCreating] = useState(false);

  // ── Edit modal ───────────────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', description: '', status: 'INVESTIGATING' as IncidentStatus, severity: 'MEDIUM' as IncidentSeverity });
  const [editMonitorIds, setEditMonitorIds] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Incident | null>(null);

  // ── Update modal ─────────────────────────────────────────────────────────
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateForm, setUpdateForm] = useState({ body: '', status: 'INVESTIGATING' as IncidentStatus });
  const [posting, setPosting] = useState(false);
  const [updateTarget, setUpdateTarget] = useState<Incident | null>(null);

  // ── Delete modal ─────────────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Incident | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Post-mortem ──────────────────────────────────────────────────────────
  const [postmortemEditId, setPostmortemEditId] = useState<string | null>(null);
  const [postmortemForm, setPostmortemForm] = useState({ rootCause: '', postmortemNotes: '' });
  const [savingPostmortem, setSavingPostmortem] = useState(false);
  const [generatingPostmortem, setGeneratingPostmortem] = useState<string | null>(null);

  // ── Search + sort ────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [resolvedPage, setResolvedPage] = useState(1);
  const [resolvedPageSize, setResolvedPageSize] = useState('10');
  const { sort: incidentSort, toggle: incidentToggle, sorted: incidentSorted } =
    useTableSort<'title' | 'status' | 'severity' | 'updatedAt'>('updatedAt', 'desc');

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    const user = getUser();
    if (!user) router.push('/login');
  }, [router]);

  // ── Data load ─────────────────────────────────────────────────────────────
  async function load() {
    setLoading(true);
    try {
      const [incidentsData, monitorsData] = await Promise.all([
        api<Incident[]>('/v1/incidents'),
        api<MonitorOption[]>('/v1/monitors'),
      ]);
      setIncidents(incidentsData);
      setMonitors(monitorsData);
    } catch {
      toastError('Failed to load incidents');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── CRUD actions ──────────────────────────────────────────────────────────

  async function confirmCreate() {
    if (!createForm.title.trim()) return;
    setCreating(true);
    try {
      await api('/v1/incidents', undefined, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createForm.title.trim(),
          description: createForm.description.trim() || undefined,
          severity: createForm.severity,
          monitorIds: createMonitorIds.length > 0 ? createMonitorIds : undefined,
        }),
      });
      success('Incident created');
      setCreateOpen(false);
      setShowTemplates(false);
      setCreateForm({ title: '', description: '', severity: 'MEDIUM' });
      setCreateMonitorIds([]);
      load();
    } catch {
      toastError('Failed to create incident');
    } finally {
      setCreating(false);
    }
  }

  function openEdit(incident: Incident) {
    setSelected(incident);
    setEditForm({ title: incident.title, description: incident.description ?? '', status: incident.status, severity: incident.severity });
    setEditMonitorIds(incident.monitors.map((m) => m.monitor.id));
    setEditOpen(true);
  }

  async function confirmEdit() {
    if (!selected) return;
    setEditing(true);
    try {
      await api(`/v1/incidents/${selected.id}`, undefined, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editForm.title.trim(),
          description: editForm.description.trim() || undefined,
          status: editForm.status,
          severity: editForm.severity,
          monitorIds: editMonitorIds,
        }),
      });
      success('Incident updated');
      setEditOpen(false);
      load();
    } catch {
      toastError('Failed to update incident');
    } finally {
      setEditing(false);
    }
  }

  function openUpdate(incident: Incident) {
    setUpdateTarget(incident);
    setUpdateForm({ body: '', status: incident.status });
    setUpdateOpen(true);
  }

  async function confirmUpdate() {
    if (!updateTarget || !updateForm.body.trim()) return;
    setPosting(true);
    try {
      await api(`/v1/incidents/${updateTarget.id}/updates`, undefined, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: updateForm.body.trim(), status: updateForm.status }),
      });
      success('Update posted');
      setUpdateOpen(false);
      load();
      setExpandedId(updateTarget.id);
    } catch {
      toastError('Failed to post update');
    } finally {
      setPosting(false);
    }
  }

  function openDelete(incident: Incident) {
    setDeleteTarget(incident);
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/v1/incidents/${deleteTarget.id}`, undefined, { method: 'DELETE' });
      success('Incident deleted');
      setDeleteOpen(false);
      if (expandedId === deleteTarget.id) setExpandedId(null);
      load();
    } catch {
      toastError('Failed to delete incident');
    } finally {
      setDeleting(false);
    }
  }

  function openPostmortem(incident: Incident) {
    setPostmortemEditId(incident.id);
    setPostmortemForm({ rootCause: incident.rootCause ?? '', postmortemNotes: incident.postmortemNotes ?? '' });
  }

  async function savePostmortem(incidentId: string) {
    setSavingPostmortem(true);
    try {
      await api(`/v1/incidents/${incidentId}/postmortem`, undefined, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rootCause: postmortemForm.rootCause.trim() || null,
          postmortemNotes: postmortemForm.postmortemNotes.trim() || null,
        }),
      });
      success('Post-mortem saved');
      setPostmortemEditId(null);
      load();
    } catch {
      toastError('Failed to save post-mortem');
    } finally {
      setSavingPostmortem(false);
    }
  }

  async function generatePostmortem(incidentId: string) {
    const user = getUser();
    if (!user) return;
    setGeneratingPostmortem(incidentId);
    try {
      const result = await api<{ markdown: string; saved: boolean }>(`/v1/incidents/${incidentId}/generate-postmortem`, user.id, { method: 'POST' });
      setPostmortemForm((prev) => ({ ...prev, postmortemNotes: result.markdown }));
      setPostmortemEditId(incidentId);
      success(result.saved ? 'Post-mortem generated and saved' : 'Post-mortem generated — review and save');
    } catch {
      toastError('Failed to generate post-mortem');
    } finally {
      setGeneratingPostmortem(null);
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const filteredIncidents = incidents.filter((i) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return i.title.toLowerCase().includes(q) || i.status.toLowerCase().includes(q) || i.severity.toLowerCase().includes(q);
  });

  const sortedFiltered = incidentSorted(filteredIncidents, (i) => {
    if (incidentSort.key === 'title') return i.title;
    if (incidentSort.key === 'status') return i.status;
    if (incidentSort.key === 'severity') return i.severity;
    return i.updatedAt;
  });

  const activeIncidents = sortedFiltered.filter((i) => i.status !== 'RESOLVED');
  const resolvedIncidents = sortedFiltered.filter((i) => i.status === 'RESOLVED');

  const resolvedSize = Number(resolvedPageSize);
  const resolvedPageCount = Math.max(1, Math.ceil(resolvedIncidents.length / resolvedSize));
  const safeResolvedPage = Math.min(resolvedPage, resolvedPageCount);
  const paginatedResolved = resolvedIncidents.slice((safeResolvedPage - 1) * resolvedSize, safeResolvedPage * resolvedSize);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const resolvedThisMonth = resolvedIncidents.filter((i) => new Date(i.updatedAt).getTime() >= startOfMonth.getTime());

  function handleExportCSV() {
    exportCSV('incidents.csv', filteredIncidents.map((i) => ({
      title: i.title,
      status: i.status,
      severity: i.severity,
      autoCreated: i.autoCreated ? 'Yes' : 'No',
      updatedAt: i.updatedAt,
      monitors: i.monitors.map((m) => m.monitor.name).join('; '),
    })));
  }

  return {
    // Data
    incidents, monitors, loading,
    // Expand
    expandedId, setExpandedId,
    // Create
    createOpen, setCreateOpen,
    createForm, setCreateForm,
    createMonitorIds, setCreateMonitorIds,
    showTemplates, setShowTemplates,
    creating, confirmCreate,
    // Edit
    editOpen, setEditOpen,
    editForm, setEditForm,
    editMonitorIds, setEditMonitorIds,
    editing, selected,
    openEdit, confirmEdit,
    // Update
    updateOpen, setUpdateOpen,
    updateForm, setUpdateForm,
    posting, updateTarget,
    openUpdate, confirmUpdate,
    // Delete
    deleteOpen, setDeleteOpen,
    deleteTarget,
    deleting,
    openDelete, confirmDelete,
    // Post-mortem
    postmortemEditId, setPostmortemEditId,
    postmortemForm, setPostmortemForm,
    savingPostmortem, generatingPostmortem,
    openPostmortem, savePostmortem, generatePostmortem,
    // Search/sort/pagination
    searchQuery, setSearchQuery,
    resolvedPage, setResolvedPage,
    resolvedPageSize, setResolvedPageSize,
    incidentSort, incidentToggle,
    // Derived
    activeIncidents, resolvedIncidents, paginatedResolved,
    resolvedPageCount, safeResolvedPage, resolvedSize,
    resolvedThisMonth,
    handleExportCSV,
  };
}
