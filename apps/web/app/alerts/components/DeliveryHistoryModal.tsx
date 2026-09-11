import { Activity, CheckCircle2, Clock, RefreshCw, XCircle } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import type { AlertChannel, DeliveryHistory } from './types';

interface DeliveryHistoryModalProps {
  isOpen: boolean;
  selected: AlertChannel | null;
  deliveryLoading: boolean;
  deliveryHistory: DeliveryHistory | null;
  retryingAll: boolean;
  retryingDeliveryId: string | null;
  onClose: () => void;
  onRetryAllFailed: () => Promise<void>;
  onRetryDelivery: (deliveryId: string) => Promise<void>;
}

export function DeliveryHistoryModal({
  isOpen,
  selected,
  deliveryLoading,
  deliveryHistory,
  retryingAll,
  retryingDeliveryId,
  onClose,
  onRetryAllFailed,
  onRetryDelivery,
}: DeliveryHistoryModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Delivery History — ${selected?.name ?? ''}`}
      actions={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {deliveryLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
        </div>
      ) : deliveryHistory ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surface-elevated rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-text-primary">
                {deliveryHistory.successCount + deliveryHistory.failedCount}
              </p>
              <p className="text-xs text-text-secondary mt-0.5">Total</p>
            </div>
            <div className="bg-success/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-success">{deliveryHistory.successCount}</p>
              <p className="text-xs text-text-secondary mt-0.5">Delivered</p>
            </div>
            <div className="bg-danger/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-danger">{deliveryHistory.failedCount}</p>
              <p className="text-xs text-text-secondary mt-0.5">Failed</p>
            </div>
          </div>

          {deliveryHistory.deliveries.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="w-10 h-10 text-text-secondary opacity-40 mx-auto mb-3" />
              <p className="text-text-secondary">No deliveries yet</p>
              <p className="text-xs text-text-secondary mt-1">
                Delivery logs appear here once alerts are sent
              </p>
            </div>
          ) : (
            <>
              {deliveryHistory.deliveries.some((d) => d.status === 'failed') && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onRetryAllFailed().catch(() => undefined)}
                    disabled={retryingAll}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-danger border border-danger/30 bg-danger/5 hover:bg-danger/10 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${retryingAll ? 'animate-spin' : ''}`} />
                    {retryingAll ? 'Retrying…' : 'Retry all failed'}
                  </button>
                </div>
              )}
              <div className="max-h-96 overflow-y-auto space-y-1.5 -mx-1 px-1">
                {deliveryHistory.deliveries.map((d) => (
                  <div
                    key={d.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      d.isGrouped
                        ? 'bg-warning/5 border-warning/20'
                        : d.status === 'success'
                          ? 'bg-success/5 border-success/20'
                          : 'bg-danger/5 border-danger/20'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {d.isGrouped ? (
                        <span className="text-base leading-none">⚡</span>
                      ) : d.status === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-success" />
                      ) : (
                        <XCircle className="w-4 h-4 text-danger" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {d.isGrouped ? (
                          <span className="text-xs font-semibold text-warning bg-warning/10 px-2 py-0.5 rounded-full">
                            ⚡ Grouped ({d.groupedCount} monitors)
                          </span>
                        ) : (
                          <span
                            className={`text-xs font-semibold uppercase ${d.status === 'success' ? 'text-success' : 'text-danger'}`}
                          >
                            {d.status}
                          </span>
                        )}
                        {d.trigger && !d.isGrouped && (
                          <span className="text-xs text-text-secondary bg-surface px-1.5 py-0.5 rounded">
                            {d.trigger.replace('_', ' ')}
                          </span>
                        )}
                        {d.monitorName && !d.isGrouped && (
                          <span className="text-xs text-text-secondary truncate">· {d.monitorName}</span>
                        )}
                      </div>
                      {d.errorMessage && (
                        <p className="text-xs text-danger mt-1 font-mono break-all">{d.errorMessage}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-text-secondary">
                          {new Date(d.createdAt).toLocaleString()}
                        </span>
                        {d.durationMs != null && (
                          <span className="flex items-center gap-1 text-xs text-text-secondary">
                            <Clock className="w-3 h-3" />
                            {d.durationMs}ms
                          </span>
                        )}
                      </div>
                    </div>
                    {d.status === 'failed' && (
                      <button
                        type="button"
                        onClick={() => onRetryDelivery(d.id).catch(() => undefined)}
                        disabled={retryingDeliveryId === d.id || retryingAll}
                        title="Retry this delivery"
                        className="shrink-0 p-1.5 rounded-lg text-text-secondary hover:text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${retryingDeliveryId === d.id ? 'animate-spin' : ''}`}
                        />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
