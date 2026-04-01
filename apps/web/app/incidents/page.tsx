'use client';

import { Plus, Shield } from 'lucide-react';
import { AppFrame } from '../../components/app-frame';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { TablePagination } from '../components/SortableTable';

import { useIncidents } from './hooks/useIncidents';
import { CreateIncidentModal, EditIncidentModal, PostUpdateModal, DeleteIncidentModal } from './components/IncidentModals';
import { IncidentRow } from './components/IncidentRow';
import { IncidentToolbar } from './components/IncidentToolbar';

export default function IncidentsPage() {
  const inc = useIncidents();

  return (
    <AppFrame title="Incidents" subtitle="Track and manage operational incidents" breadcrumbs={[{ label: 'Incidents' }]}>
      {inc.loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-surface animate-pulse" />)}
        </div>
      ) : (
        <>
          {/* Modals */}
          <CreateIncidentModal
            open={inc.createOpen}
            onClose={() => { inc.setCreateOpen(false); inc.setShowTemplates(false); }}
            form={inc.createForm}
            onFormChange={inc.setCreateForm}
            monitorIds={inc.createMonitorIds}
            onMonitorIdsChange={inc.setCreateMonitorIds}
            monitors={inc.monitors}
            showTemplates={inc.showTemplates}
            onToggleTemplates={() => inc.setShowTemplates((v) => !v)}
            creating={inc.creating}
            onConfirm={inc.confirmCreate}
          />
          <EditIncidentModal
            open={inc.editOpen}
            onClose={() => inc.setEditOpen(false)}
            form={inc.editForm}
            onFormChange={inc.setEditForm}
            monitorIds={inc.editMonitorIds}
            onMonitorIdsChange={inc.setEditMonitorIds}
            monitors={inc.monitors}
            editing={inc.editing}
            onConfirm={inc.confirmEdit}
          />
          <PostUpdateModal
            open={inc.updateOpen}
            onClose={() => inc.setUpdateOpen(false)}
            form={inc.updateForm}
            onFormChange={inc.setUpdateForm}
            posting={inc.posting}
            onConfirm={inc.confirmUpdate}
          />
          <DeleteIncidentModal
            open={inc.deleteOpen}
            onClose={() => inc.setDeleteOpen(false)}
            incident={inc.deleteTarget}
            deleting={inc.deleting}
            onConfirm={inc.confirmDelete}
          />

          {/* Page header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-text-primary">Incidents</h2>
              <p className="text-text-secondary text-sm mt-1">
                {inc.incidents.length} total · {inc.activeIncidents.length} active · {inc.resolvedThisMonth.length} resolved this month
              </p>
            </div>
            <Button size="lg" onClick={() => inc.setCreateOpen(true)}>
              <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Create Incident</span>
            </Button>
          </div>

          {/* Toolbar: search + sort + export */}
          {inc.incidents.length > 0 && (
            <IncidentToolbar
              searchQuery={inc.searchQuery}
              onSearchChange={(q) => { inc.setSearchQuery(q); inc.setResolvedPage(1); }}
              sortKey={inc.incidentSort.key as 'title' | 'status' | 'severity' | 'updatedAt'}
              sortDir={inc.incidentSort.dir}
              onToggleSort={inc.incidentToggle}
              onExport={inc.handleExportCSV}
            />
          )}

          {inc.incidents.length === 0 ? (
            <Card className="text-center py-16">
              <div className="p-4 rounded-2xl bg-green-500/10 border border-green-500/20 inline-block mb-4">
                <Shield className="w-12 h-12 text-green-400" />
              </div>
              <p className="text-text-primary text-lg font-medium mb-2">No incidents yet</p>
              <p className="text-green-400 text-sm font-medium mb-1">All systems operational</p>
              <p className="text-text-secondary text-sm mb-6">Create an incident to track and communicate operational issues to your team</p>
              <Button size="lg" onClick={() => inc.setCreateOpen(true)}>
                <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Create Incident</span>
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Active incidents */}
              {inc.activeIncidents.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
                    Active ({inc.activeIncidents.length})
                  </h3>
                  <div className="space-y-2">
                    {inc.activeIncidents.map((incident) => (
                      <IncidentRow
                        key={incident.id}
                        incident={incident}
                        expanded={inc.expandedId === incident.id}
                        onToggle={() => inc.setExpandedId(inc.expandedId === incident.id ? null : incident.id)}
                        onEdit={() => inc.openEdit(incident)}
                        onUpdate={() => inc.openUpdate(incident)}
                        onDelete={() => inc.openDelete(incident)}
                        postmortemEditId={inc.postmortemEditId}
                        postmortemForm={inc.postmortemForm}
                        onOpenPostmortem={() => inc.openPostmortem(incident)}
                        onCancelPostmortem={() => inc.setPostmortemEditId(null)}
                        onSavePostmortem={() => inc.savePostmortem(incident.id)}
                        onPostmortemChange={inc.setPostmortemForm}
                        savingPostmortem={inc.savingPostmortem}
                        onGeneratePostmortem={() => inc.generatePostmortem(incident.id)}
                        generatingPostmortem={inc.generatingPostmortem === incident.id}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Resolved incidents */}
              {inc.resolvedIncidents.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 mt-6">
                    Resolved ({inc.resolvedIncidents.length})
                  </h3>
                  <div className="space-y-2">
                    {inc.paginatedResolved.map((incident) => (
                      <IncidentRow
                        key={incident.id}
                        incident={incident}
                        expanded={inc.expandedId === incident.id}
                        onToggle={() => inc.setExpandedId(inc.expandedId === incident.id ? null : incident.id)}
                        onEdit={() => inc.openEdit(incident)}
                        onUpdate={() => inc.openUpdate(incident)}
                        onDelete={() => inc.openDelete(incident)}
                        postmortemEditId={inc.postmortemEditId}
                        postmortemForm={inc.postmortemForm}
                        onOpenPostmortem={() => inc.openPostmortem(incident)}
                        onCancelPostmortem={() => inc.setPostmortemEditId(null)}
                        onSavePostmortem={() => inc.savePostmortem(incident.id)}
                        onPostmortemChange={inc.setPostmortemForm}
                        savingPostmortem={inc.savingPostmortem}
                        onGeneratePostmortem={() => inc.generatePostmortem(incident.id)}
                        generatingPostmortem={inc.generatingPostmortem === incident.id}
                      />
                    ))}
                  </div>
                  {inc.resolvedIncidents.length > inc.resolvedSize && (
                    <TablePagination
                      page={inc.safeResolvedPage}
                      pageCount={inc.resolvedPageCount}
                      pageSize={inc.resolvedPageSize}
                      totalItems={inc.resolvedIncidents.length}
                      onPage={(p) => inc.setResolvedPage(p)}
                      onPageSize={(s) => { inc.setResolvedPageSize(s); inc.setResolvedPage(1); }}
                      pageSizeOptions={[10, 25, 50, 100]}
                    />
                  )}
                </section>
              )}
            </div>
          )}
        </>
      )}
    </AppFrame>
  );
}
