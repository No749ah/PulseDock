'use client';

import { ChevronDown, ChevronUp, Edit, MessageSquarePlus, Trash2 } from 'lucide-react';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { Card } from '../../components/Card';
import {
  statusColors, statusLabels, severityColors, severityLabels,
  incidentDuration, relativeTime,
} from '../types';
import type { Incident } from '../types';

interface IncidentRowProps {
  incident: Incident;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onUpdate: () => void;
  onDelete: () => void;
  postmortemEditId: string | null;
  postmortemForm: { rootCause: string; postmortemNotes: string };
  onOpenPostmortem: () => void;
  onCancelPostmortem: () => void;
  onSavePostmortem: () => void;
  onPostmortemChange: (form: { rootCause: string; postmortemNotes: string }) => void;
  savingPostmortem: boolean;
  onGeneratePostmortem: () => void;
  generatingPostmortem: boolean;
}

export function IncidentRow({
  incident, expanded, onToggle, onEdit, onUpdate, onDelete,
  postmortemEditId, postmortemForm, onOpenPostmortem, onCancelPostmortem,
  onSavePostmortem, onPostmortemChange, savingPostmortem,
  onGeneratePostmortem, generatingPostmortem,
}: IncidentRowProps) {
  return (
    <Card className="p-0 overflow-hidden">
      {/* Row header */}
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-surface-elevated/50 transition-colors"
        onClick={onToggle}
        role="button"
        aria-expanded={expanded}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      >
        {/* Severity bar */}
        <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${
          incident.severity === 'CRITICAL' ? 'bg-red-500' :
          incident.severity === 'HIGH' ? 'bg-orange-500' :
          incident.severity === 'MEDIUM' ? 'bg-yellow-500' : 'bg-blue-500'
        }`} />

        {/* Title + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-text-primary truncate">{incident.title}</span>
            <Badge className={statusColors[incident.status]}>{statusLabels[incident.status]}</Badge>
            <Badge className={severityColors[incident.severity]}>{severityLabels[incident.severity]}</Badge>
            {incident.autoCreated && <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Auto</Badge>}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {incident.description && <p className="text-sm text-text-secondary truncate">{incident.description}</p>}
            <span className="text-xs text-text-secondary flex-shrink-0">{incident.monitors.length} monitor{incident.monitors.length !== 1 ? 's' : ''} affected</span>
            <span className="text-xs text-text-secondary flex-shrink-0">{incidentDuration(incident)}</span>
          </div>
        </div>

        {/* Meta */}
        <div className="hidden sm:flex items-center gap-3 text-xs text-text-secondary flex-shrink-0">
          <span>{incident.updates.length} update{incident.updates.length !== 1 ? 's' : ''}</span>
          <span>{relativeTime(incident.createdAt)}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button variant="secondary" size="sm" onClick={onUpdate} aria-label="Post update" title="Post update">
            <span className="flex items-center gap-1.5">
              <MessageSquarePlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-xs">Post Update</span>
            </span>
          </Button>
          <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${incident.title}`} title="Edit incident">
            <Edit className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-danger hover:text-danger" aria-label={`Delete ${incident.title}`} title="Delete incident">
            <Trash2 className="w-4 h-4" />
          </Button>
          {expanded ? <ChevronUp className="w-4 h-4 text-text-secondary ml-1" /> : <ChevronDown className="w-4 h-4 text-text-secondary ml-1" />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border px-5 py-4 space-y-4">
          {/* Affected monitors */}
          {incident.monitors.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Affected monitors</p>
              <div className="flex flex-wrap gap-2">
                {incident.monitors.map(({ monitor }) => (
                  <Badge key={monitor.id} className="text-xs">{monitor.name}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div>
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Timeline</p>
            {incident.updates.length === 0 ? (
              <p className="text-sm text-text-secondary italic">No updates yet.</p>
            ) : (
              <div className="space-y-3">
                {incident.updates.map((upd) => (
                  <div key={upd.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${statusColors[upd.status].split(' ')[0]}`} />
                      <div className="w-px flex-1 bg-border mt-1" />
                    </div>
                    <div className="pb-3 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={`text-xs ${statusColors[upd.status]}`}>{statusLabels[upd.status]}</Badge>
                        <span className="text-xs text-text-secondary">{relativeTime(upd.createdAt)}</span>
                      </div>
                      <p className="text-sm text-text-primary whitespace-pre-wrap">{upd.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Post-mortem */}
          <div className="border-t border-border/50 pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Post-Mortem</p>
              <div className="flex items-center gap-3">
                <button onClick={onGeneratePostmortem} disabled={generatingPostmortem} className="text-xs text-text-muted hover:text-accent transition-colors disabled:opacity-50" title="Auto-generate post-mortem from incident data">
                  {generatingPostmortem ? '⏳ Generating…' : '✨ Auto-generate'}
                </button>
                {postmortemEditId !== incident.id && (
                  <button onClick={onOpenPostmortem} className="text-xs text-accent hover:underline">
                    {incident.rootCause || incident.postmortemNotes ? 'Edit' : '+ Add Post-Mortem'}
                  </button>
                )}
              </div>
            </div>

            {postmortemEditId === incident.id ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Root Cause</label>
                  <textarea value={postmortemForm.rootCause} onChange={(e) => onPostmortemChange({ ...postmortemForm, rootCause: e.target.value })} placeholder="What caused this incident?" maxLength={5000} rows={3} className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface text-text-primary placeholder-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-accent" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Lessons Learned / Action Items</label>
                  <textarea value={postmortemForm.postmortemNotes} onChange={(e) => onPostmortemChange({ ...postmortemForm, postmortemNotes: e.target.value })} placeholder="What can we do to prevent this in the future?" maxLength={10000} rows={4} className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface text-text-primary placeholder-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-accent" />
                </div>
                <div className="flex gap-2">
                  <button onClick={onSavePostmortem} disabled={savingPostmortem} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-50 transition-colors">
                    {savingPostmortem ? 'Saving…' : 'Save Post-Mortem'}
                  </button>
                  <button onClick={onCancelPostmortem} className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors">Cancel</button>
                </div>
              </div>
            ) : incident.rootCause || incident.postmortemNotes ? (
              <div className="space-y-3">
                {incident.rootCause && (
                  <div>
                    <p className="text-xs font-medium text-text-muted mb-1">Root Cause</p>
                    <p className="text-sm text-text-primary whitespace-pre-wrap bg-surface-elevated rounded-lg px-3 py-2">{incident.rootCause}</p>
                  </div>
                )}
                {incident.postmortemNotes && (
                  <div>
                    <p className="text-xs font-medium text-text-muted mb-1">Lessons Learned</p>
                    <p className="text-sm text-text-primary whitespace-pre-wrap bg-surface-elevated rounded-lg px-3 py-2">{incident.postmortemNotes}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-text-muted italic">No post-mortem added yet.</p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
