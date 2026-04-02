"use client";

import { useState } from "react";
import { X, RefreshCw, Lock, Globe } from "lucide-react";
import { api } from "../../../../../lib/api";
import { brand } from "../../../../../lib/brand";
import { useToast } from "../../../../../components/ui/toast";
import type { StatusPage, PageSettings } from "./types";

interface PageSettingsModalProps {
  page: StatusPage;
  pageSettings: PageSettings;
  setPageSettings: React.Dispatch<React.SetStateAction<PageSettings>>;
  setPage: React.Dispatch<React.SetStateAction<StatusPage | null>>;
  id: string;
  onClose: () => void;
  onSave: () => void;
}

export function PageSettingsModal({
  page,
  pageSettings,
  setPageSettings,
  setPage,
  id,
  onClose,
  onSave,
}: PageSettingsModalProps) {
  const toastCtx = useToast();
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [confirmRemovePassword, setConfirmRemovePassword] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface shadow-2xl shadow-black/50 flex flex-col"
        style={{ maxHeight: "min(90vh, 760px)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Page Settings</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Configure theme, appearance, auto-refresh, and branding.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-6 space-y-5 flex-1">
          {/* Logo URL */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Logo URL</label>
            <input
              type="url"
              placeholder="https://example.com/logo.png"
              value={pageSettings.logoUrl ?? ""}
              onChange={(e) =>
                setPageSettings((s) => ({ ...s, logoUrl: e.target.value || undefined }))
              }
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-xs text-text-muted">
              Displayed above the page title. Leave empty to hide.
            </p>
          </div>

          {/* Favicon URL */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Favicon URL</label>
            <input
              type="url"
              placeholder="https://example.com/favicon.ico"
              value={pageSettings.faviconUrl ?? ""}
              onChange={(e) =>
                setPageSettings((s) => ({ ...s, faviconUrl: e.target.value || undefined }))
              }
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-xs text-text-muted">
              Custom favicon for the public status page. Leave empty to use default.
            </p>
          </div>

          {/* Accent color */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Accent Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={pageSettings.accentColor ?? "#6366f1"}
                onChange={(e) =>
                  setPageSettings((s) => ({ ...s, accentColor: e.target.value }))
                }
                className="h-8 w-10 rounded cursor-pointer border border-border bg-bg"
              />
              <input
                type="text"
                placeholder="#6366f1"
                value={pageSettings.accentColor ?? ""}
                onChange={(e) =>
                  setPageSettings((s) => ({ ...s, accentColor: e.target.value || undefined }))
                }
                className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-xs font-mono text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
              />
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Override the default accent color on the public page.
            </p>
          </div>

          {/* Auto-refresh interval */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              <RefreshCw className="inline h-3 w-3 mr-1" />
              Auto-Refresh Interval
            </label>
            <select
              value={pageSettings.autoRefreshInterval ?? 60}
              onChange={(e) =>
                setPageSettings((s) => ({
                  ...s,
                  autoRefreshInterval: Number(e.target.value),
                }))
              }
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              <option value={0}>Off (manual only)</option>
              <option value={10}>Every 10 seconds</option>
              <option value={30}>Every 30 seconds</option>
              <option value={60}>Every 60 seconds (default)</option>
              <option value={300}>Every 5 minutes</option>
              <option value={600}>Every 10 minutes</option>
            </select>
          </div>

          {/* Theme selector */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Theme</label>
            <div className="flex rounded-lg border border-border bg-bg overflow-hidden">
              {(["dark", "light", "system"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setPageSettings((s) => ({ ...s, theme: t }))}
                  className={`flex-1 py-1.5 text-xs font-medium capitalize transition ${
                    (pageSettings.theme ?? "dark") === t
                      ? "bg-accent/15 text-accent"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Font selector */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Font</label>
            <select
              value={pageSettings.fontFamily ?? "inter"}
              onChange={(e) =>
                setPageSettings((s) => ({
                  ...s,
                  fontFamily: e.target.value as PageSettings["fontFamily"],
                }))
              }
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              <option value="inter">Inter (default)</option>
              <option value="roboto">Roboto</option>
              <option value="system">System UI</option>
              <option value="mono">Monospace</option>
            </select>
          </div>

          {/* Background style */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Background</label>
            <div className="flex rounded-lg border border-border bg-bg overflow-hidden mb-2">
              {(["solid", "gradient", "grid-dots"] as const).map((style) => (
                <button
                  key={style}
                  onClick={() => setPageSettings((s) => ({ ...s, backgroundStyle: style }))}
                  className={`flex-1 py-1.5 text-xs font-medium capitalize transition ${
                    (pageSettings.backgroundStyle ?? "solid") === style
                      ? "bg-accent/15 text-accent"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {style === "grid-dots" ? "Grid Dots" : style}
                </button>
              ))}
            </div>
            {(pageSettings.backgroundStyle ?? "solid") === "solid" && (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={pageSettings.backgroundColor ?? "#0f1117"}
                  onChange={(e) =>
                    setPageSettings((s) => ({ ...s, backgroundColor: e.target.value }))
                  }
                  className="h-8 w-10 rounded cursor-pointer border border-border bg-bg"
                />
                <input
                  type="text"
                  placeholder="#0f1117"
                  value={pageSettings.backgroundColor ?? ""}
                  onChange={(e) =>
                    setPageSettings((s) => ({
                      ...s,
                      backgroundColor: e.target.value || undefined,
                    }))
                  }
                  className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-xs font-mono text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Branding toggle */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-bg/60 px-4 py-3">
            <div>
              <p className="text-xs font-medium text-text-primary">
                Show &quot;Powered by {brand.name}&quot;
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                Displays the {brand.name} branding in the page footer.
              </p>
            </div>
            <button
              onClick={() =>
                setPageSettings((s) => ({
                  ...s,
                  showBranding: !(s.showBranding !== false),
                }))
              }
              className={`relative h-5 w-9 rounded-full transition-colors ${
                pageSettings.showBranding !== false
                  ? "bg-accent"
                  : "bg-surface-elevated border border-border"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  pageSettings.showBranding !== false ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {/* Password Protection */}
          <div className="pt-2 border-t border-border/50">
            <p className="text-xs font-semibold text-text-primary mb-2">Password Protection</p>
            {page.hasPassword ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-text-primary">Password protected</p>
                      <p className="text-[10px] text-text-secondary">
                        Viewers must enter the password to view this page.
                      </p>
                    </div>
                  </div>
                </div>

                {!confirmRemovePassword && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowChangePassword((v) => !v);
                        setPasswordInput("");
                        setPasswordConfirm("");
                      }}
                      className="text-xs text-accent hover:text-accent/80 transition-colors"
                    >
                      {showChangePassword ? "↑ Cancel" : "Change password"}
                    </button>

                    {showChangePassword && (
                      <div className="space-y-2">
                        <input
                          type="password"
                          placeholder="New password"
                          value={passwordInput}
                          onChange={(e) => setPasswordInput(e.target.value)}
                          className="w-full rounded-lg border border-border bg-bg px-2.5 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                          autoFocus
                        />
                        <input
                          type="password"
                          placeholder="Confirm new password"
                          value={passwordConfirm}
                          onChange={(e) => setPasswordConfirm(e.target.value)}
                          className={`w-full rounded-lg border bg-bg px-2.5 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:outline-none ${
                            passwordConfirm && passwordInput !== passwordConfirm
                              ? "border-danger focus:border-danger"
                              : "border-border focus:border-accent"
                          }`}
                        />
                        {passwordConfirm && passwordInput !== passwordConfirm && (
                          <p className="text-[10px] text-danger">Passwords don&apos;t match</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowChangePassword(false);
                              setPasswordInput("");
                              setPasswordConfirm("");
                            }}
                            className="flex-1 rounded-lg border border-border py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={
                              changingPassword ||
                              !passwordInput ||
                              passwordInput !== passwordConfirm
                            }
                            onClick={async () => {
                              setChangingPassword(true);
                              try {
                                await api(`/v1/status-pages/${id}`, undefined, {
                                  method: "PATCH",
                                  body: JSON.stringify({ password: passwordInput }),
                                });
                                setPasswordInput("");
                                setPasswordConfirm("");
                                setShowChangePassword(false);
                                toastCtx.success("Password updated");
                              } catch {
                                toastCtx.error("Failed to update password");
                              } finally {
                                setChangingPassword(false);
                              }
                            }}
                            className="flex-1 rounded-lg bg-accent py-1.5 text-xs font-semibold text-white disabled:opacity-50 transition-colors"
                          >
                            {changingPassword ? "Updating…" : "Update"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!showChangePassword &&
                  (confirmRemovePassword ? (
                    <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 space-y-2">
                      <p className="text-xs font-medium text-danger">Remove password?</p>
                      <p className="text-[10px] text-text-secondary">
                        The page will become publicly accessible to anyone with the link.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmRemovePassword(false)}
                          className="flex-1 rounded-lg border border-border py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={changingPassword}
                          onClick={async () => {
                            setChangingPassword(true);
                            try {
                              await api(`/v1/status-pages/${id}`, undefined, {
                                method: "PATCH",
                                body: JSON.stringify({ removePassword: true }),
                              });
                              setPage((p) => (p ? { ...p, hasPassword: false } : p));
                              setConfirmRemovePassword(false);
                              toastCtx.success("Password removed — page is now public");
                            } catch {
                              toastCtx.error("Failed to remove password");
                            } finally {
                              setChangingPassword(false);
                            }
                          }}
                          className="flex-1 rounded-lg bg-danger py-1.5 text-xs font-semibold text-white disabled:opacity-50 transition-colors"
                        >
                          {changingPassword ? "Removing…" : "Yes, remove"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRemovePassword(true)}
                      className="text-xs text-danger/70 hover:text-danger transition-colors"
                    >
                      Remove password protection
                    </button>
                  ))}
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-bg/60 px-4 py-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-text-secondary shrink-0" />
                  <p className="text-xs text-text-secondary">
                    No password — page is publicly accessible to anyone.
                  </p>
                </div>
                <div className="space-y-2">
                  <input
                    type="password"
                    placeholder="Enter a password to restrict access"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="w-full rounded-lg border border-border bg-bg px-2.5 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                  />
                  <input
                    type="password"
                    placeholder="Confirm password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    className={`w-full rounded-lg border bg-bg px-2.5 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:outline-none ${
                      passwordConfirm && passwordInput !== passwordConfirm
                        ? "border-danger focus:border-danger"
                        : "border-border focus:border-accent"
                    }`}
                  />
                  {passwordConfirm && passwordInput !== passwordConfirm && (
                    <p className="text-[10px] text-danger">Passwords don&apos;t match</p>
                  )}
                  <button
                    type="button"
                    disabled={
                      changingPassword ||
                      !passwordInput ||
                      passwordInput !== passwordConfirm
                    }
                    onClick={async () => {
                      setChangingPassword(true);
                      try {
                        await api(`/v1/status-pages/${id}`, undefined, {
                          method: "PATCH",
                          body: JSON.stringify({ password: passwordInput }),
                        });
                        setPasswordInput("");
                        setPasswordConfirm("");
                        setPage((p) => (p ? { ...p, hasPassword: true } : p));
                        toastCtx.success("Password set — viewers must enter it to access");
                      } catch {
                        toastCtx.error("Failed to set password");
                      } finally {
                        setChangingPassword(false);
                      }
                    }}
                    className="w-full rounded-lg bg-accent py-2 text-xs font-semibold text-white disabled:opacity-50 transition-colors hover:bg-accent/90"
                  >
                    {changingPassword ? "Setting…" : "Set password"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Webhook Notifications */}
          <div className="pt-2 border-t border-border/50">
            <p className="text-xs font-semibold text-text-primary mb-1">Webhook Notifications</p>
            <p className="text-[11px] text-text-muted mb-3">
              Receive a POST request when the overall page status changes between{" "}
              <span className="text-green-400 font-medium">operational</span>,{" "}
              <span className="text-yellow-400 font-medium">degraded</span>, and{" "}
              <span className="text-red-400 font-medium">outage</span>.
            </p>
            <div className="rounded-xl border border-border bg-bg/60 px-4 py-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Webhook URL
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/webhook/status"
                  value={pageSettings.notifyWebhookUrl ?? ""}
                  onChange={(e) =>
                    setPageSettings((s) => ({
                      ...s,
                      notifyWebhookUrl: e.target.value || undefined,
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                />
                <p className="text-[10px] text-text-secondary mt-1">
                  Leave empty to disable. Save the page to apply changes.
                </p>
              </div>
              {pageSettings.notifyWebhookUrl && (
                <div className="rounded-lg bg-surface-elevated/50 border border-border/50 p-2.5">
                  <p className="text-[10px] font-semibold text-text-secondary mb-1.5">
                    Example payload
                  </p>
                  <pre className="text-[10px] text-text-muted font-mono whitespace-pre-wrap leading-relaxed">
                    {JSON.stringify(
                      {
                        event: "status_page.status_changed",
                        slug: page.slug ?? "my-page",
                        status: "degraded",
                        previousStatus: "operational",
                        timestamp: new Date().toISOString(),
                        affectedMonitors: [{ id: "abc123", name: "API" }],
                      },
                      null,
                      2,
                    )}
                  </pre>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Slack Webhook URL
                </label>
                <input
                  type="url"
                  placeholder="https://hooks.slack.com/services/..."
                  value={pageSettings.slackWebhookUrl ?? ""}
                  onChange={(e) =>
                    setPageSettings((s) => ({
                      ...s,
                      slackWebhookUrl: e.target.value || undefined,
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                />
                <p className="text-[10px] text-text-secondary mt-1">
                  Optional. Posts a Slack message when the page status changes.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Discord Webhook URL
                </label>
                <input
                  type="url"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={pageSettings.discordWebhookUrl ?? ""}
                  onChange={(e) =>
                    setPageSettings((s) => ({
                      ...s,
                      discordWebhookUrl: e.target.value || undefined,
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                />
                <p className="text-[10px] text-text-secondary mt-1">
                  Optional. Posts a Discord embed when the page status changes.
                </p>
              </div>
            </div>
          </div>

          {/* Advanced / Custom CSS */}
          <div className="pt-2 border-t border-border/50">
            <p className="text-xs font-semibold text-text-primary mb-3">Advanced</p>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Custom CSS <span className="text-text-muted">(advanced)</span>
              </label>
              <textarea
                rows={6}
                placeholder={
                  "/* Add custom styles for your status page */\nbody { font-family: 'Inter', sans-serif; }\n.page-title { color: #6366f1; }"
                }
                value={pageSettings.customCss ?? ""}
                onChange={(e) =>
                  setPageSettings((s) => ({ ...s, customCss: e.target.value || undefined }))
                }
                className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none font-mono resize-y min-h-[80px]"
                spellCheck={false}
              />
              <p className="text-[10px] text-text-secondary mt-1">
                CSS injected into the public page &lt;head&gt;. Use to override fonts, colors, or
                layout. Max 10,000 characters.
              </p>
            </div>
          </div>

          {/* SEO Section */}
          <div className="pt-2 border-t border-border/50">
            <p className="text-xs font-semibold text-text-primary mb-3">SEO &amp; Social Sharing</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Meta Title
                </label>
                <input
                  type="text"
                  placeholder="My Company Status"
                  maxLength={60}
                  value={pageSettings.metaTitle ?? ""}
                  onChange={(e) =>
                    setPageSettings((s) => ({
                      ...s,
                      metaTitle: e.target.value || undefined,
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                />
                <p className="mt-1 text-[10px] text-text-muted">
                  Overrides the page title in search results and browser tab (max 60 chars).
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Meta Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Live status and uptime for all our services."
                  maxLength={160}
                  value={pageSettings.metaDescription ?? ""}
                  onChange={(e) =>
                    setPageSettings((s) => ({
                      ...s,
                      metaDescription: e.target.value || undefined,
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                />
                <p className="mt-1 text-[10px] text-text-muted">
                  Shown in search engine snippets (max 160 chars).
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  OG Image URL
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/og-image.png"
                  value={pageSettings.ogImageUrl ?? ""}
                  onChange={(e) =>
                    setPageSettings((s) => ({
                      ...s,
                      ogImageUrl: e.target.value || undefined,
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:outline-none"
                />
                <p className="mt-1 text-[10px] text-text-muted">
                  Image shown when sharing on Twitter, Discord, Slack, etc. (1200×630px recommended).
                </p>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border bg-bg/60 px-4 py-3">
                <div>
                  <p className="text-xs font-medium text-text-primary">
                    Allow search engines to index
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    Adds robots meta tag (index, follow). Disable for private pages.
                  </p>
                </div>
                <button
                  onClick={() =>
                    setPageSettings((s) => ({
                      ...s,
                      robotsIndex: !(s.robotsIndex !== false),
                    }))
                  }
                  className={`relative h-5 w-9 rounded-full transition-colors ${
                    pageSettings.robotsIndex !== false
                      ? "bg-accent"
                      : "bg-surface-elevated border border-border"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      pageSettings.robotsIndex !== false ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4 shrink-0">
          <button
            onClick={onClose}
            className="rounded-lg border border-border bg-bg px-4 py-2 text-xs font-medium text-text-secondary hover:text-text-primary transition"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onClose();
              onSave();
            }}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition hover:bg-accent/90"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
