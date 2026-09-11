'use client';

import { useCallback, useEffect, useState } from 'react';
import { getUser } from '../../../../components/auth';
import { api } from '../../../../lib/api';
import { useToast } from '../../../../components/ui/toast';
import type {
  SlaDashboard,
  SlaBudgetForecast,
  TagSlaEntry,
  ComplianceReport,
  SortKey,
} from '../types';

export type ViewMode = 'monitors' | 'tags';

export function complianceStatus(m: { slaTarget: number | null; compliant: boolean | null; uptimePct: number }): 'compliant' | 'atRisk' | 'breached' | 'noTarget' {
  if (m.slaTarget == null) return 'noTarget';
  if (m.compliant === false) return 'breached';
  if (m.compliant === true && m.uptimePct - m.slaTarget < 0.1) return 'atRisk';
  return 'compliant';
}

export function useSla() {
  const [data, setData] = useState<SlaDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [reportMonths, setReportMonths] = useState(3);
  const [reportLoading, setReportLoading] = useState(false);
  const [forecastMonitorId, setForecastMonitorId] = useState<string>('');
  const [forecast, setForecast] = useState<SlaBudgetForecast | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('monitors');
  const [tagData, setTagData] = useState<TagSlaEntry[] | null>(null);
  const [tagLoading, setTagLoading] = useState(false);
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());
  const [certLoadingId, setCertLoadingId] = useState<string | null>(null);
  const { success: showSuccess, error: showError } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      await getUser();
      const result = await api<SlaDashboard>('/v1/monitors/sla-dashboard');
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load SLA dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTagData = useCallback(async () => {
    try {
      setTagLoading(true);
      const result = await api<TagSlaEntry[]>('/v1/monitors/sla-by-tag');
      setTagData(result);
    } catch { setTagData([]); }
    finally { setTagLoading(false); }
  }, []);

  const loadForecast = useCallback(async (monitorId: string) => {
    if (!monitorId) { setForecast(null); return; }
    try {
      setForecastLoading(true);
      const result = await api<SlaBudgetForecast>(`/v1/monitors/${monitorId}/sla-forecast`);
      setForecast(result);
    } catch { setForecast(null); }
    finally { setForecastLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (viewMode === 'tags' && tagData === null) loadTagData();
  }, [viewMode, tagData, loadTagData]);

  const handleSetTarget = async (id: string, value: number) => {
    try {
      const u = await getUser();
      await api(`/v1/monitors/${id}`, u?.id, {
        method: 'PATCH',
        body: JSON.stringify({ slaTarget: value }),
      });
      showSuccess('SLA target updated');
      await load();
    } catch {
      showError('Failed to update SLA target');
    }
  };

  const handleDownloadReport = async () => {
    try {
      setReportLoading(true);
      const u = await getUser();
      const report = await api<ComplianceReport>(`/v1/monitors/sla-compliance-report?months=${reportMonths}`, u?.id);
      const { generateReportHtml } = await import('../components/reportHtml');
      const html = generateReportHtml(report);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (win) { win.focus(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
    } catch { showError('Failed to generate compliance report'); }
    finally { setReportLoading(false); }
  };

  const handleDownloadCertificate = async (monitorId: string, months: number) => {
    try {
      setCertLoadingId(monitorId);
      const { getApiBase } = await import('../../../../lib/api');
      const res = await fetch(`${getApiBase()}/v1/monitors/${monitorId}/uptime-certificate?months=${months}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to generate certificate');
      const html = await res.text();
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (win) { win.focus(); setTimeout(() => URL.revokeObjectURL(url), 15000); }
    } catch { showError('Failed to generate uptime certificate'); }
    finally { setCertLoadingId(null); }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const toggleTagExpanded = (tagId: string | null) => {
    setExpandedTags((prev) => {
      const next = new Set(prev);
      const key = tagId ?? 'untagged';
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const sortedMonitors = data
    ? [...data.monitors].sort((a, b) => {
        let cmp = 0;
        if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
        else if (sortKey === 'uptimePct') cmp = a.uptimePct - b.uptimePct;
        else if (sortKey === 'errorBudgetUsedPct')
          cmp = (a.errorBudgetUsedPct ?? -1) - (b.errorBudgetUsedPct ?? -1);
        else if (sortKey === 'compliant') {
          const order = { breached: 0, atRisk: 1, noTarget: 2, compliant: 3 };
          cmp = order[complianceStatus(a)] - order[complianceStatus(b)];
        }
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : [];

  const period = data
    ? new Date(data.period.start).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—';

  return {
    data, loading, error, sortKey, sortDir, reportMonths, setReportMonths,
    reportLoading, forecastMonitorId, setForecastMonitorId, forecast,
    forecastLoading, viewMode, setViewMode, tagData, tagLoading,
    expandedTags, certLoadingId,
    load, loadForecast, handleSetTarget, handleDownloadReport, handleDownloadCertificate,
    toggleSort, toggleTagExpanded, sortedMonitors, period,
  };
}
