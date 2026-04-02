"use client";

import React from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, Activity, Award, Clock, TrendingUp, Zap, Settings, Play, Power, PowerOff, Trash2, Gauge, Wifi, Shield, Globe, FileText, GitCompare, MessageSquare, Pin, List, BarChart2 } from "lucide-react";
import { Breadcrumb } from "../../../components/breadcrumb";
import { api } from "../../../lib/api";
import { getUser } from "../../../components/auth";
import { AppFrame } from "../../../components/app-frame";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { formatMonitorType } from "../../components/timeUtils";
import type { MonitorItem } from "./components/types";
import type { TabDef } from "./components/MonitorTabBar";
import { MonitorTabBar } from "./components/MonitorTabBar";
import nextDynamic from "next/dynamic";
import { useMonitorDetail } from "./components/useMonitorDetail";

import type { Annotation } from "./components/AnnotationsTab";
import type { MetricHistoryData } from "./components/MetricTab";
import type { LatencyDistributionData, StatusTransitionsData, PeriodComparisonData } from "./components/PerformanceTab";

// ── Lazy-loaded tab components ──────────────────────────────────────────────
const SloTab = nextDynamic(() => import("./components/SloTab").then(m => ({ default: m.SloTab })), { ssr: false });
const CertificateModal = nextDynamic(() => import("./components/CertificateModal").then(m => ({ default: m.CertificateModal })), { ssr: false });
const OverviewTab = nextDynamic(() => import("./components/OverviewTab").then(m => ({ default: m.OverviewTab })), { ssr: false });
const PerformanceTab = nextDynamic(() => import("./components/PerformanceTab").then(m => ({ default: m.PerformanceTab })), { ssr: false });
const SimulateTab = nextDynamic(() => import("./components/SimulateTab").then(m => ({ default: m.SimulateTab })), { ssr: false });
const MetricTab = nextDynamic(() => import("./components/MetricTab").then(m => ({ default: m.MetricTab })), { ssr: false });
const GeoTab = nextDynamic(() => import("./components/GeoTab").then(m => ({ default: m.GeoTab })), { ssr: false });
const FailuresTab = nextDynamic(() => import("./components/FailuresTab").then(m => ({ default: m.FailuresTab })), { ssr: false });
const AnnotationsTab = nextDynamic(() => import("./components/AnnotationsTab").then(m => ({ default: m.AnnotationsTab })), { ssr: false });
const SecurityTab = nextDynamic(() => import("./components/SecurityTab").then(m => ({ default: m.SecurityTab })), { ssr: false });
const CertificateTab = nextDynamic(() => import("./components/CertificateTab").then(m => ({ default: m.CertificateTab })), { ssr: false });
const DomainTab = nextDynamic(() => import("./components/DomainTab").then(m => ({ default: m.DomainTab })), { ssr: false });
const ContentTab = nextDynamic(() => import("./components/ContentTab").then(m => ({ default: m.ContentTab })), { ssr: false });
const HeadersTab = nextDynamic(() => import("./components/HeadersTab").then(m => ({ default: m.HeadersTab })), { ssr: false });
const DiffTab = nextDynamic(() => import("./components/DiffTab").then(m => ({ default: m.DiffTab })), { ssr: false });
const CtLogTab = nextDynamic(() => import("./components/CtLogTab").then(m => ({ default: m.CtLogTab })), { ssr: false });
const TransactionTab = nextDynamic(() => import("./components/TransactionTab").then(m => ({ default: m.TransactionTab })), { ssr: false });
const ConfigHistoryTab = nextDynamic(() => import("./components/ConfigHistoryTab").then(m => ({ default: m.ConfigHistoryTab })), { ssr: false });

export default function MonitorDetailPage() {
  const s = useMonitorDetail();

  if (s.loading) {
    return (
      <AppFrame title="Monitor Detail">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-accent border-t-transparent" />
        </div>
      </AppFrame>
    );
  }
  if (s.error) {
    return (
      <AppFrame title="Monitor Detail">
        <div className="flex items-start gap-3 p-4 rounded-xl bg-danger/10 border border-danger/20">
          <AlertCircle className="w-5 h-5 text-danger mt-0.5 shrink-0" />
          <span className="text-danger text-sm">{s.error}</span>
        </div>
      </AppFrame>
    );
  }
  if (!s.monitor) return null;

  const monitor = s.monitor;
  const lastRun = s.runs[0] ?? null;
  let streak = 0;
  if (s.runs.length > 0) {
    const streakOk = s.runs[0].ok;
    for (const run of s.runs) { if (run.ok === streakOk) streak++; else break; }
  }
  const streakLabel = s.runs.length === 0 ? "No runs yet" : `${streak} × ${s.runs[0].level === "yellow" ? "Degraded" : s.runs[0].ok ? "OK" : "Failed"}`;
  const uptimeColor = s.uptime === null ? "text-text-primary" : s.uptime.uptimePct >= 99.9 ? "text-success" : s.uptime.uptimePct >= 99 ? "text-warning" : "text-danger";

  // ── Tab defs ──────────────────────────────────────────────────────────────
  const isHttp = monitor.type === "HTTP" || monitor.type === "BROWSER";
  const hasCert = isHttp || monitor.type === "SSL_CERT";
  const hasPerf = isHttp || monitor.type === "TCP";
  const hasSecurityHeaders = isHttp && !!(monitor.config as Record<string, unknown>)?.checkSecurityHeaders;
  const hasContentChanges = isHttp && !!(monitor.config as Record<string, unknown>)?.detectContentChanges;
  const hasTrackedHeaders = isHttp && !!((monitor as MonitorItem & { trackedHeaders?: string | null }).trackedHeaders);
  const hasGeo = !!monitor.geoRegions && monitor.geoRegions.length > 0;
  const hasMetric = isHttp && !!monitor.metricPath;

  const loadPerf = async () => {
    const user = getUser(); if (!user) return;
    s.setPerfLoading(true); s.setPerfError(null);
    try {
      const [data, comparison, txData] = await Promise.all([
        api<LatencyDistributionData>(`/v1/monitors/${s.id}/latency-distribution?period=${s.perfPeriod}`, user.id),
        api<PeriodComparisonData>(`/v1/monitors/${s.id}/period-comparison?period=${s.perfPeriod}`, user.id).catch(() => null),
        api<StatusTransitionsData>(`/v1/monitors/${s.id}/status-transitions?period=${s.perfPeriod}`, user.id).catch(() => null),
      ]);
      s.setPerfData(data); s.setPerfComparison(comparison); s.setTransitionsData(txData);
    } catch { s.setPerfError("Failed to load performance data"); }
    finally { s.setPerfLoading(false); }
  };

  const loadCert = async () => {
    if (s.certDetails || s.certLoading) return;
    const user = getUser(); if (!user) return;
    s.setCertLoading(true);
    try { s.setCertDetails(await api<Record<string, unknown>>(`/v1/monitors/${s.id}/certificate`, user.id)); }
    catch { s.setCertDetails({ supported: true, available: false, reason: "Failed to fetch certificate details" }); }
    finally { s.setCertLoading(false); }
  };

  const loadAnnotations = async () => {
    const user = getUser(); if (!user || s.annotations.length > 0) return;
    s.setAnnotationsLoading(true);
    try { const data = await api<{ annotations: Annotation[] }>(`/v1/monitors/${s.id}/annotations`, user.id); s.setAnnotations(data.annotations ?? []); }
    catch {} finally { s.setAnnotationsLoading(false); }
  };

  const loadMetric = async () => {
    const user = getUser(); if (!user) return;
    s.setMetricData(null);
    try { s.setMetricData(await api<MetricHistoryData>(`/v1/monitors/${s.id}/metric-history?periodDays=${s.metricPeriod}&limit=200`, user.id)); }
    catch {} finally {}
  };

  const tabs: TabDef[] = [
    { id: "overview", label: "Overview", primary: true },
    { id: "slo", label: "SLO / SLI", icon: Gauge, primary: true },
    { id: "performance", label: "Performance", icon: TrendingUp, primary: true, visible: hasPerf, onSelect: loadPerf },
    { id: "failures", label: "Failures", icon: AlertTriangle, primary: true },
    { id: "certificate", label: "Certificate", icon: Shield, primary: false, visible: hasCert, onSelect: loadCert },
    { id: "domain", label: "Domain", icon: Globe, primary: false, visible: monitor.type === "WHOIS" },
    { id: "ctlog", label: "CT Logs", icon: Shield, primary: false, visible: monitor.type === "CT_LOG" },
    { id: "transaction", label: "Steps", icon: List, primary: false, visible: monitor.type === "TRANSACTION" },
    { id: "security", label: "Security", icon: Shield, primary: false, visible: hasSecurityHeaders },
    { id: "content", label: "Content", icon: FileText, primary: false, visible: hasContentChanges },
    { id: "headers", label: "Headers", icon: List, primary: false, visible: hasTrackedHeaders },
    { id: "diff", label: "Diff", icon: GitCompare, primary: false, visible: isHttp },
    { id: "geo", label: "Geo", icon: Globe, primary: false, visible: hasGeo },
    { id: "annotations", label: "Annotations", icon: MessageSquare, primary: false, badge: s.annotations.length, onSelect: loadAnnotations },
    { id: "simulate", label: "Simulate", icon: Zap, primary: false },
    { id: "metric", label: "Metric", icon: BarChart2, primary: false, visible: hasMetric, onSelect: loadMetric },
    { id: "config-history", label: "Config History", icon: Clock, primary: false },
  ];

  return (
    <AppFrame title={monitor.name} breadcrumbs={[{ label: "Monitors", href: "/monitors" }, { label: monitor.name }]}>
      <div className="space-y-6">
        <Breadcrumb items={[{ label: "Monitors", href: "/monitors" }, { label: monitor.name }]} />

        {/* Header */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold text-text-primary">{monitor.name}</h1>
              <Badge variant="default">{formatMonitorType(monitor.type)}</Badge>
              <Badge variant={monitor.enabled ? "success" : "warning"}>{monitor.enabled ? "Enabled" : "Disabled"}</Badge>
              {s.liveConnected && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-success/10 text-success border border-success/20"><Wifi className="w-3 h-3" />Live</span>}
              {(monitor as typeof monitor & { priority?: number }).priority != null && (monitor as typeof monitor & { priority?: number }).priority! > 0 && (() => {
                const p = (monitor as typeof monitor & { priority?: number }).priority!;
                const label = ["", "P1 — Critical", "P2 — High", "P3 — Medium", "P4 — Low"][p] ?? "";
                const cls = p === 1 ? "bg-danger/15 text-danger border-danger/30" : p === 2 ? "bg-warning/15 text-warning border-warning/30" : p === 3 ? "bg-accent/15 text-accent border-accent/30" : "bg-surface-elevated text-text-secondary border-border";
                return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${cls}`}>{label}</span>;
              })()}
              {monitor.isFlapping && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-warning/15 text-warning border border-warning/30 animate-pulse">⚡ Flapping</span>}
              {monitor.mutedUntil && new Date(monitor.mutedUntil) > new Date() && (
                <button onClick={s.handleUnmute} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:border-amber-400/60 transition-colors">🔇 Muted until {new Date(monitor.mutedUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</button>
              )}
              {monitor.isAcknowledged && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">🔔 Acknowledged</span>
                  <button onClick={s.handleClearAck} className="text-xs text-text-muted hover:text-text-secondary underline underline-offset-2">Clear</button>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative">
                <button onClick={() => s.setShowMuteMenu((v) => !v)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-amber-500/30 bg-amber-500/5 text-amber-400/80 hover:text-amber-400 transition-colors">🔇 Mute</button>
                {s.showMuteMenu && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-40 rounded-xl border border-border bg-surface-elevated shadow-lg overflow-hidden">
                    {[{ label: "30 min", minutes: 30 }, { label: "1 hour", minutes: 60 }, { label: "4 hours", minutes: 240 }, { label: "24 hours", minutes: 1440 }].map(({ label, minutes }) => (
                      <button key={minutes} onClick={() => s.handleMute(minutes)} className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:bg-surface hover:text-text-primary transition-colors">{label}</button>
                    ))}
                  </div>
                )}
              </div>
              {!monitor.isAcknowledged && lastRun && !lastRun.ok && <button onClick={() => s.setShowAckModal(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-blue-500/30 bg-blue-500/5 text-blue-400/80 hover:text-blue-400 transition-colors">🔔 Acknowledge</button>}
              <Button size="sm" variant="secondary" onClick={s.handleRunNow} disabled={s.running || !monitor.enabled} className="flex items-center gap-1.5"><Play className="w-3.5 h-3.5" />{s.running ? "Running…" : "Run Now"}</Button>
              <Button size="sm" variant="secondary" onClick={s.handleToggle} disabled={s.toggling} className={`flex items-center gap-1.5 ${monitor.enabled ? "text-warning border-warning/40" : "text-success border-success/40"}`}>
                {monitor.enabled ? <><PowerOff className="w-3.5 h-3.5" />{s.toggling ? "Disabling…" : "Disable"}</> : <><Power className="w-3.5 h-3.5" />{s.toggling ? "Enabling…" : "Enable"}</>}
              </Button>
              <button onClick={async () => { const user = getUser(); if (!user) return; const result = await api<{ pinned: boolean }>(`/v1/monitors/${monitor.id}/pin`, user.id, { method: "POST" }); s.setMonitor((prev) => prev ? { ...prev, pinned: result.pinned } : prev); }} className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors ${monitor.pinned ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-surface-elevated text-text-secondary border-border"}`}><Pin className="w-3.5 h-3.5" />{monitor.pinned ? "Pinned" : "Pin"}</button>
              <Link href={`/monitors#edit-${monitor.id}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-border bg-surface-elevated text-text-secondary hover:text-accent transition-colors"><Settings className="w-3.5 h-3.5" />Edit</Link>
              <button onClick={() => s.setShowCertModal(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-border bg-surface-elevated text-text-secondary hover:text-accent transition-colors"><Award className="w-3.5 h-3.5" />Certificate</button>
              <button onClick={async () => { if (!confirm(`Delete "${monitor.name}"?`)) return; const user = getUser(); if (!user) return; try { await api(`/v1/monitors/${monitor.id}`, user.id, { method: "DELETE" }); s.router.push("/monitors"); } catch (e) { s.setActionError(e instanceof Error ? e.message : "Failed to delete monitor"); } }} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-danger/30 bg-danger/5 text-danger/70 hover:text-danger transition-colors"><Trash2 className="w-3.5 h-3.5" />Delete</button>
            </div>
          </div>
          <p className="text-sm text-text-secondary font-mono truncate max-w-[600px]" title={monitor.target}>{monitor.target}</p>
          {monitor.description && <p className="text-sm text-text-secondary">{monitor.description}</p>}
          {monitor.tags && monitor.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {monitor.tags.map((tag) => <a key={tag.id} href={`/monitors?tag=${encodeURIComponent(tag.name)}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-border hover:border-accent/40 transition-colors" style={tag.color ? { backgroundColor: `${tag.color}22`, color: tag.color, borderColor: `${tag.color}44` } : {}}>{tag.name}</a>)}
            </div>
          )}
        </div>

        {s.actionError && <div className="flex items-start gap-3 p-3 rounded-xl bg-danger/10 border border-danger/20"><AlertCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" /><span className="text-danger text-sm">{s.actionError}</span></div>}
        {s.toast && <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-surface-elevated border border-border shadow-xl text-sm text-text-primary animate-fade-in">{s.toast}</div>}

        <MonitorTabBar tabs={tabs} activeTab={s.activeMainTab} onTabChange={(tabId) => s.setActiveMainTab(tabId as typeof s.activeMainTab)} />

        {/* Tab Content */}
        {s.activeMainTab === "overview" && <OverviewTab id={s.id} monitor={monitor} runs={s.runs} uptime={s.uptime} uptimePeriod={s.uptimePeriod} uptimeLoading={s.uptimeLoading} uptimeColor={uptimeColor} onUptimePeriodChange={s.setUptimePeriod} chartPeriod={s.chartPeriod} onChartPeriodChange={s.setChartPeriod} chartData={s.chartData} chartLoading={s.chartLoading} healthScore={s.healthScore} errorBudget={s.errorBudget} latencyBudgetReport={s.latencyBudgetReport} latencyBudgetInput={s.latencyBudgetInput} onLatencyBudgetInputChange={s.setLatencyBudgetInput} latencyBudgetSaving={s.latencyBudgetSaving} onSaveLatencyBudget={s.handleSaveLatencyBudget} onMonitorUpdated={(patch) => s.setMonitor((prev) => prev ? { ...prev, ...patch } : prev)} alertChannels={s.alertChannels} onAlertChannelNotifyChange={s.handleAlertChannelNotifyChange} dependencies={s.dependencies} allMonitors={s.allMonitors} showAddDep={s.showAddDep} onShowAddDepChange={s.setShowAddDep} addingDepId={s.addingDepId} onAddingDepIdChange={s.setAddingDepId} depLoading={s.depLoading} onAddDependency={s.handleAddDependency} onRemoveDependency={s.handleRemoveDependency} linkedIncidents={s.linkedIncidents} deliveryHistory={s.deliveryHistory} events={s.events} newEventMsg={s.newEventMsg} onNewEventMsgChange={s.setNewEventMsg} newEventType={s.newEventType} onNewEventTypeChange={s.setNewEventType} addingEvent={s.addingEvent} eventError={s.eventError} onAddEvent={s.handleAddEvent} onDeleteEvent={s.handleDeleteEvent} runsStatusFilter={s.runsStatusFilter} runsHasMore={s.runsHasMore} runsTotal={s.runsTotal} runsLoadingMore={s.runsLoadingMore} expandedRunId={s.expandedRunId} onExpandedRunIdChange={s.setExpandedRunId} onLoadFilteredRuns={s.loadFilteredRuns} onLoadMoreRuns={s.loadMoreRuns} shareToken={monitor.shareToken ?? null} shareTokenLoading={s.shareTokenLoading} shareTokenCopied={s.shareTokenCopied} onGenerateShareToken={s.handleGenerateShareToken} onRevokeShareToken={s.handleRevokeShareToken} onCopyShareUrl={s.handleCopyShareUrl} streakLabel={streakLabel} lastRun={lastRun} router={s.router} />}
        {s.activeMainTab === "slo" && (() => { const user = getUser(); return user ? <SloTab monitor={monitor} userId={user.id} onMonitorUpdated={(updated) => s.setMonitor((prev) => prev ? { ...prev, ...updated } : prev)} /> : null; })()}
        {s.activeMainTab === "performance" && <PerformanceTab runs={s.runs} monitorType={monitor.type} perfData={s.perfData} perfLoading={s.perfLoading} perfError={s.perfError} perfPeriod={s.perfPeriod} onPerfPeriodChange={s.handlePerfPeriodChange} transitionsData={s.transitionsData} perfComparison={s.perfComparison} latencyHistory={s.latencyHistory} latencyHistoryLoading={s.latencyHistoryLoading} latencyHistoryDays={s.latencyHistoryDays} onLatencyHistoryDaysChange={s.setLatencyHistoryDays} />}
        {s.activeMainTab === "simulate" && <SimulateTab monitorId={s.id} simConfirmations={s.simConfirmations} simFlapDetection={s.simFlapDetection} simFlapWindow={s.simFlapWindow} simFlapThreshold={s.simFlapThreshold} simScheduleEnabled={s.simScheduleEnabled} simScheduleStartHour={s.simScheduleStartHour} simScheduleEndHour={s.simScheduleEndHour} simLoading={s.simLoading} simError={s.simError} simResult={s.simResult} showApplyConfirm={s.showApplyConfirm} applyLoading={s.applyLoading} onConfirmationsChange={s.setSimConfirmations} onFlapDetectionChange={s.setSimFlapDetection} onFlapWindowChange={s.setSimFlapWindow} onFlapThresholdChange={s.setSimFlapThreshold} onScheduleEnabledChange={s.setSimScheduleEnabled} onScheduleStartHourChange={s.setSimScheduleStartHour} onScheduleEndHourChange={s.setSimScheduleEndHour} onSimulate={s.handleSimulate} onShowApplyConfirm={s.setShowApplyConfirm} onApply={s.handleApplySim} />}
        {s.activeMainTab === "metric" && <MetricTab monitor={monitor} metricData={s.metricData} metricLoading={s.metricLoading} metricError={s.metricError} metricPeriod={s.metricPeriod} onPeriodChange={s.handleMetricPeriodChange} />}
        {s.activeMainTab === "geo" && <GeoTab monitor={monitor} geoStats={s.geoStats} geoStatsLoading={s.geoStatsLoading} geoPeriod={s.geoPeriod} onPeriodChange={(p) => s.setGeoPeriod(p)} />}
        {s.activeMainTab === "failures" && <FailuresTab failurePatterns={s.failurePatterns} failurePatternsLoading={s.failurePatternsLoading} failuresPeriod={s.failuresPeriod} onPeriodChange={(p) => s.setFailuresPeriod(p)} />}
        {s.activeMainTab === "annotations" && <AnnotationsTab monitorId={s.id} annotations={s.annotations} annotationsLoading={s.annotationsLoading} annotationText={s.annotationText} annotationColor={s.annotationColor} annotationDate={s.annotationDate} annotationSaving={s.annotationSaving} onAnnotationTextChange={s.setAnnotationText} onAnnotationColorChange={s.setAnnotationColor} onAnnotationDateChange={s.setAnnotationDate} onAnnotationAdded={(ann) => s.setAnnotations((prev) => [ann, ...prev])} onAnnotationDeleted={(annId) => s.setAnnotations((prev) => prev.filter((a) => a.id !== annId))} onSavingChange={s.setAnnotationSaving} />}
        {s.activeMainTab === "security" && isHttp && <SecurityTab runs={s.runs} />}
        {s.activeMainTab === "certificate" && <CertificateTab certDetails={s.certDetails} certLoading={s.certLoading} monitorId={s.id} onCertDetailsLoaded={s.setCertDetails} onLoadingChange={s.setCertLoading} />}
        {s.activeMainTab === "domain" && monitor.type === "WHOIS" && <DomainTab monitor={monitor} runs={s.runs} lastRun={lastRun} />}
        {s.activeMainTab === "content" && isHttp && <ContentTab monitor={monitor} runs={s.runs} onMonitorUpdated={(patch) => s.setMonitor((prev) => prev ? { ...prev, ...patch } : prev)} />}
        {(s.activeMainTab as string) === "headers" && isHttp && <HeadersTab monitor={monitor} runs={s.runs} onMonitorUpdated={(patch) => s.setMonitor((prev) => prev ? { ...prev, ...patch } : prev)} />}
        {(s.activeMainTab as string) === "diff" && isHttp && <DiffTab runs={s.runs} diffRunId={s.diffRunId} diffData={s.diffData} diffLoading={s.diffLoading} diffError={s.diffError} onLoadDiff={s.loadDiff} />}
        {(s.activeMainTab as string) === "ctlog" && monitor.type === "CT_LOG" && <CtLogTab runs={s.runs} />}
        {(s.activeMainTab as string) === "transaction" && monitor.type === "TRANSACTION" && <TransactionTab runs={s.runs} />}
        {(s.activeMainTab as string) === "config-history" && <ConfigHistoryTab configHistory={s.configHistory} configHistoryLoading={s.configHistoryLoading} />}
      </div>

      {s.showAckModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => s.setShowAckModal(false)}>
          <div className="w-full max-w-md mx-4 rounded-2xl border border-border bg-surface-elevated shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-text-primary mb-1">Acknowledge Alert</h2>
            <p className="text-sm text-text-secondary mb-4">Acknowledge this alert to suppress further notifications until the monitor recovers.</p>
            <textarea value={s.ackNote} onChange={(e) => s.setAckNote(e.target.value)} placeholder="Optional note…" maxLength={500} rows={3} className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-surface text-text-primary placeholder-text-muted resize-none focus:outline-none focus:ring-1 focus:ring-accent mb-4" />
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => s.setShowAckModal(false)} className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors">Cancel</button>
              <button onClick={s.handleAcknowledge} disabled={s.ackLoading} className="px-4 py-2 text-sm font-medium rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50">{s.ackLoading ? "Acknowledging…" : "Acknowledge"}</button>
            </div>
          </div>
        </div>
      )}
      {s.showCertModal && monitor && <CertificateModal monitor={monitor} onClose={() => s.setShowCertModal(false)} onGenerateShareToken={s.handleGenerateShareToken} />}
    </AppFrame>
  );
}
