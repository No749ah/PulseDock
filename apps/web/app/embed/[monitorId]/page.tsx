// Embeddable status widget page — served in iframes on external sites.
// Route: GET /embed/[monitorId]
// Query params:
//   ?style=compact (default) | card
//   ?theme=dark (default) | light
//   ?label=Custom+Name

export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { brand } from '../../../lib/brand';
import { formatLatency, formatUptime, statusColor, statusLabel, type EmbedStatus } from './helpers';

export const metadata: Metadata = {
  robots: 'noindex, nofollow',
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_BASE_URL ||
  'http://localhost:4321';

interface EmbedData {
  monitorId: string;
  name: string;
  status: EmbedStatus;
  uptimePct: number;
  responseMs: number | null;
  lastChecked: string | null;
}

type StyleParam = 'compact' | 'card';
type ThemeParam = 'dark' | 'light';

interface Props {
  params: Promise<{ monitorId: string }>;
  searchParams: Promise<{ style?: string; theme?: string; label?: string }>;
}

async function fetchEmbedData(monitorId: string): Promise<EmbedData | null> {
  try {
    const res = await fetch(`${API_BASE}/v1/public/embed/${monitorId}`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    return (await res.json()) as EmbedData;
  } catch {
    return null;
  }
}


export default async function EmbedPage({ params, searchParams }: Props) {
  const { monitorId } = await params;
  const { style: rawStyle, theme: rawTheme, label: rawLabel } = await searchParams;

  const style: StyleParam = rawStyle === 'card' ? 'card' : 'compact';
  const theme: ThemeParam = rawTheme === 'light' ? 'light' : 'dark';

  const data = await fetchEmbedData(monitorId);

  // Theme tokens
  const isDark = theme === 'dark';
  const bg = isDark ? '#0d1117' : '#ffffff';
  const border = isDark ? '#30363d' : '#d0d7de';
  const textPrimary = isDark ? '#e6edf3' : '#1f2328';
  const textSecondary = isDark ? '#8b949e' : '#656d76';
  const dotShadowColor = isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.12)';

  // Graceful degraded state
  if (!data) {
    const unavailableColor = '#9ca3af';
    if (style === 'compact') {
      return (
        <>
          <style>{`
            *, *::before, *::after { box-sizing: border-box; }
            html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
            body { background: ${bg}; display: flex; align-items: center; }
            .wrap { display: flex; align-items: center; gap: 8px; padding: 0 12px; width: 100%; }
            .dot { width: 8px; height: 8px; border-radius: 50%; background: ${unavailableColor}; flex-shrink: 0; }
            .name { font-size: 13px; font-weight: 600; color: ${textPrimary}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .status { font-size: 12px; color: ${textSecondary}; margin-left: auto; flex-shrink: 0; }
          `}</style>
          <div className="wrap">
            <div className="dot" />
            <span className="name">Status Unavailable</span>
            <span className="status">—</span>
          </div>
        </>
      );
    }
    return (
      <>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
          body { background: ${bg}; display: flex; align-items: center; justify-content: center; }
          .card { background: ${bg}; border: 1px solid ${border}; border-radius: 10px; padding: 14px 16px; width: calc(100% - 16px); max-width: 320px; }
          .row { display: flex; align-items: center; gap: 8px; }
          .dot { width: 10px; height: 10px; border-radius: 50%; background: ${unavailableColor}; flex-shrink: 0; }
          .name { font-size: 14px; font-weight: 600; color: ${textPrimary}; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .badge { font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 20px; background: ${unavailableColor}20; color: ${unavailableColor}; }
          .meta { display: flex; gap: 16px; margin-top: 10px; padding-top: 10px; border-top: 1px solid ${border}; }
          .meta-item { display: flex; flex-direction: column; gap: 2px; }
          .meta-label { font-size: 10px; color: ${textSecondary}; text-transform: uppercase; letter-spacing: 0.05em; }
          .meta-value { font-size: 13px; font-weight: 600; color: ${textPrimary}; }
        `}</style>
        <div className="card">
          <div className="row">
            <div className="dot" />
            <span className="name">Status Unavailable</span>
            <span className="badge">—</span>
          </div>
          <div className="meta">
            <div className="meta-item">
              <span className="meta-label">Uptime</span>
              <span className="meta-value">—</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Response</span>
              <span className="meta-value">—</span>
            </div>
          </div>
        </div>
      </>
    );
  }

  const displayName = rawLabel ? decodeURIComponent(rawLabel) : data.name;
  const color = statusColor(data.status);
  const label = statusLabel(data.status);

  if (style === 'compact') {
    return (
      <>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
          body { background: ${bg}; display: flex; align-items: center; }
          .wrap { display: flex; align-items: center; gap: 8px; padding: 0 12px; width: 100%; min-width: 0; }
          .dot-wrap { position: relative; flex-shrink: 0; width: 10px; height: 10px; }
          .dot { width: 10px; height: 10px; border-radius: 50%; background: ${color}; position: absolute; }
          .dot-ping { width: 10px; height: 10px; border-radius: 50%; background: ${color}; position: absolute; opacity: 0.6; animation: ping 2s cubic-bezier(0,0,0.2,1) infinite; }
          @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
          .name { font-size: 13px; font-weight: 600; color: ${textPrimary}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1; }
          .status { font-size: 12px; font-weight: 500; color: ${color}; white-space: nowrap; flex-shrink: 0; margin-left: 4px; }
          .sep { color: ${textSecondary}; margin: 0 4px; font-size: 11px; }
          .latency { font-size: 11px; color: ${textSecondary}; flex-shrink: 0; }
          a.branding { margin-left: 8px; flex-shrink: 0; font-size: 10px; color: ${textSecondary}; text-decoration: none; opacity: 0.6; }
          a.branding:hover { opacity: 1; }
        `}</style>
        {/* Auto-refresh every 60s */}
        <meta httpEquiv="refresh" content="60" />
        <div className="wrap">
          <div className="dot-wrap">
            {data.status === 'up' && <div className="dot-ping" style={{ background: color }} />}
            <div className="dot" style={{ background: color }} />
          </div>
          <span className="name">{displayName}</span>
          <span className="status">{label}</span>
          {data.responseMs !== null && (
            <>
              <span className="sep">·</span>
              <span className="latency">{formatLatency(data.responseMs)}</span>
            </>
          )}
        </div>
      </>
    );
  }

  // Card style
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
        body { background: ${bg}; display: flex; align-items: center; justify-content: center; }
        .card {
          background: ${bg};
          border: 1px solid ${border};
          border-radius: 10px;
          padding: 14px 16px;
          width: calc(100% - 16px);
          max-width: 320px;
          box-shadow: 0 1px 3px ${dotShadowColor};
        }
        .row { display: flex; align-items: center; gap: 9px; }
        .dot-wrap { position: relative; flex-shrink: 0; width: 10px; height: 10px; }
        .dot { width: 10px; height: 10px; border-radius: 50%; background: ${color}; position: absolute; }
        .dot-ping { width: 10px; height: 10px; border-radius: 50%; background: ${color}; position: absolute; opacity: 0.6; animation: ping 2s cubic-bezier(0,0,0.2,1) infinite; }
        @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
        .name { font-size: 14px; font-weight: 600; color: ${textPrimary}; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .badge { font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 20px; background: ${color}20; color: ${color}; flex-shrink: 0; }
        .meta { display: flex; gap: 16px; margin-top: 10px; padding-top: 10px; border-top: 1px solid ${border}; }
        .meta-item { display: flex; flex-direction: column; gap: 2px; }
        .meta-label { font-size: 10px; color: ${textSecondary}; text-transform: uppercase; letter-spacing: 0.05em; }
        .meta-value { font-size: 13px; font-weight: 600; color: ${textPrimary}; }
        .branding { margin-top: 10px; text-align: right; }
        .branding a { font-size: 10px; color: ${textSecondary}; text-decoration: none; opacity: 0.5; }
        .branding a:hover { opacity: 1; }
      `}</style>
      {/* Auto-refresh every 60s */}
      <meta httpEquiv="refresh" content="60" />
      <div className="card">
        <div className="row">
          <div className="dot-wrap">
            {data.status === 'up' && <div className="dot-ping" style={{ background: color }} />}
            <div className="dot" style={{ background: color }} />
          </div>
          <span className="name">{displayName}</span>
          <span className="badge">{label}</span>
        </div>
        <div className="meta">
          <div className="meta-item">
            <span className="meta-label">Uptime</span>
            <span className="meta-value">{formatUptime(data.uptimePct)}</span>
          </div>
          {data.responseMs !== null && (
            <div className="meta-item">
              <span className="meta-label">Response</span>
              <span className="meta-value">{formatLatency(data.responseMs)}</span>
            </div>
          )}
          {data.lastChecked && (
            <div className="meta-item">
              <span className="meta-label">Checked</span>
              <span className="meta-value" suppressHydrationWarning>
                {new Date(data.lastChecked).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          )}
        </div>
        <div className="branding">
          <a href={brand.githubUrl} target="_blank" rel="noopener noreferrer">
            Powered by {brand.name}
          </a>
        </div>
      </div>
    </>
  );
}
