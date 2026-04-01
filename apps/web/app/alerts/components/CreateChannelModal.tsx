import { CheckCircle2, Eye, X, XCircle } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { Select } from '../../components/Select';
import { brand } from '../../../lib/brand';
import { ChannelScheduleSection } from './ChannelScheduleSection';
import { inputClass } from './utils';
import type { AlertType } from './types';
import type { UseAlertsReturn } from '../hooks/useAlerts';

export function CreateChannelModal({ alerts }: { alerts: UseAlertsReturn }) {
  const {
    wizardOpen,
    setWizardOpen,
    wizardStep,
    wizardNext,
    wizardBack,
    form,
    setForm,
    createChannel,
    resetCreateForm,
    createAlertGrouping,
    setCreateAlertGrouping,
    createGroupWindowMin,
    setCreateGroupWindowMin,
    createGroupByFolder,
    setCreateGroupByFolder,
    createGroupByTag,
    setCreateGroupByTag,
    createBatchWindowSec,
    setCreateBatchWindowSec,
    createChannelMsgTemplate,
    setCreateChannelMsgTemplate,
    createScheduleEnabled,
    setCreateScheduleEnabled,
    createScheduleTz,
    setCreateScheduleTz,
    createScheduleDays,
    setCreateScheduleDays,
    createScheduleStart,
    setCreateScheduleStart,
    createScheduleEnd,
    setCreateScheduleEnd,
    createPreviewVisible,
    createPreviewResult,
    setCreatePreviewVisible,
    setCreatePreviewResult,
    previewCreateTemplate,
  } = alerts;

  return (
    <Modal
      isOpen={wizardOpen}
      onClose={() => {
        setWizardOpen(false);
        resetCreateForm();
      }}
      title="Create alert channel"
      actions={
        <div className="flex items-center justify-between w-full">
          <Button variant="secondary" onClick={wizardBack} disabled={wizardStep === 0}>
            Back
          </Button>
          {wizardStep < 2 ? (
            <Button onClick={wizardNext}>Next</Button>
          ) : (
            <Button onClick={createChannel}>Create channel</Button>
          )}
        </div>
      }
    >
      {wizardStep === 0 && (
        <div className="space-y-4">
          <p className="font-semibold text-text-primary">Step 1/3 · Basics</p>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Channel name</label>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <Select
            label="Platform"
            value={form.type}
            onChange={(v) => setForm({ ...form, type: ((v as AlertType) || 'discord') as AlertType })}
            options={[
              { value: 'discord', label: 'Discord' },
              { value: 'webhook', label: 'Webhook' },
              { value: 'slack', label: 'Slack' },
              { value: 'telegram', label: 'Telegram' },
              { value: 'email', label: 'Email' },
              { value: 'pagerduty', label: 'PagerDuty' },
              { value: 'opsgenie', label: 'OpsGenie' },
              { value: 'sms', label: 'SMS (Twilio)' },
              { value: 'teams', label: 'Microsoft Teams' },
              { value: 'ntfy', label: 'ntfy (self-hosted)' },
              { value: 'gotify', label: 'Gotify (self-hosted)' },
              { value: 'matrix', label: 'Matrix / Element (self-hosted)' },
              { value: 'rocketchat', label: 'Rocket.Chat (self-hosted)' },
              { value: 'apprise', label: 'Apprise (universal gateway)' },
              { value: 'mattermost', label: 'Mattermost (self-hosted)' },
              { value: 'zulip', label: 'Zulip (self-hosted)' },
            ]}
          />
        </div>
      )}

      {wizardStep === 1 && (
        <>
          <div className="space-y-4">
            <p className="font-semibold text-text-primary">Step 2/3 · Credentials</p>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                {form.type === 'telegram'
                  ? 'Bot token'
                  : form.type === 'email'
                    ? 'Email address'
                    : form.type === 'pagerduty'
                      ? 'Integration Key'
                      : form.type === 'opsgenie'
                        ? 'API Key'
                        : form.type === 'sms'
                          ? 'Account SID'
                          : form.type === 'teams'
                            ? 'Teams Webhook URL'
                            : form.type === 'ntfy'
                              ? 'Topic URL'
                              : form.type === 'gotify'
                                ? 'Server URL'
                                : form.type === 'matrix'
                                  ? 'Homeserver URL'
                                  : form.type === 'rocketchat'
                                    ? 'Rocket.Chat Webhook URL'
                                    : form.type === 'apprise'
                                      ? 'Apprise Server URL'
                                      : form.type === 'mattermost'
                                        ? 'Mattermost Webhook URL'
                                        : form.type === 'zulip'
                                          ? 'Zulip Server URL'
                                          : 'URL'}
              </label>
              <input
                className={inputClass}
                value={form.a}
                onChange={(e) => setForm({ ...form, a: e.target.value })}
              />
            </div>

            {form.type === 'telegram' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Chat ID</label>
                  <input
                    className={inputClass}
                    value={form.b}
                    onChange={(e) => setForm({ ...form, b: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">Parse mode</label>
                  <select
                    className={inputClass}
                    value={form.parseMode}
                    onChange={(e) => setForm({ ...form, parseMode: e.target.value })}
                  >
                    <option value="HTML">HTML</option>
                    <option value="Markdown">Markdown</option>
                    <option value="">Plain text</option>
                  </select>
                </div>
              </>
            )}

            {form.type === 'webhook' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    Signing secret <span className="text-text-secondary font-normal">(optional)</span>
                  </label>
                  <input
                    className={inputClass}
                    type="password"
                    value={form.secret}
                    onChange={(e) => setForm({ ...form, secret: e.target.value })}
                  />
                  <p className="mt-1.5 text-xs text-text-secondary">
                    {brand.name} adds <code className="text-accent text-xs">X-PulseDock-Signature</code>.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-text-secondary">
                      Custom payload template <span className="text-text-secondary font-normal">(optional)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (form.payloadTemplate.trim()) {
                          previewCreateTemplate(form.payloadTemplate);
                        } else {
                          setCreatePreviewResult({
                            rendered: JSON.stringify(
                              {
                                text: '🚨 Monitor "My API" is DOWN',
                                extra: {
                                  monitor: {
                                    id: 'mon_123',
                                    name: 'My API',
                                    target: 'https://api.example.com',
                                    type: 'HTTP',
                                  },
                                  run: { level: 'red', message: 'Connection refused', latencyMs: null, statusCode: 503 },
                                  test: false,
                                },
                              },
                              null,
                              2,
                            ),
                            valid: true,
                          });
                          setCreatePreviewVisible(true);
                        }
                      }}
                      className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {createPreviewVisible ? 'Hide preview' : 'Preview'}
                    </button>
                  </div>
                  <textarea
                    className={`${inputClass} font-mono text-xs resize-y min-h-[120px]`}
                    value={form.payloadTemplate}
                    onChange={(e) => setForm({ ...form, payloadTemplate: e.target.value })}
                    spellCheck={false}
                  />
                  {createPreviewVisible && createPreviewResult && (
                    <div className="mt-2 rounded-lg border border-border bg-surface-elevated p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                          Sample preview — not saved yet
                        </span>
                        {createPreviewResult.valid ? (
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
                        {createPreviewResult.rendered || '(empty)'}
                      </pre>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    Custom headers <span className="text-text-secondary font-normal">(optional)</span>
                  </label>
                  <div className="space-y-2">
                    {form.customHeaders.map((h, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input
                          className={`${inputClass} flex-1`}
                          placeholder="Header name"
                          value={h.key}
                          onChange={(e) => {
                            const updated = [...form.customHeaders];
                            updated[i] = { ...updated[i], key: e.target.value };
                            setForm({ ...form, customHeaders: updated });
                          }}
                        />
                        <input
                          className={`${inputClass} flex-1`}
                          type="password"
                          placeholder="Value"
                          value={h.value}
                          onChange={(e) => {
                            const updated = [...form.customHeaders];
                            updated[i] = { ...updated[i], value: e.target.value };
                            setForm({ ...form, customHeaders: updated });
                          }}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              customHeaders: form.customHeaders.filter((_, j) => j !== i),
                            })
                          }
                          className="p-2 text-text-secondary hover:text-danger transition-colors shrink-0"
                          aria-label="Remove header"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setForm({ ...form, customHeaders: [...form.customHeaders, { key: '', value: '' }] })
                    }
                    className="mt-2 text-xs text-accent hover:text-accent/80 transition-colors"
                  >
                    + Add header
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="mt-4 border-t border-border pt-4 space-y-3">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Alert Grouping</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-primary">Enable alert grouping</p>
                <p className="text-xs text-text-secondary">Suppress alert storms by batching failures</p>
              </div>
              <button
                type="button"
                onClick={() => setCreateAlertGrouping(!createAlertGrouping)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${createAlertGrouping ? 'bg-accent' : 'bg-border'}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${createAlertGrouping ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>
            {createAlertGrouping && (
              <div className="space-y-3 pl-2 border-l border-border">
                <input
                  type="number"
                  min={1}
                  max={1440}
                  className={inputClass}
                  value={createGroupWindowMin}
                  onChange={(e) =>
                    setCreateGroupWindowMin(Math.max(1, Math.min(1440, Number(e.target.value))))
                  }
                />
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createGroupByFolder}
                    onChange={(e) => setCreateGroupByFolder(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span className="text-sm text-text-primary">Folder</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createGroupByTag}
                    onChange={(e) => setCreateGroupByTag(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span className="text-sm text-text-primary">Tag</span>
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
              value={createBatchWindowSec}
              onChange={(e) =>
                setCreateBatchWindowSec(Math.max(0, Math.min(300, Number(e.target.value))))
              }
            />
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              Custom Message Template
            </p>
            <textarea
              value={createChannelMsgTemplate}
              onChange={(e) => setCreateChannelMsgTemplate(e.target.value)}
              rows={3}
              className="w-full text-sm rounded-lg border border-border bg-surface px-3 py-2 text-text-primary"
            />
          </div>

          <ChannelScheduleSection
            enabled={createScheduleEnabled}
            setEnabled={setCreateScheduleEnabled}
            timezone={createScheduleTz}
            setTimezone={setCreateScheduleTz}
            days={createScheduleDays}
            setDays={setCreateScheduleDays}
            startHour={createScheduleStart}
            setStartHour={setCreateScheduleStart}
            endHour={createScheduleEnd}
            setEndHour={setCreateScheduleEnd}
          />
        </>
      )}

      {wizardStep === 2 && (
        <div className="space-y-2">
          <p className="font-semibold text-text-primary">Step 3/3 · Review</p>
          <p className="text-sm text-text-primary">
            Name: <strong>{form.name}</strong>
          </p>
          <p className="text-sm text-text-primary">
            Platform: <strong>{form.type}</strong>
          </p>
          <p className="text-sm text-text-secondary">Primary value: {form.a ? 'configured' : 'missing'}</p>
        </div>
      )}
    </Modal>
  );
}
