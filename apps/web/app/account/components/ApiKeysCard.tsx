"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Key, Plus, RefreshCw, Trash2 } from "lucide-react";
import { api } from "../../../lib/api";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { Modal } from "../../components/Modal";
import { useToast } from "../../../components/ui/toast";
import {
  inputClass,
  API_KEY_SCOPE_LABELS,
  API_KEY_SCOPE_COLORS,
  type ApiKey,
  type ApiKeyScope,
  type NewApiKey,
} from "./shared";

interface ApiKeysCardProps {
  apiKeys: ApiKey[];
  userId: string;
  onApiKeysChange: (keys: ApiKey[]) => void;
  toastSuccess: (msg: string) => void;
  toastError: (msg: string) => void;
}

export function ApiKeysCard({ apiKeys, userId, onApiKeysChange, toastSuccess, toastError }: ApiKeysCardProps) {
  const { info: toastInfo } = useToast();
  const [revokeConfirm, setRevokeConfirm] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyExpiry, setNewKeyExpiry] = useState("");
  const [newKeyScope, setNewKeyScope] = useState<ApiKeyScope>("WRITE");
  const [creatingKey, setCreatingKey] = useState(false);
  const [createdKey, setCreatedKey] = useState<NewApiKey | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [rotateConfirm, setRotateConfirm] = useState<string | null>(null);
  const [rotatedKey, setRotatedKey] = useState<NewApiKey | null>(null);
  const [rotatingKey, setRotatingKey] = useState(false);
  const [rotatedKeyCopied, setRotatedKeyCopied] = useState(false);

  const isKeyExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    try {
      setCreatingKey(true);
      const created = await api<NewApiKey>("/v1/api-keys", userId, {
        method: "POST",
        body: JSON.stringify({
          name: newKeyName.trim(),
          scope: newKeyScope,
          ...(newKeyExpiry ? { expiresAt: new Date(newKeyExpiry).toISOString() } : {}),
        }),
      });
      setCreatedKey(created);
      onApiKeysChange([{ id: created.id, name: created.name, prefix: created.prefix, scope: created.scope, usageCount: 0, lastUsedAt: created.lastUsedAt, expiresAt: created.expiresAt, createdAt: created.createdAt }, ...apiKeys]);
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to create API key");
    } finally {
      setCreatingKey(false);
    }
  };

  const handleCopyKey = async () => {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey.key);
    setKeyCopied(true);
    toastInfo("API key copied to clipboard");
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const handleCloseCreateModal = () => {
    setShowCreateKey(false);
    setNewKeyName("");
    setNewKeyExpiry("");
    setNewKeyScope("WRITE");
    setCreatedKey(null);
    setKeyCopied(false);
  };

  const handleDeleteKey = async (id: string) => {
    try {
      await api(`/v1/api-keys/${id}`, userId, { method: "DELETE" });
      onApiKeysChange(apiKeys.filter((k) => k.id !== id));
      setRevokeConfirm(null);
      toastSuccess("API key revoked");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to revoke API key");
    }
  };

  const handleRotateKey = async (id: string) => {
    try {
      setRotatingKey(true);
      const rotated = await api<NewApiKey>(`/v1/api-keys/${id}/rotate`, userId, { method: "POST" });
      onApiKeysChange(apiKeys.map((k) => k.id === id ? { ...k, prefix: rotated.prefix, usageCount: 0, lastUsedAt: null } : k));
      setRotateConfirm(null);
      setRotatedKey(rotated);
      setRotatedKeyCopied(false);
      toastSuccess("API key rotated — save the new key immediately!");
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Failed to rotate API key");
    } finally {
      setRotatingKey(false);
    }
  };

  const handleCopyRotatedKey = async () => {
    if (!rotatedKey) return;
    await navigator.clipboard.writeText(rotatedKey.key);
    setRotatedKeyCopied(true);
    setTimeout(() => setRotatedKeyCopied(false), 2000);
  };

  const handleCopyPrefix = async (keyId: string, prefix: string) => {
    await navigator.clipboard.writeText(prefix);
    setCopiedKeyId(keyId);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-accent/10">
              <Key className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-primary">API Keys</h2>
              <p className="text-xs text-text-secondary mt-0.5">For programmatic access via Bearer token</p>
            </div>
          </div>
          <Button size="sm" onClick={() => setShowCreateKey(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Key
          </Button>
        </div>

        {apiKeys.length === 0 ? (
          <div className="text-center py-8">
            <Key className="w-8 h-8 text-text-secondary/40 mx-auto mb-3" />
            <p className="text-text-secondary text-sm">No API keys yet</p>
            <p className="text-text-secondary/60 text-xs mt-1">Create a key to access the API programmatically</p>
          </div>
        ) : (
          <div className="space-y-2">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between p-4 rounded-lg bg-surface-elevated/50 border border-border"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-text-primary truncate">{key.name}</p>
                    <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border ${API_KEY_SCOPE_COLORS[key.scope ?? "WRITE"]}`}>
                      {API_KEY_SCOPE_LABELS[key.scope ?? "WRITE"]}
                    </span>
                    {isKeyExpired(key.expiresAt) && (
                      <Badge variant="danger">Expired</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <button
                      onClick={() => handleCopyPrefix(key.id, key.prefix)}
                      className="flex items-center gap-1 text-xs text-text-secondary font-mono hover:text-accent transition-colors group"
                      title="Copy key prefix"
                    >
                      <code>{key.prefix}••••••••</code>
                      <Copy className={`w-3 h-3 ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${copiedKeyId === key.id ? "text-success opacity-100" : ""}`} />
                      {copiedKeyId === key.id && <span className="text-success text-[10px] ml-0.5">Copied!</span>}
                    </button>
                    <span className="text-xs text-text-secondary">
                      {key.usageCount > 0 ? `${key.usageCount.toLocaleString()} uses` : "Never used"}
                    </span>
                    {key.lastUsedAt && (
                      <span className="text-xs text-text-secondary">
                        Last used {new Date(key.lastUsedAt).toLocaleDateString()}
                      </span>
                    )}
                    {key.expiresAt && !isKeyExpired(key.expiresAt) && (
                      <span className="text-xs text-text-secondary">
                        Expires {new Date(key.expiresAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  {rotateConfirm === key.id ? (
                    <>
                      <button
                        onClick={() => handleRotateKey(key.id)}
                        disabled={rotatingKey}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-warning text-bg hover:bg-warning/90 transition-colors disabled:opacity-50"
                      >
                        {rotatingKey ? "Rotating…" : "Confirm rotate"}
                      </button>
                      <button
                        onClick={() => setRotateConfirm(null)}
                        className="px-2.5 py-1 rounded-lg text-xs text-text-secondary border border-border hover:text-text-primary transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  ) : revokeConfirm === key.id ? (
                    <>
                      <button
                        onClick={() => handleDeleteKey(key.id)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-danger text-white hover:bg-danger/90 transition-colors"
                      >
                        Confirm revoke
                      </button>
                      <button
                        onClick={() => setRevokeConfirm(null)}
                        className="px-2.5 py-1 rounded-lg text-xs text-text-secondary border border-border hover:text-text-primary transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setRotateConfirm(key.id); setRevokeConfirm(null); }}
                        className="text-warning hover:text-warning/80"
                        title="Rotate API key (generate new secret)"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setRevokeConfirm(key.id); setRotateConfirm(null); }}
                        className="text-danger hover:text-danger"
                        title="Revoke API key"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Create API Key Modal */}
      <Modal
        isOpen={showCreateKey}
        onClose={handleCloseCreateModal}
        title={createdKey ? "API Key Created" : "Create API Key"}
      >
        {createdKey ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-warning/10 border border-warning/20">
              <AlertCircle className="w-5 h-5 text-warning mt-0.5 shrink-0" />
              <p className="text-warning text-sm">
                <strong>Copy this key now.</strong> You won&apos;t be able to see it again.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Your API Key</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-4 py-3 bg-surface border border-border rounded-lg text-sm font-mono text-text-primary break-all">
                  {createdKey.key}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCopyKey}
                  className="shrink-0"
                >
                  {keyCopied ? (
                    <CheckCircle2 className="w-4 h-4 text-success" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="text-sm text-text-secondary space-y-1">
              <p>Use as a <code className="text-xs font-mono bg-surface-elevated px-1.5 py-0.5 rounded">Bearer</code> token:</p>
              <code className="block text-xs font-mono bg-surface-elevated px-3 py-2 rounded-lg text-text-primary">
                Authorization: Bearer {createdKey.key.slice(0, 20)}…
              </code>
            </div>

            <Button onClick={handleCloseCreateModal} className="w-full">
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Key Name</label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className={inputClass}
                placeholder="e.g. CI/CD Pipeline, Home Server"
                maxLength={64}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Permission Scope</label>
              <div className="grid grid-cols-3 gap-2">
                {(["READ", "WRITE", "ADMIN"] as ApiKeyScope[]).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => setNewKeyScope(scope)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      newKeyScope === scope
                        ? `${API_KEY_SCOPE_COLORS[scope]} border-current`
                        : "border-border bg-surface-elevated/30 hover:bg-surface-elevated/60"
                    }`}
                  >
                    <div className="text-xs font-semibold">{API_KEY_SCOPE_LABELS[scope]}</div>
                    <div className="text-[10px] text-text-secondary mt-0.5 leading-tight">
                      {scope === "READ" ? "List & read only" : scope === "WRITE" ? "Create & manage" : "Full admin access"}
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-text-secondary/60 mt-1.5">
                {newKeyScope === "READ" && "Can list monitors, runs, and status pages. Cannot create or modify."}
                {newKeyScope === "WRITE" && "Can create, update, and delete monitors, alerts, and status pages."}
                {newKeyScope === "ADMIN" && "Full access including user management and system settings. Use with caution."}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Expiry Date <span className="text-text-secondary/50">(optional)</span>
              </label>
              <input
                type="date"
                value={newKeyExpiry}
                onChange={(e) => setNewKeyExpiry(e.target.value)}
                className={inputClass}
                min={new Date().toISOString().split("T")[0]}
              />
              <p className="text-xs text-text-secondary/60 mt-1">Leave blank for no expiry</p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" onClick={handleCloseCreateModal} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleCreateKey}
                disabled={!newKeyName.trim() || creatingKey}
                className="flex-1"
              >
                {creatingKey ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Creating…
                  </span>
                ) : (
                  "Create Key"
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Rotated API Key Modal */}
      <Modal
        isOpen={!!rotatedKey}
        onClose={() => setRotatedKey(null)}
        title="API Key Rotated"
      >
        {rotatedKey && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-warning/10 border border-warning/20">
              <AlertCircle className="w-5 h-5 text-warning mt-0.5 shrink-0" />
              <p className="text-warning text-sm">
                <strong>Save the new key now.</strong> The old key is already invalid. This key will not be shown again.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">New API Key — <span className="text-text-secondary/60">{rotatedKey.name}</span></label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-4 py-3 bg-surface border border-border rounded-lg text-sm font-mono text-text-primary break-all">
                  {rotatedKey.key}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCopyRotatedKey}
                  className="shrink-0"
                >
                  {rotatedKeyCopied ? (
                    <CheckCircle2 className="w-4 h-4 text-success" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="text-sm text-text-secondary space-y-1">
              <p>Use as a <code className="text-xs font-mono bg-surface-elevated px-1.5 py-0.5 rounded">Bearer</code> token:</p>
              <code className="block text-xs font-mono bg-surface-elevated px-3 py-2 rounded-lg text-text-primary">
                Authorization: Bearer {rotatedKey.key.slice(0, 20)}…
              </code>
            </div>

            <Button onClick={() => setRotatedKey(null)} className="w-full">
              Done
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
