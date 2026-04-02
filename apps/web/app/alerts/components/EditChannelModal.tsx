import { CheckCircle2, Eye, X, XCircle } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { brand } from '../../../lib/brand';
import { ChannelScheduleSection } from './ChannelScheduleSection';
import { inputClass } from './utils';
import type { UseAlertsReturn } from '../hooks/useAlerts';

export function EditChannelModal({ alerts }: { alerts: UseAlertsReturn }) {
  const {
    editOpen,
    setEditOpen,
    selected,
    saveEdit,
    editName,
    setEditName,
    editA,
    setEditA,
    editB,
    setEditB,
    editSecret,
    setEditSecret,
    editUsername,
    setEditUsername,
    editAvatarUrl,
    setEditAvatarUrl,
    editMentionRoleId,
    setEditMentionRoleId,
    editMentionUserId,
    setEditMentionUserId,
    editMessageTemplate,
    setEditMessageTemplate,
    editParseMode,
    setEditParseMode,
    editPayloadTemplate,
    setEditPayloadTemplate,
    editCustomHeaders,
    setEditCustomHeaders,
    editAlertGrouping,
    setEditAlertGrouping,
    editGroupWindowMin,
    setEditGroupWindowMin,
    editGroupByFolder,
    setEditGroupByFolder,
    editGroupByTag,
    setEditGroupByTag,
    editBatchWindowSec,
    setEditBatchWindowSec,
    editChannelMsgTemplate,
    setEditChannelMsgTemplate,
    editScheduleEnabled,
    setEditScheduleEnabled,
    editScheduleTz,
    setEditScheduleTz,
    editScheduleDays,
    setEditScheduleDays,
    editScheduleStart,
    setEditScheduleStart,
    editScheduleEnd,
    setEditScheduleEnd,
    editPreviewVisible,
    setEditPreviewVisible,
    editPreviewLoading,
    editPreviewResult,
    previewEditTemplate,
  } = alerts;

  return (
    <Modal
      isOpen={editOpen}
      onClose={() => setEditOpen(false)}
      title="Edit alert channel"
      actions={
        <>
          <Button variant="secondary" onClick={() => setEditOpen(false)}>
            Cancel
          </Button>
          <Button onClick={saveEdit}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Name</label>
          <input className={inputClass} value={editName} onChange={(e) => setEditName(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">URL</label>
          <input className={inputClass} value={editA} onChange={(e) => setEditA(e.target.value)} />
        </div>

        {selected?.type === 'telegram' && (
          <>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Chat ID</label>
              <input className={inputClass} value={editB} onChange={(e) => setEditB(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Parse mode</label>
              <select
                className={inputClass}
                value={editParseMode}
                onChange={(e) => setEditParseMode(e.target.value)}
              >
                <option value="HTML">HTML</option>
                <option value="Markdown">Markdown</option>
                <option value="">Plain text</option>
              </select>
            </div>
          </>
        )}

        {selected?.type === 'webhook' && (
          <>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Signing secret <span className="font-normal">(optional)</span>
              </label>
              <input
                className={inputClass}
                type="password"
                value={editSecret}
                onChange={(e) => setEditSecret(e.target.value)}
              />
              <p className="mt-1.5 text-xs text-text-secondary">
                {brand.name} adds <code className="text-accent text-xs">X-PulseDock-Signature</code>.
              </p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-text-secondary">
                  Custom payload template <span className="font-normal">(optional)</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (editPreviewVisible) {
                      setEditPreviewVisible(false);
                    } else {
                      previewEditTemplate().catch(() => undefined);
                    }
                  }}
                  className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  {editPreviewVisible ? 'Hide preview' : 'Preview'}
                </button>
              </div>
              <textarea
                className={`${inputClass} font-mono text-xs resize-y min-h-[120px]`}
                value={editPayloadTemplate}
                onChange={(e) => setEditPayloadTemplate(e.target.value)}
              />
              {editPreviewVisible && (
                <div className="mt-2 rounded-lg border border-border bg-surface-elevated p-3 space-y-2">
                  {editPreviewLoading ? (
                    <div className="flex items-center gap-2 py-2">
                      <div className="animate-spin w-3.5 h-3.5 border border-accent border-t-transparent rounded-full" />
                      <span className="text-xs text-text-secondary">Rendering…</span>
                    </div>
                  ) : editPreviewResult ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                          Preview
                        </span>
                        {editPreviewResult.valid ? (
                          <span className="text-xs text-success flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Valid JSON
                          </span>
                        ) : (
                          <span className="text-xs text-warning flex items-center gap-1">
                            <XCircle className="w-3.5 h-3.5" /> Invalid JSON
                          </span>
                        )}
                      </div>
                      <pre className="text-xs font-mono text-text-primary whitespace-pre-wrap break-all overflow-x-auto max-h-48 overflow-y-auto">
                        {editPreviewResult.rendered || '(empty)'}
                      </pre>
                    </>
                  ) : null}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Custom headers</label>
              <div className="space-y-2">
                {editCustomHeaders.map((h, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      className={`${inputClass} flex-1`}
                      placeholder="Header name"
                      value={h.key}
                      onChange={(e) => {
                        const updated = [...editCustomHeaders];
                        updated[i] = { ...updated[i], key: e.target.value };
                        setEditCustomHeaders(updated);
                      }}
                    />
                    <input
                      className={`${inputClass} flex-1`}
                      type="password"
                      placeholder="Value"
                      value={h.value}
                      onChange={(e) => {
                        const updated = [...editCustomHeaders];
                        updated[i] = { ...updated[i], value: e.target.value };
                        setEditCustomHeaders(updated);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setEditCustomHeaders(editCustomHeaders.filter((_, j) => j !== i))}
                      className="p-2 text-text-secondary hover:text-danger transition-colors shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setEditCustomHeaders([...editCustomHeaders, { key: '', value: '' }])}
                className="mt-2 text-xs text-accent hover:text-accent/80"
              >
                + Add header
              </button>
            </div>
          </>
        )}

        {selected?.type === 'discord' && (
          <div className="space-y-3 border-t border-border pt-3">
            <input
              className={inputClass}
              placeholder={brand.name}
              value={editUsername}
              onChange={(e) => setEditUsername(e.target.value)}
            />
            <input
              className={inputClass}
              placeholder="https://…/avatar.png"
              value={editAvatarUrl}
              onChange={(e) => setEditAvatarUrl(e.target.value)}
            />
            <input
              className={inputClass}
              placeholder="Role ID"
              value={editMentionRoleId}
              onChange={(e) => setEditMentionRoleId(e.target.value)}
            />
            <input
              className={inputClass}
              placeholder="User ID"
              value={editMentionUserId}
              onChange={(e) => setEditMentionUserId(e.target.value)}
            />
            <input
              className={inputClass}
              placeholder="Custom message"
              value={editMessageTemplate}
              onChange={(e) => setEditMessageTemplate(e.target.value)}
            />
          </div>
        )}

        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Alert Grouping</p>
          <button
            type="button"
            onClick={() => setEditAlertGrouping(!editAlertGrouping)}
            className={`relative inline-flex h-6 w-11 rounded-full ${editAlertGrouping ? 'bg-accent' : 'bg-border'}`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white transform ${editAlertGrouping ? 'translate-x-5' : 'translate-x-0'}`}
            />
          </button>
          {editAlertGrouping && (
            <div className="space-y-3 pl-2 border-l border-border">
              <input
                type="number"
                min={1}
                max={1440}
                className={inputClass}
                value={editGroupWindowMin}
                onChange={(e) =>
                  setEditGroupWindowMin(Math.max(1, Math.min(1440, Number(e.target.value))))
                }
              />
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editGroupByFolder}
                  onChange={(e) => setEditGroupByFolder(e.target.checked)}
                />
                Folder
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editGroupByTag}
                  onChange={(e) => setEditGroupByTag(e.target.checked)}
                />
                Tag
              </label>
            </div>
          )}
        </div>

        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Batch Window</p>
          <input
            type="number"
            min={0}
            max={300}
            className={inputClass}
            value={editBatchWindowSec}
            onChange={(e) => setEditBatchWindowSec(Math.max(0, Math.min(300, Number(e.target.value))))}
          />
        </div>

        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            Custom Message Template
          </p>
          <textarea
            value={editChannelMsgTemplate}
            onChange={(e) => setEditChannelMsgTemplate(e.target.value)}
            rows={3}
            className="w-full text-sm rounded-lg border border-border bg-surface px-3 py-2 text-text-primary"
          />
        </div>

        <ChannelScheduleSection
          enabled={editScheduleEnabled}
          setEnabled={setEditScheduleEnabled}
          timezone={editScheduleTz}
          setTimezone={setEditScheduleTz}
          days={editScheduleDays}
          setDays={setEditScheduleDays}
          startHour={editScheduleStart}
          setStartHour={setEditScheduleStart}
          endHour={editScheduleEnd}
          setEndHour={setEditScheduleEnd}
        />
      </div>
    </Modal>
  );
}
