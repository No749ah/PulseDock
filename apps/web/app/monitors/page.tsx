"use client";

import React, { Suspense } from "react";
import nextDynamic from "next/dynamic";
import { AlertCircle, Bell, CheckCircle2, ChevronDown, ChevronUp, ChevronsUpDown, Download, Eye, LayoutGrid, Layers, List, Monitor, Plus, Upload } from "lucide-react";
import { AppFrame } from "../../components/app-frame";
import { brand } from "../../lib/brand";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Table, TableBody, TableHead, TableHeader } from "../components/Table";
import { useMonitors } from "./hooks/useMonitors";
import { AdvancedFiltersPanel } from "./components/AdvancedFiltersPanel";
import { AlertPanel } from "./components/AlertPanel";
import { MonitorGridView, MonitorGroupedView } from "./components/MonitorGridView";
import { MonitorRow } from "./components/MonitorRow";
import { MonitorFiltersPanel } from "./components/MonitorFiltersPanel";
import { MonitorBulkActionsBar } from "./components/MonitorBulkActionsBar";
import { MonitorsPagination } from "./components/MonitorsPagination";
import { CreateMonitorModal } from "./components/CreateMonitorModal";
import { EditMonitorModal } from "./components/EditMonitorModal";

const ExternalImportModal = nextDynamic(() => import("./components/ExternalImportModal").then(m => ({ default: m.ExternalImportModal })), { ssr: false });
const BadgeModal = nextDynamic(() => import("./components/BadgeModal").then(m => ({ default: m.BadgeModal })), { ssr: false });
const QuickAddModal = nextDynamic(() => import("./components/QuickAddModal").then(m => ({ default: m.QuickAddModal })), { ssr: false });
const ImportFromComposeModal = nextDynamic(() => import("./components/ImportFromComposeModal").then(m => ({ default: m.ImportFromComposeModal })), { ssr: false });
const OpenApiImportModal = nextDynamic(() => import("./components/OpenApiImportModal").then(m => ({ default: m.OpenApiImportModal })), { ssr: false });
const PlaygroundModal = nextDynamic(() => import("./components/PlaygroundModal").then(m => ({ default: m.PlaygroundModal })), { ssr: false });

function MonitorsPageInner() {
  const vm = useMonitors();
  if (!vm.user) return null;

  if (vm.loading) {
    return (
      <AppFrame title="Uptime Checks">
        <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-12 w-12 border-2 border-accent border-t-transparent" /></div>
      </AppFrame>
    );
  }

  return (
    <AppFrame title="Uptime Checks" subtitle="HTTP, TCP, SSL & Heartbeat monitors" breadcrumbs={[{ label: "Monitors" }]}>
      <div className="space-y-6">
        {vm.error && <div className="flex items-start gap-3 p-4 rounded-xl bg-danger/10 border border-danger/20"><AlertCircle className="w-5 h-5 text-danger mt-0.5" /><span className="text-danger text-sm">{vm.error}</span></div>}
        {vm.realtimeAlert && <div className="flex items-start gap-3 p-4 rounded-xl bg-warning/10 border border-warning/20"><Bell className="w-5 h-5 text-warning mt-0.5" /><span className="text-warning text-sm">{vm.realtimeAlert}</span></div>}

        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-text-primary">Uptime Checks</h2>
            <p className="text-text-secondary text-sm mt-1">{vm.uptimeMonitors.length} monitors · {vm.monitorSummary.up} up · {vm.monitorSummary.degraded} degraded · {vm.monitorSummary.down} down · {vm.monitorSummary.paused} paused</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button onClick={() => vm.setViewMode("table")} className={`p-1.5 ${vm.viewMode === "table" ? "bg-accent/20 text-accent" : "text-text-secondary"}`}><List className="w-3.5 h-3.5" /></button>
              <button onClick={() => vm.setViewMode("grid")} className={`p-1.5 ${vm.viewMode === "grid" ? "bg-accent/20 text-accent" : "text-text-secondary"}`}><LayoutGrid className="w-3.5 h-3.5" /></button>
              <button onClick={() => vm.setViewMode("grouped")} className={`p-1.5 ${vm.viewMode === "grouped" ? "bg-accent/20 text-accent" : "text-text-secondary"}`}><Layers className="w-3.5 h-3.5" /></button>
            </div>
            <Button variant="secondary" size="sm" onClick={() => vm.fileInputRef.current?.click()} className="flex items-center gap-2" title={`Import monitors from ${brand.name} JSON`} disabled={vm.importing}><Upload className="w-4 h-4" /><span className="hidden sm:inline">{vm.importing ? "Importing…" : "Import"}</span></Button>
            <input ref={vm.fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={vm.handleImportFile} />
            <Button variant="secondary" size="sm" onClick={() => vm.handleExport("json")} className="flex items-center gap-2"><Download className="w-4 h-4" /><span className="hidden sm:inline">Export</span></Button>
            <Button size="sm" onClick={vm.openCreateModal} className="flex items-center gap-2"><Plus className="w-4 h-4" />New Monitor</Button>
          </div>
        </div>

        <MonitorFiltersPanel
          searchQuery={vm.searchQuery}
          onSearchQueryChange={vm.setSearchQuery}
          statusFilter={vm.statusFilter}
          onStatusFilterChange={vm.setStatusFilter}
          folders={vm.folders}
          folderFilter={vm.folderFilter}
          onFolderFilterChange={vm.setFolderFilter}
          showAdvancedFilters={vm.showAdvancedFilters}
          activeFilterCount={vm.activeFilterCount}
          onToggleAdvancedFilters={() => vm.setShowAdvancedFilters((v: boolean) => !v)}
          allTags={vm.allTags}
          activeTagFilter={vm.activeTagFilter}
          onActiveTagFilterChange={vm.setActiveTagFilter}
        />

        {vm.showAdvancedFilters && (
          <AdvancedFiltersPanel
            filterStatuses={vm.filterStatuses}
            filterTypes={vm.filterTypes}
            filterTags={vm.filterTags}
            allTags={vm.allTags}
            savedPresets={vm.savedPresets}
            activeFilterCount={vm.activeFilterCount}
            onSetFilterStatuses={vm.setFilterStatuses}
            onSetFilterTypes={vm.setFilterTypes}
            onSetFilterTags={vm.setFilterTags}
            onSavePreset={vm.saveCurrentPreset}
            onApplyPreset={vm.applyPreset}
            onDeletePreset={vm.deletePreset}
            onClearFilters={() => { vm.setFilterStatuses(new Set(["up", "down", "degraded", "paused"])); vm.setFilterTypes(new Set(["HTTP", "TCP", "SSL_CERT", "HEARTBEAT", "DNS", "PING", "SMTP", "GIT_RELEASE", "DOCKER_IMAGE", "BROWSER", "WHOIS", "FTP", "IMAP", "POP3", "CT_LOG", "GRAPHQL"])); vm.setFilterTags(new Set()); vm.setTypeFilter("all"); vm.setStatusFilter("all"); vm.setActiveTagFilter(null); vm.setFolderFilter(null); }}
          />
        )}

        {vm.importResult && (
          <div className={`flex items-start gap-3 p-4 rounded-xl border ${vm.importResult.errors.length === 0 ? "bg-success/10 border-success/20" : "bg-warning/10 border-warning/20"}`}>
            <CheckCircle2 className={`w-5 h-5 mt-0.5 ${vm.importResult.errors.length === 0 ? "text-success" : "text-warning"}`} />
            <div className="flex-1 text-sm">Imported {vm.importResult.imported} monitor{vm.importResult.imported !== 1 ? "s" : ""}{vm.importResult.errors.length > 0 && `, ${vm.importResult.errors.length} failed`}</div>
            <button onClick={() => vm.setImportResult(null)}><Eye className="w-4 h-4" /></button>
          </div>
        )}

        {vm.filteredMonitors.length === 0 ? (
          <Card className="text-center py-16">
            <Monitor className="w-12 h-12 text-text-secondary opacity-50 mx-auto mb-4" />
            <p className="text-text-primary text-lg font-medium mb-2">No monitors match</p>
            <p className="text-text-secondary text-sm mb-6">Try adjusting your search or filters</p>
            <Button variant="secondary" size="sm" onClick={() => { vm.setActiveTagFilter(null); vm.setSearchQuery(""); vm.setStatusFilter("all"); vm.setFolderFilter(null); }}>Clear filters</Button>
          </Card>
        ) : (
          <>
            <MonitorBulkActionsBar
              selectedCount={vm.selectedIds.size}
              bulkLoading={vm.bulkLoading}
              allTags={vm.allTags}
              bulkTagId={vm.bulkTagId}
              onBulkTagIdChange={vm.setBulkTagId}
              bulkValue={vm.bulkValue}
              onBulkValueChange={vm.setBulkValue}
              onBulkAction={vm.handleBulkAction}
              onOpenBulkEdit={() => vm.setShowBulkEditModal(true)}
              onClearSelection={() => vm.setSelectedIds(new Set())}
            />

            {vm.viewMode === "grid" ? (
              <MonitorGridView monitors={vm.paginatedMonitors} runs={vm.runs} onEdit={vm.openEditModal} onDelete={vm.handleDelete} />
            ) : vm.viewMode === "grouped" ? (
              <MonitorGroupedView monitors={vm.filteredMonitors} runs={vm.runs} />
            ) : (
              <Card className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHead>
                      <tr>
                        <TableHeader className="w-10" />
                        <TableHeader><button onClick={() => vm.handleSort("name")} className="flex items-center gap-1">Name {vm.sortBy === "name" ? (vm.sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />}</button></TableHeader>
                        {vm.visibleCols.type && <TableHeader>Type</TableHeader>}
                        {vm.visibleCols.target && <TableHeader>Target</TableHeader>}
                        {vm.visibleCols.interval && <TableHeader>Interval</TableHeader>}
                        <TableHeader>Status</TableHeader>
                        {vm.visibleCols.latency && <TableHeader>Latency</TableHeader>}
                        {vm.visibleCols.alerts && <TableHeader>Alerts</TableHeader>}
                        {vm.visibleCols.health && <TableHeader>Health</TableHeader>}
                        <TableHeader>Last check</TableHeader>
                        <TableHeader>Actions</TableHeader>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {vm.paginatedMonitors.map((monitor) => (
                        <MonitorRow
                          key={monitor.id}
                          monitor={monitor}
                          runs={vm.runs}
                          selected={vm.selectedIds.has(monitor.id)}
                          visibleCols={vm.visibleCols}
                          healthScore={vm.healthScores[monitor.id]}
                          folderName={vm.folders.find((f) => f.id === monitor.folderId)?.name}
                          onToggleSelect={() => vm.toggleSelect(monitor.id)}
                          onEdit={() => vm.openEditModal(monitor)}
                          onDelete={() => vm.handleDelete(monitor.id)}
                          onClone={() => vm.handleClone(monitor.id)}
                          onCheckNow={() => vm.handleCheckNow(monitor.id)}
                          onToggleEnabled={() => vm.handleToggleEnabled(monitor)}
                          onOpenAlerts={() => vm.openAlertPanel(monitor)}
                          onPin={() => vm.handlePin(monitor)}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <MonitorsPagination pageSize={vm.pageSize} totalPages={vm.totalPages} safePage={vm.safePage} onPageChange={vm.setCurrentPage} />
              </Card>
            )}
          </>
        )}
      </div>

      {vm.modalMode === "create" ? (
        <CreateMonitorModal
          isOpen={vm.showModal}
          showTemplates={vm.showTemplates}
          formData={vm.formData}
          formErrors={vm.formErrors}
          formTouched={vm.formTouched}
          tagInput={vm.tagInput}
          selectedTags={vm.selectedTags}
          allTags={vm.allTags}
          folders={vm.folders}
          availablePlugins={vm.availablePlugins}
          selectedPlugin={vm.selectedPlugin}
          onClose={() => vm.setShowModal(false)}
          onSubmit={vm.handleCreate}
          onSetShowTemplates={vm.setShowTemplates}
          onSetFormData={vm.setFormData}
          onSetFormErrors={vm.setFormErrors}
          onSetFormTouched={vm.setFormTouched}
          onSetTagInput={vm.setTagInput}
          onSetSelectedTags={vm.setSelectedTags}
          onApplyTemplate={vm.handleApplyTemplate}
          onCopySuccess={() => {}}
        />
      ) : (
        <EditMonitorModal
          isOpen={vm.showModal}
          showTemplates={vm.showTemplates}
          formData={vm.formData}
          formErrors={vm.formErrors}
          formTouched={vm.formTouched}
          tagInput={vm.tagInput}
          selectedTags={vm.selectedTags}
          allTags={vm.allTags}
          folders={vm.folders}
          availablePlugins={vm.availablePlugins}
          selectedPlugin={vm.selectedPlugin}
          onClose={() => vm.setShowModal(false)}
          onSubmit={vm.handleUpdate}
          onSetShowTemplates={vm.setShowTemplates}
          onSetFormData={vm.setFormData}
          onSetFormErrors={vm.setFormErrors}
          onSetFormTouched={vm.setFormTouched}
          onSetTagInput={vm.setTagInput}
          onSetSelectedTags={vm.setSelectedTags}
          onApplyTemplate={vm.handleApplyTemplate}
          onCopySuccess={() => {}}
        />
      )}

      {vm.alertPanelMonitor && <AlertPanel monitor={vm.alertPanelMonitor} assignedChannels={vm.assignedChannels} unassignedChannels={vm.unassignedChannels} allChannels={vm.allChannels} loading={vm.alertPanelLoading} error={vm.alertPanelError} onClose={() => vm.setAlertPanelMonitor(null)} onAssign={vm.assignChannel} onUnassign={vm.unassignChannel} onUpdateNotifyOn={vm.updateNotifyOn} />}
      {vm.showExternalImport && <ExternalImportModal source={vm.externalImportSource} onSourceChange={vm.setExternalImportSource} importing={vm.externalImporting} result={vm.externalImportResult} onClose={() => vm.setShowExternalImport(false)} onImportFile={vm.handleExternalImportFile} />}
      {vm.badgeMonitor && <BadgeModal monitor={vm.badgeMonitor} onClose={() => vm.setBadgeMonitor(null)} onCopySuccess={() => {}} />}
      {vm.showQuickAdd && <QuickAddModal folders={vm.folders} channels={vm.allChannels} onClose={() => vm.setShowQuickAdd(false)} onSubmit={vm.handleQuickAdd} />}
      {vm.showComposeImport && <ImportFromComposeModal userId={vm.user?.id} onClose={() => vm.setShowComposeImport(false)} onCreated={async () => {}} />}
      {vm.showPlayground && <PlaygroundModal onClose={() => vm.setShowPlayground(false)} onCreateMonitor={() => vm.openCreateModal()} />}
      {vm.showOpenApiImport && <OpenApiImportModal onClose={() => vm.setShowOpenApiImport(false)} onImported={async () => { vm.setShowOpenApiImport(false); }} />}
    </AppFrame>
  );
}

export default function MonitorsPage() {
  return (
    <Suspense fallback={<AppFrame title="Uptime Checks"><div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-12 w-12 border-2 border-accent border-t-transparent" /></div></AppFrame>}>
      <MonitorsPageInner />
    </Suspense>
  );
}
