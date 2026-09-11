'use client';

import { GitBranch } from 'lucide-react';
import { AppFrame } from '../../components/app-frame';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Select } from '../components/Select';
import { Table, TableHead, TableBody, TableRow, TableHeader } from '../components/Table';
import { CreateVersionModal } from './components/CreateVersionModal';
import { EditVersionModal } from './components/EditVersionModal';
import { VersionStatsCards } from './components/VersionStatsCards';
import { VersionToolbar } from './components/VersionToolbar';
import { VersionTableRow } from './components/VersionTableRow';
import { AlertChannelPanel } from './components/AlertChannelPanel';
import { useVersions } from './hooks/useVersions';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function VersionsPage() {
  const v = useVersions();

  return (
    <AppFrame
      title="Version Center"
      subtitle="Track outdated releases/images and trigger checks on demand."
      breadcrumbs={[{ label: 'Version Center' }]}
    >
      {v.loading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-accent border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Modals */}
          <CreateVersionModal
            isOpen={v.createOpen}
            onClose={() => v.setCreateOpen(false)}
            onCreated={v.load}
            toolRegistry={v.toolRegistry}
          />
          <EditVersionModal
            isOpen={v.editOpen}
            onClose={() => { v.setEditOpen(false); v.setEditItem(null); }}
            onSaved={v.load}
            item={v.editItem}
            monitorDetails={v.monitorDetails}
          />

          {/* Toolbar + summary row */}
          <VersionToolbar
            summary={v.summary}
            sortedItems={v.sortedItems}
            sortBy={v.sortBy}
            sortDir={v.sortDir}
            runningAll={v.runningAll}
            visibleCols={v.visibleCols}
            showColPicker={v.showColPicker}
            onRunAll={v.runAllNow}
            onRefresh={v.load}
            onExportCSV={v.exportCSV}
            onCreateOpen={() => v.setCreateOpen(true)}
            onSortChange={(col, dir) => {
              v.setSortBy(col);
              v.setSortDir(dir);
              v.setPage(1);
            }}
            onToggleColPicker={() => v.setShowColPicker((p) => !p)}
            onToggleCol={v.toggleCol}
          />

          {/* Stats cards */}
          {(v.summary?.stats.total ?? 0) > 0 && v.summary && (
            <VersionStatsCards stats={v.summary.stats} />
          )}

          {/* Empty state */}
          {(v.summary?.items.length ?? 0) === 0 ? (
            <Card className="text-center py-16">
              <div className="p-4 rounded-2xl bg-surface-elevated inline-block mb-4">
                <GitBranch className="w-12 h-12 text-text-secondary opacity-50" />
              </div>
              <p className="text-text-primary text-lg font-medium mb-2">No version checks yet</p>
              <p className="text-text-secondary text-sm mb-6">
                Track GitHub releases, Docker image tags, and more to stay on top of updates
              </p>
              <Button size="lg" onClick={() => v.setCreateOpen(true)}>
                Create your first version check
              </Button>
            </Card>
          ) : (
            <>
              <Card className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHead className="sticky top-0 z-10 bg-surface-elevated/95 backdrop-blur-sm">
                      <TableRow hover={false}>
                        <TableHeader className={v.visibleCols.name ? '' : 'hidden'}>
                          <button
                            onClick={() => v.handleVersionSort('name')}
                            className="flex items-center gap-1 hover:text-text-primary transition-colors"
                          >
                            Name
                          </button>
                        </TableHeader>
                        <TableHeader className={v.visibleCols.type ? 'hidden sm:table-cell' : 'hidden'}>Type</TableHeader>
                        <TableHeader className={v.visibleCols.target ? 'hidden md:table-cell' : 'hidden'}>Target</TableHeader>
                        <TableHeader className={v.visibleCols.current ? 'hidden sm:table-cell' : 'hidden'}>Current</TableHeader>
                        <TableHeader className={v.visibleCols.latest ? '' : 'hidden'}>Latest</TableHeader>
                        <TableHeader className={v.visibleCols.status ? '' : 'hidden'}>
                          <button
                            onClick={() => v.handleVersionSort('status')}
                            className="flex items-center gap-1 hover:text-text-primary transition-colors"
                          >
                            Status
                          </button>
                        </TableHeader>
                        <TableHeader className={v.visibleCols.lastChecked ? 'hidden lg:table-cell' : 'hidden'}>
                          <button
                            onClick={() => v.handleVersionSort('lastChecked')}
                            className="flex items-center gap-1 hover:text-text-primary transition-colors"
                          >
                            Last check
                          </button>
                        </TableHeader>
                        <TableHeader className={v.visibleCols.interval ? 'hidden lg:table-cell' : 'hidden'}>Interval</TableHeader>
                        <TableHeader className={v.visibleCols.action ? '' : 'hidden'}>Action</TableHeader>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {v.visible.map((item) => (
                        <VersionTableRow
                          key={item.id}
                          item={item}
                          isExpanded={v.expandedId === item.id}
                          runs={v.runsByMonitor[item.id] ?? []}
                          runsLoading={v.runsLoadingId === item.id}
                          releaseNotes={v.releaseNotesByMonitor[item.id]}
                          releaseNotesLoading={v.releaseNotesLoading === item.id}
                          security={v.securityByMonitor[item.id]}
                          securityLoading={v.securityLoading === item.id}
                          monitorDetails={v.monitorDetails}
                          runningId={v.runningId}
                          visibleCols={v.visibleCols}
                          onToggleDetails={v.toggleDetails}
                          onRunNow={v.runNow}
                          onOpenAlertPanel={v.openAlertPanel}
                          onEdit={v.openEdit}
                          onDelete={v.removeCheck}
                          onFetchReleaseNotes={v.fetchReleaseNotes}
                          onFetchSecurity={v.fetchSecurity}
                        />
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  <div className="flex flex-col gap-3 p-4 border-t border-border sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => v.setPage(Math.max(1, v.page - 1))}
                        disabled={v.safePage <= 1}
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-sm text-text-secondary">
                        Page {v.safePage} of {v.pages}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => v.setPage(Math.min(v.pages, v.page + 1))}
                        disabled={v.safePage >= v.pages}
                        aria-label="Next page"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 sm:justify-end">
                      <span className="text-sm text-text-secondary">Rows per page</span>
                      <Select
                        value={v.pageSize}
                        onChange={(val) => { v.setPageSize(val || '10'); v.setPage(1); }}
                        options={[
                          { value: '10', label: '10' },
                          { value: '25', label: '25' },
                          { value: '50', label: '50' },
                        ]}
                        className="w-20"
                      />
                    </div>
                  </div>
                </div>
              </Card>
            </>
          )}
        </>
      )}

      {/* Alert channel panel */}
      {v.alertPanelMonitor && (
        <AlertChannelPanel
          monitor={v.alertPanelMonitor}
          assignedChannels={v.assignedChannels}
          allChannels={v.allChannels}
          loading={v.alertPanelLoading}
          error={v.alertPanelError}
          onClose={() => v.setAlertPanelMonitor(null)}
          onAssign={v.assignChannel}
          onUnassign={v.unassignChannel}
          onUpdateNotifyOn={v.updateNotifyOn}
        />
      )}
    </AppFrame>
  );
}
