'use client';

import { ChevronDown } from 'lucide-react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { MonitorPicker } from './MonitorPicker';
import { INCIDENT_TEMPLATES, inputClass, selectClass } from '../types';
import type { IncidentStatus, IncidentSeverity, MonitorOption, Incident } from '../types';

// ── Create modal ──────────────────────────────────────────────────────────────

interface CreateModalProps {
  open: boolean;
  onClose: () => void;
  form: { title: string; description: string; severity: IncidentSeverity };
  onFormChange: (f: { title: string; description: string; severity: IncidentSeverity }) => void;
  monitorIds: string[];
  onMonitorIdsChange: (ids: string[]) => void;
  monitors: MonitorOption[];
  showTemplates: boolean;
  onToggleTemplates: () => void;
  creating: boolean;
  onConfirm: () => void;
}

export function CreateIncidentModal({
  open, onClose, form, onFormChange, monitorIds, onMonitorIdsChange, monitors,
  showTemplates, onToggleTemplates, creating, onConfirm,
}: CreateModalProps) {
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Create incident"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={onConfirm} disabled={!form.title.trim() || creating}>
            {creating ? 'Creating…' : 'Create'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <button type="button" className="flex items-center gap-2 text-sm text-accent hover:text-accent/80 transition-colors" onClick={onToggleTemplates}>
            <span>📋</span>
            {showTemplates ? 'Hide templates' : 'Start from a template'}
            <ChevronDown className={`w-3 h-3 transition-transform ${showTemplates ? 'rotate-180' : ''}`} />
          </button>
          {showTemplates && (
            <div className="mt-2 grid grid-cols-2 gap-1.5 max-h-52 overflow-y-auto pr-1">
              {INCIDENT_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  className="flex items-start gap-2 p-2.5 rounded-lg border border-border bg-surface hover:bg-surface-elevated hover:border-accent/40 text-left transition-colors group"
                  onClick={() => { onFormChange({ title: tpl.title, description: tpl.description, severity: tpl.severity }); onToggleTemplates(); }}
                >
                  <span className="text-base leading-none mt-0.5 flex-shrink-0">{tpl.icon}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-text-primary group-hover:text-accent transition-colors truncate">{tpl.label}</div>
                    <div className="text-xs text-text-secondary mt-0.5">{tpl.severity.charAt(0) + tpl.severity.slice(1).toLowerCase()}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Title <span className="text-danger">*</span></label>
          <input className={inputClass} placeholder="Brief description of the incident" value={form.title} onChange={(e) => onFormChange({ ...form, title: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Description</label>
          <textarea className={`${inputClass} resize-none`} rows={3} placeholder="What's happening? What's the impact?" value={form.description} onChange={(e) => onFormChange({ ...form, description: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Severity</label>
          <select className={selectClass} value={form.severity} onChange={(e) => onFormChange({ ...form, severity: e.target.value as IncidentSeverity })}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>
        <MonitorPicker monitors={monitors} selectedIds={monitorIds} onChange={onMonitorIdsChange} />
      </div>
    </Modal>
  );
}

// ── Edit modal ────────────────────────────────────────────────────────────────

interface EditModalProps {
  open: boolean;
  onClose: () => void;
  form: { title: string; description: string; status: IncidentStatus; severity: IncidentSeverity };
  onFormChange: (f: { title: string; description: string; status: IncidentStatus; severity: IncidentSeverity }) => void;
  monitorIds: string[];
  onMonitorIdsChange: (ids: string[]) => void;
  monitors: MonitorOption[];
  editing: boolean;
  onConfirm: () => void;
}

export function EditIncidentModal({ open, onClose, form, onFormChange, monitorIds, onMonitorIdsChange, monitors, editing, onConfirm }: EditModalProps) {
  return (
    <Modal isOpen={open} onClose={onClose} title="Edit incident" actions={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={onConfirm} disabled={!form.title.trim() || editing}>
          {editing ? 'Saving…' : 'Save changes'}
        </Button>
      </>
    }>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Title <span className="text-danger">*</span></label>
          <input className={inputClass} value={form.title} onChange={(e) => onFormChange({ ...form, title: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Description</label>
          <textarea className={`${inputClass} resize-none`} rows={3} value={form.description} onChange={(e) => onFormChange({ ...form, description: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Status</label>
            <select className={selectClass} value={form.status} onChange={(e) => onFormChange({ ...form, status: e.target.value as IncidentStatus })}>
              <option value="INVESTIGATING">Investigating</option>
              <option value="IDENTIFIED">Identified</option>
              <option value="MONITORING">Monitoring</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Severity</label>
            <select className={selectClass} value={form.severity} onChange={(e) => onFormChange({ ...form, severity: e.target.value as IncidentSeverity })}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>
        </div>
        <MonitorPicker monitors={monitors} selectedIds={monitorIds} onChange={onMonitorIdsChange} />
      </div>
    </Modal>
  );
}

// ── Post Update modal ─────────────────────────────────────────────────────────

interface UpdateModalProps {
  open: boolean;
  onClose: () => void;
  form: { body: string; status: IncidentStatus };
  onFormChange: (f: { body: string; status: IncidentStatus }) => void;
  posting: boolean;
  onConfirm: () => void;
}

export function PostUpdateModal({ open, onClose, form, onFormChange, posting, onConfirm }: UpdateModalProps) {
  return (
    <Modal isOpen={open} onClose={onClose} title="Post incident update" actions={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={onConfirm} disabled={!form.body.trim() || posting}>
          {posting ? 'Posting…' : 'Post update'}
        </Button>
      </>
    }>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Update <span className="text-danger">*</span></label>
          <textarea className={`${inputClass} resize-none`} rows={4} placeholder="What's the current status? What actions are being taken?" value={form.body} onChange={(e) => onFormChange({ ...form, body: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">New status</label>
          <select className={selectClass} value={form.status} onChange={(e) => onFormChange({ ...form, status: e.target.value as IncidentStatus })}>
            <option value="INVESTIGATING">Investigating</option>
            <option value="IDENTIFIED">Identified</option>
            <option value="MONITORING">Monitoring</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </div>
      </div>
    </Modal>
  );
}

// ── Delete modal ──────────────────────────────────────────────────────────────

interface DeleteModalProps {
  open: boolean;
  onClose: () => void;
  incident: Incident | null;
  deleting: boolean;
  onConfirm: () => void;
}

export function DeleteIncidentModal({ open, onClose, incident, deleting, onConfirm }: DeleteModalProps) {
  return (
    <Modal isOpen={open} onClose={onClose} title="Delete incident" actions={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" className="!bg-danger hover:!bg-danger/80" onClick={onConfirm} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete'}
        </Button>
      </>
    }>
      <p className="text-text-primary">
        Delete <strong>{incident?.title}</strong>? This will permanently remove the incident and all its updates. This cannot be undone.
      </p>
    </Modal>
  );
}
