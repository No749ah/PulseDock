'use client';

import { Bell, Plus } from 'lucide-react';
import { AppFrame } from '../../components/app-frame';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Table, TableBody, TableHead } from '../components/Table';
import { SortableHeader, TablePagination } from '../components/SortableTable';
import { useAlerts } from './hooks/useAlerts';
import { AlertChannelRow } from './components/AlertChannelRow';
import { AlertFiltersPanel } from './components/AlertFiltersPanel';
import { CreateChannelModal } from './components/CreateChannelModal';
import { EditChannelModal } from './components/EditChannelModal';
import { DeliveryHistoryModal } from './components/DeliveryHistoryModal';
import { DeleteChannelConfirm } from './components/DeleteChannelConfirm';

export default function AlertsPage() {
  const alerts = useAlerts();

  return (
    <AppFrame
      title="Alerts"
      subtitle="Configure alert channels and verify delivery."
      breadcrumbs={[{ label: 'Alerts' }]}
    >
      {alerts.loading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-accent border-t-transparent" />
        </div>
      ) : (
        <>
          <CreateChannelModal alerts={alerts} />
          <EditChannelModal alerts={alerts} />
          <DeliveryHistoryModal
            isOpen={alerts.deliveryOpen}
            selected={alerts.selected}
            deliveryLoading={alerts.deliveryLoading}
            deliveryHistory={alerts.deliveryHistory}
            retryingAll={alerts.retryingAll}
            retryingDeliveryId={alerts.retryingDeliveryId}
            onClose={() => alerts.setDeliveryOpen(false)}
            onRetryAllFailed={alerts.retryAllFailed}
            onRetryDelivery={alerts.retryDelivery}
          />
          <DeleteChannelConfirm
            isOpen={alerts.deleteOpen}
            selected={alerts.selected}
            onClose={() => alerts.setDeleteOpen(false)}
            onConfirm={alerts.confirmDelete}
          />

          <AlertFiltersPanel
            channelsCount={alerts.channels.length}
            showColPicker={alerts.showColPicker}
            setShowColPicker={alerts.setShowColPicker}
            visibleCols={alerts.visibleCols}
            toggleCol={alerts.toggleCol}
            testingAll={alerts.testingAll}
            onTestAll={() => void alerts.testAllChannels()}
            onOpenCreate={() => {
              alerts.resetCreateForm();
              alerts.setWizardOpen(true);
            }}
          />

          {alerts.channels.length === 0 ? (
            <Card className="text-center py-16">
              <div className="p-4 rounded-2xl bg-surface-elevated inline-block mb-4">
                <Bell className="w-12 h-12 text-text-secondary opacity-50" />
              </div>
              <p className="text-text-primary text-lg font-medium mb-2">No alert channels configured</p>
              <p className="text-text-secondary text-sm mb-6">
                Set up Discord, Slack, Telegram, Email, or webhook alerts to get notified when monitors
                fail
              </p>
              <Button
                size="lg"
                onClick={() => {
                  alerts.resetCreateForm();
                  alerts.setWizardOpen(true);
                }}
              >
                <span className="flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Add Alert Channel
                </span>
              </Button>
            </Card>
          ) : (
            <Card className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHead className="sticky top-0 z-10 bg-surface-elevated/95 backdrop-blur-sm">
                    <tr className="bg-surface-elevated border-b border-border">
                      <SortableHeader
                        sortKey="name"
                        sort={alerts.sort}
                        onSort={alerts.toggle}
                        className={alerts.visibleCols.name ? '' : 'hidden'}
                      >
                        Name
                      </SortableHeader>
                      <SortableHeader
                        sortKey="type"
                        sort={alerts.sort}
                        onSort={alerts.toggle}
                        className={alerts.visibleCols.type ? '' : 'hidden'}
                      >
                        Type
                      </SortableHeader>
                      <SortableHeader
                        sortKey="lastTriggeredAt"
                        sort={alerts.sort}
                        onSort={alerts.toggle}
                        className={alerts.visibleCols.lastTriggered ? '' : 'hidden'}
                      >
                        Last Triggered
                      </SortableHeader>
                      <SortableHeader
                        sortKey="createdAt"
                        sort={alerts.sort}
                        onSort={alerts.toggle}
                        className={alerts.visibleCols.created ? '' : 'hidden'}
                      >
                        Created
                      </SortableHeader>
                      <th
                        className={`px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider${alerts.visibleCols.actions ? '' : ' hidden'}`}
                      >
                        Actions
                      </th>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {alerts.pageRows.map((channel) => (
                      <AlertChannelRow
                        key={channel.id}
                        channel={channel}
                        visibleCols={alerts.visibleCols}
                        expandedStatsId={alerts.expandedStatsId}
                        statsCache={alerts.statsCache}
                        statsLoading={alerts.statsLoading}
                        onTest={(c) => void alerts.testChannel(c)}
                        onToggleStats={(id) => void alerts.toggleStats(id)}
                        onOpenDeliveries={(c) => void alerts.openDeliveries(c)}
                        onOpenEdit={alerts.openEdit}
                        onOpenDelete={alerts.openDelete}
                      />
                    ))}
                  </TableBody>
                </Table>

                <TablePagination
                  page={alerts.safePage}
                  pageCount={alerts.pages}
                  pageSize={alerts.pageSize}
                  totalItems={alerts.sortedChannels.length}
                  onPage={alerts.setPage}
                  onPageSize={(s) => {
                    alerts.setPageSize(s);
                    alerts.setPage(1);
                  }}
                  pageSizeOptions={[10, 25, 50, 100]}
                  onExportCSV={alerts.handleExportCSV}
                  onExportJSON={alerts.handleExportJSON}
                />
              </div>
            </Card>
          )}
        </>
      )}
    </AppFrame>
  );
}
