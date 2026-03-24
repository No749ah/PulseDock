"use client";

import { WIDGET_PALETTE } from "./constants";

/** Live preview content for widgets in the editor */
export function WidgetPreview({ type, config, w, liveData }: { type: string; config: Record<string, unknown>; w: number; liveData?: unknown }) {
  // Extract live values when available
  const live = liveData as Record<string, unknown> | undefined;
  const label = (config.label as string) || "";
  switch (type) {
    case "overall-status":
      return (<div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-success animate-pulse" /><span className="text-sm font-semibold text-success">{label || "All Systems Operational"}</span></div>);
    case "current-status-badge":
      return (<div className="flex items-center gap-2"><div className="h-2.5 w-2.5 rounded-full bg-success" /><span className="text-xs font-medium text-text-primary">{label || "Monitor"}</span><span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/15 text-success font-medium">Up</span></div>);
    case "uptime-bar": {
      const uptimePct = typeof live?.uptimePct === "number" ? Math.round(live.uptimePct * 100) / 100 : null;
      const barColor = uptimePct !== null ? (uptimePct >= 99.5 ? "bg-success/70" : uptimePct >= 90 ? "bg-warning/70" : "bg-danger/70") : "bg-success/70";
      const pctColor = uptimePct !== null ? (uptimePct >= 99.5 ? "text-success" : uptimePct >= 90 ? "text-warning" : "text-danger") : "text-success";
      const pctStr = uptimePct !== null ? `${uptimePct}%` : "99.9%";
      const barWidth = uptimePct !== null ? `${uptimePct}%` : "99.9%";
      return (<div className="space-y-1"><div className="flex justify-between text-[10px] text-text-secondary"><span>{label || "Uptime"}</span><span className={`font-medium ${pctColor}`}>{pctStr}{live && <span className="ml-1 text-green-400/60">●</span>}</span></div><div className="h-2 rounded-full bg-surface-elevated overflow-hidden"><div className={`h-full rounded-full ${barColor}`} style={{ width: barWidth }} /></div></div>);
    }
    case "uptime-timeline":
      return (<div className="space-y-1">{label && <span className="text-[10px] text-text-secondary">{label}</span>}<div className="flex gap-px">{Array.from({ length: Math.min(w * 3, 30) }).map((_, i) => (<div key={i} className={`flex-1 h-4 rounded-sm ${i === 18 ? "bg-warning/60" : i === 22 ? "bg-danger/60" : "bg-success/50"}`} />))}</div></div>);
    case "response-time-chart":
      return (<div className="space-y-1"><div className="flex justify-between text-[10px] text-text-secondary"><span>{label || "Response Time"}</span><span className="font-mono">~120ms</span></div><svg viewBox="0 0 100 20" className="w-full h-6 text-accent/60" preserveAspectRatio="none"><polyline fill="none" stroke="currentColor" strokeWidth="1.5" points="0,15 10,12 20,14 30,10 40,8 50,11 60,7 70,9 80,6 90,8 100,5" /></svg></div>);
    case "multi-monitor-grid":
      return (<div className="flex flex-wrap gap-1">{["API", "Web", "DB", "Redis", "CDN", "Auth"].map((n) => (<div key={n} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-elevated text-[10px]"><div className="h-1.5 w-1.5 rounded-full bg-success" /><span className="text-text-secondary">{n}</span></div>))}</div>);
    case "incident-history":
      return (<div className="space-y-1 text-[10px]"><span className="text-text-secondary">{label || "Recent Incidents"}</span><div className="flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-success" /><span className="text-text-secondary">No incidents in the last 7 days</span></div></div>);
    case "active-incident-banner":
      return (<div className="flex items-center gap-2 px-2 py-1 rounded bg-success/10 border border-success/20"><div className="h-2 w-2 rounded-full bg-success" /><span className="text-[10px] font-medium text-success">{label || "All clear — no active incidents"}</span></div>);
    case "text-block":
      return <p className="text-xs text-text-secondary">{label || "Announcement text goes here..."}</p>;
    case "metric-counter": {
      const mcVal = typeof live?.value === "number" ? live.value : typeof live?.uptimePct === "number" ? live.uptimePct : null;
      const mcDisplay = mcVal !== null ? `${Math.round(mcVal * 100) / 100}%` : "—";
      return (<div className="text-center"><div className="text-lg font-bold text-accent tabular-nums">{mcVal !== null ? mcDisplay : "99.9%"}{live && <span className="ml-1 text-[8px] text-green-400/60 align-top">●</span>}</div><div className="text-[10px] text-text-secondary">{label || "Uptime (30d)"}</div></div>);
    }
    case "last-updated-footer":
      return <div className="text-[10px] text-text-muted text-center">Last updated: just now</div>;
    case "custom-header":
      return (<div><div className="text-sm font-bold text-text-primary">{label || "Status Page"}</div><div className="text-[10px] text-text-secondary">Subtitle or description</div></div>);
    case "monitor-group":
      return (<div className="space-y-1.5"><div className="text-[10px] font-semibold text-text-secondary uppercase">{label || "Infrastructure"}</div>{["API Server","Database","Cache","Queue"].map(n=>(<div key={n} className="flex items-center gap-1.5 text-[10px]"><div className="h-1.5 w-1.5 rounded-full bg-success"/><span className="text-text-primary">{n}</span><span className="ml-auto text-text-muted font-mono">12ms</span></div>))}</div>);
    case "multi-status-badges":
      return (<div className="grid grid-cols-3 gap-1.5">{["API","Web","DB","Redis","Auth","CDN"].map(n=>(<div key={n} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-elevated border border-border/50"><div className="h-2 w-2 rounded-full bg-success"/><span className="text-[10px] font-medium text-text-primary">{n}</span></div>))}</div>);
    case "version-status-grid":
      return (<div className="space-y-1"><div className="flex justify-between text-[10px] text-text-secondary"><span>Version Status</span><span>2 up-to-date · 1 update</span></div>{[{n:"Portainer",c:"2.39.0",l:"2.39.0",ok:true},{n:"GitLab",c:"18.7.0",l:"18.9.0",ok:false},{n:"Redis",c:"7.2.4",l:"7.2.4",ok:true}].map(v=>(<div key={v.n} className="flex items-center gap-2 text-[10px] py-0.5"><div className={`h-1.5 w-1.5 rounded-full ${v.ok?"bg-success":"bg-warning"}`}/><span className="text-text-primary w-16 truncate">{v.n}</span><span className="text-text-secondary font-mono">{v.c}</span><span className="text-text-muted">→</span><span className={`font-mono ${v.ok?"text-text-secondary":"text-warning font-medium"}`}>{v.l}</span></div>))}</div>);
    case "version-check-badge":
      return (<div className="flex items-center gap-2"><div className="h-2.5 w-2.5 rounded-full bg-success" /><span className="text-xs font-medium">{label || "App"}</span><span className="text-[10px] font-mono text-text-secondary">v2.39.0</span><span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/15 text-success">Up to date</span></div>);
    case "update-summary":
      return (<div className="flex items-center gap-4"><div className="flex items-center gap-1.5"><span className="text-lg font-bold text-success">2</span><span className="text-[10px] text-text-secondary">up to date</span></div><div className="flex items-center gap-1.5"><span className="text-lg font-bold text-warning">1</span><span className="text-[10px] text-text-secondary">minor update</span></div><div className="flex items-center gap-1.5"><span className="text-lg font-bold text-danger">0</span><span className="text-[10px] text-text-secondary">major update</span></div></div>);
    case "divider":
      return <hr className="border-border my-1" />;

    // ── Performance ────────────────────────────────────────────────────────
    case "response-time-heatmap":
      return (<div className="space-y-1"><div className="text-[10px] text-text-secondary mb-1">{label || "Response Time Heatmap"}</div><div className="grid gap-px" style={{gridTemplateColumns:"repeat(24,1fr)"}}>{Array.from({length:168},(_,i)=>(<div key={i} className={`rounded-sm ${i%7===3?"bg-danger/60":i%5===2?"bg-warning/50":i%11===0?"bg-success/30":"bg-success/15"}`} style={{height:6}} />))}</div><div className="flex justify-between text-[9px] text-text-muted mt-0.5"><span>00:00</span><span>12:00</span><span>23:00</span></div></div>);
    case "latency-percentiles-card":
      return (<div className="flex items-end gap-3"><div className="text-center"><div className="text-base font-bold text-text-primary tabular-nums">42<span className="text-[9px] text-text-muted ml-0.5">ms</span></div><div className="text-[9px] text-text-muted">P50</div></div><div className="text-center"><div className="text-base font-bold text-warning tabular-nums">110<span className="text-[9px] text-text-muted ml-0.5">ms</span></div><div className="text-[9px] text-text-muted">P95</div></div><div className="text-center"><div className="text-base font-bold text-danger tabular-nums">210<span className="text-[9px] text-text-muted ml-0.5">ms</span></div><div className="text-[9px] text-text-muted">P99</div></div></div>);
    case "response-time-comparison":
      return (<div className="space-y-1"><div className="text-[10px] text-text-secondary mb-1">{label||"Response Time Comparison"}</div><svg viewBox="0 0 100 24" className="w-full" preserveAspectRatio="none"><polyline fill="none" stroke="#6366f1" strokeWidth="1.5" points="0,18 15,14 30,10 45,12 60,8 75,10 90,6 100,7"/><polyline fill="none" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="2,2" points="0,20 15,17 30,15 45,13 60,14 75,11 90,12 100,10"/></svg></div>);
    case "ssl-certificate-status":
      return (<div className="flex items-center gap-2"><div className="h-2.5 w-2.5 rounded-full bg-success shrink-0"/><span className="text-xs font-medium text-text-primary">{label||"SSL Certificate"}</span><span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-success/15 text-success font-medium">85d left</span></div>);
    case "dns-resolution-time":
      return (<div className="flex items-center gap-2"><span className="text-xs text-text-secondary">{label||"DNS"}</span><div className="flex-1 h-1.5 rounded-full bg-surface-elevated overflow-hidden"><div className="h-full rounded-full bg-accent/60" style={{width:"30%"}}/></div><span className="text-[10px] font-mono text-text-secondary">12ms</span></div>);
    case "performance-trend":
      return (<div className="space-y-1"><div className="flex items-center gap-2"><span className="text-[10px] text-text-secondary">{label||"Performance Trend"}</span><span className="text-[10px] text-success">↓ 8% faster</span></div><svg viewBox="0 0 100 20" className="w-full h-5" preserveAspectRatio="none"><polyline fill="none" stroke="#22c55e" strokeWidth="1.5" points="0,16 20,14 40,12 60,10 80,8 100,6"/></svg></div>);
    case "apdex-score":
      return (<div className="flex items-center gap-3"><div className="text-2xl font-bold text-success tabular-nums">0.96</div><div><div className="text-[10px] text-text-secondary">Apdex Score</div><div className="text-[10px] text-success">Excellent</div></div></div>);
    case "throughput-counter":
      return (<div className="flex items-center gap-2"><div className="text-lg font-bold text-accent tabular-nums">243</div><div className="text-[10px] text-text-secondary">{label||"checks/hr"}</div></div>);

    // ── SLA ───────────────────────────────────────────────────────────────
    case "sla-compliance-table":
      return (<div className="space-y-1">{[{n:"API",t:"99.9%",a:"99.97%",ok:true},{n:"Web",t:"99.5%",a:"99.84%",ok:true},{n:"DB",t:"99.9%",a:"99.61%",ok:false}].map(r=>(<div key={r.n} className="flex items-center gap-2 text-[10px]"><span className="w-8 text-text-primary font-medium">{r.n}</span><span className="text-text-muted w-10">{r.t}</span><span className={`font-mono ${r.ok?"text-success":"text-danger"}`}>{r.a}</span><span className={`ml-auto px-1 py-0.5 rounded text-[9px] font-semibold ${r.ok?"bg-success/15 text-success":"bg-danger/15 text-danger"}`}>{r.ok?"Pass":"Fail"}</span></div>))}</div>);
    case "uptime-heatmap":
      return (<div className="space-y-1"><div className="text-[10px] text-text-secondary mb-1">{label||"Uptime Heatmap"}</div><div className="grid gap-px" style={{gridTemplateColumns:"repeat(24,1fr)"}}>{Array.from({length:168},(_,i)=>(<div key={i} className={`rounded-sm ${i===42||i===43?"bg-danger/70":i===100?"bg-warning/60":"bg-success/40"}`} style={{height:6}}/>))}</div></div>);
    case "downtime-log":
      return (<div className="space-y-1 text-[10px]"><span className="text-text-secondary">{label||"Downtime Log"}</span>{[{t:"Mar 12",d:"14m",r:"Timeout"},{t:"Mar 7",d:"3m",r:"Deploy"}].map(e=>(<div key={e.t} className="flex items-center gap-2 py-0.5"><span className="text-text-muted w-12">{e.t}</span><span className="text-danger font-mono">{e.d}</span><span className="text-text-secondary">{e.r}</span></div>))}</div>);
    case "mttr-mttf-cards":
      return (<div className="flex gap-4"><div className="text-center"><div className="text-base font-bold text-warning tabular-nums">18m</div><div className="text-[9px] text-text-muted">MTTR</div></div><div className="text-center"><div className="text-base font-bold text-success tabular-nums">12.4d</div><div className="text-[9px] text-text-muted">MTTF</div></div></div>);
    case "uptime-comparison-chart":
      return (<div className="space-y-1"><div className="text-[10px] text-text-secondary mb-1">{label||"Uptime Comparison"}</div><div className="flex items-end gap-1 h-10">{[99.9,99.7,100,98.5,99.8].map((v,i)=>(<div key={i} className="flex-1 rounded-sm bg-accent/50" style={{height:`${((v-98)/2)*100}%`,minHeight:2}}/>))}</div></div>);

    // ── Incidents ─────────────────────────────────────────────────────────
    case "incident-timeline":
      return (<div className="space-y-2 text-[10px]"><span className="text-text-secondary font-medium">{label||"Incident Timeline"}</span>{[{s:"Resolved",c:"text-success",m:"Service restored"},{s:"Monitoring",c:"text-warning",m:"Fix deployed"},{s:"Identified",c:"text-danger",m:"Root cause found"}].map(e=>(<div key={e.s} className="flex items-start gap-2"><div className={`mt-0.5 h-1.5 w-1.5 rounded-full shrink-0 ${e.c.replace("text-","bg-")}`}/><div><span className={`font-semibold ${e.c}`}>{e.s}</span><span className="text-text-muted ml-1">{e.m}</span></div></div>))}</div>);
    case "incident-severity-distribution":
      return (<div className="flex items-center gap-2"><div className="flex-1 h-3 rounded-full overflow-hidden flex"><div className="bg-danger/70" style={{width:"15%"}}/><div className="bg-warning/70" style={{width:"35%"}}/><div className="bg-success/50" style={{width:"50%"}}/></div><div className="flex gap-2 text-[9px]"><span className="text-danger">Crit</span><span className="text-warning">Maj</span><span className="text-success">Min</span></div></div>);
    case "incident-duration-stats":
      return (<div className="flex gap-4 text-center"><div><div className="text-sm font-bold text-text-primary">3m</div><div className="text-[9px] text-text-muted">Shortest</div></div><div><div className="text-sm font-bold text-warning">18m</div><div className="text-[9px] text-text-muted">Average</div></div><div><div className="text-sm font-bold text-danger">2.1h</div><div className="text-[9px] text-text-muted">Longest</div></div></div>);
    case "active-incident-count":
      return (<div className="flex items-center gap-2"><div className="text-3xl font-bold text-danger tabular-nums animate-pulse">2</div><div className="text-[10px] text-text-secondary leading-tight">{label||"Active\nIncidents"}</div></div>);
    case "post-mortem-card":
      return (<div className="space-y-1 text-[10px]"><span className="font-semibold text-text-primary">{label||"Post-Mortem"}</span><p className="text-text-secondary leading-relaxed">Database failover triggered by OOM. Fix: increased replica memory limits. Duration: 14m.</p></div>);
    case "maintenance-calendar":
      return (<div className="space-y-1 text-[10px]"><span className="text-text-secondary">{label||"Maintenance Calendar"}</span><div className="flex gap-1 flex-wrap">{Array.from({length:7},(_,i)=>(<div key={i} className={`w-6 h-6 rounded flex items-center justify-center text-[9px] font-medium ${i===2?"bg-warning/20 text-warning border border-warning/30":"bg-surface-elevated text-text-muted"}`}>{19+i}</div>))}</div></div>);
    case "next-maintenance-countdown":
      return (<div className="flex items-center gap-3"><div className="text-lg font-bold font-mono text-accent tabular-nums">02:14:30</div><div className="text-[10px] text-text-secondary">{label||"Until maintenance"}</div></div>);
    case "maintenance-impact-list":
      return (<div className="space-y-1 text-[10px]"><span className="text-text-secondary">{label||"Affected Services"}</span>{["API v2","Webhooks","File uploads"].map(s=>(<div key={s} className="flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-warning"/><span className="text-text-primary">{s}</span></div>))}</div>);

    // ── Version ───────────────────────────────────────────────────────────
    case "version-timeline":
      return (<div className="space-y-1 text-[10px]"><span className="text-text-secondary">{label||"Version Timeline"}</span>{[{v:"v2.39.0",d:"Mar 18",t:"success"},{v:"v2.38.1",d:"Mar 10",t:"warning"},{v:"v2.38.0",d:"Mar 2",t:"text-muted"}].map(e=>(<div key={e.v} className="flex items-center gap-2"><div className={`h-1.5 w-1.5 rounded-full bg-${e.t}`}/><span className="font-mono text-text-primary">{e.v}</span><span className="text-text-muted ml-auto">{e.d}</span></div>))}</div>);
    case "outdated-components-alert":
      return (<div className="space-y-1">{[{n:"GitLab",c:"18.7",l:"18.9"},{n:"SonarQube",c:"25.x",l:"26.x"}].map(c=>(<div key={c.n} className="flex items-center gap-2 text-[10px] px-2 py-1 rounded bg-warning/10 border border-warning/20"><div className="h-1.5 w-1.5 rounded-full bg-warning shrink-0"/><span className="text-text-primary">{c.n}</span><span className="ml-auto text-warning font-mono">{c.c} → {c.l}</span></div>))}</div>);
    case "version-comparison-table":
      return (<div className="space-y-1">{[{n:"Portainer",c:"2.39.0",l:"2.39.0",ok:true},{n:"GitLab",c:"18.7.0",l:"18.9.0",ok:false}].map(r=>(<div key={r.n} className="flex items-center gap-2 text-[10px]"><span className="text-text-primary w-14 truncate">{r.n}</span><span className="font-mono text-text-secondary">{r.c}</span><span className="text-text-muted mx-1">→</span><span className={`font-mono ${r.ok?"text-success":"text-warning"}`}>{r.l}</span></div>))}</div>);
    case "changelog-widget":
      return (<div className="space-y-1.5 text-[10px]"><span className="text-text-secondary font-medium">{label||"Changelog"}</span>{[{v:"v2.39.0",n:"Security fixes + perf improvements"},{v:"v2.38.1",n:"Bug fixes"}].map(e=>(<div key={e.v} className="flex gap-2"><span className="font-mono text-accent shrink-0">{e.v}</span><span className="text-text-secondary">{e.n}</span></div>))}</div>);
    case "security-advisory":
      return (<div className="space-y-1 text-[10px]"><span className="text-text-secondary font-medium">{label||"Security Advisories"}</span><div className="flex items-center gap-2 px-2 py-1 rounded bg-danger/10 border border-danger/20"><span className="text-[9px] font-bold text-danger uppercase">HIGH</span><span className="text-text-primary">CVE-2024-12345 — SQL injection</span></div></div>);

    // ── Metrics & Data ────────────────────────────────────────────────────
    case "custom-metric-chart":
      return (<div className="space-y-1"><div className="text-[10px] text-text-secondary">{label||"Custom Metric"}</div><svg viewBox="0 0 100 24" className="w-full h-6" preserveAspectRatio="none"><polyline fill="none" stroke="#6366f1" strokeWidth="1.5" points="0,20 12,16 24,14 36,17 48,11 60,9 72,12 84,8 100,6"/></svg></div>);
    case "gauge":
      return (<div className="flex flex-col items-center"><svg viewBox="0 0 60 34" className="w-16"><path d="M5 30 A 25 25 0 0 1 55 30" fill="none" stroke="#1f2937" strokeWidth="6" strokeLinecap="round"/><path d="M5 30 A 25 25 0 0 1 55 30" fill="none" stroke="#6366f1" strokeWidth="6" strokeLinecap="round" strokeDasharray="78.5" strokeDashoffset="20"/><text x="30" y="31" textAnchor="middle" className="text-[8px]" fill="currentColor" fontSize="8">97%</text></svg><div className="text-[9px] text-text-muted">{label||"Health"}</div></div>);
    case "sparkline-row":
      return (<div className="space-y-1">{["API","Web","DB"].map(n=>(<div key={n} className="flex items-center gap-2"><span className="text-[10px] text-text-secondary w-6">{n}</span><svg viewBox="0 0 60 12" className="flex-1 h-3" preserveAspectRatio="none"><polyline fill="none" stroke="#6366f1" strokeWidth="1" points="0,10 10,8 20,9 30,6 40,7 50,4 60,5"/></svg></div>))}</div>);
    case "stats-grid":
      return (<div className="grid grid-cols-3 gap-2">{[{l:"Uptime",v:"99.9%",c:"text-success"},{l:"Latency",v:"42ms",c:"text-text-primary"},{l:"Checks",v:"1.2k",c:"text-accent"}].map(s=>(<div key={s.l} className="text-center"><div className={`text-sm font-bold ${s.c} tabular-nums`}>{s.v}</div><div className="text-[9px] text-text-muted">{s.l}</div></div>))}</div>);
    case "progress-ring":
      return (<div className="flex items-center gap-3"><svg viewBox="0 0 36 36" className="w-12 h-12"><circle cx="18" cy="18" r="15" fill="none" stroke="#1f2937" strokeWidth="3"/><circle cx="18" cy="18" r="15" fill="none" stroke="#6366f1" strokeWidth="3" strokeDasharray="94.2" strokeDashoffset="6" strokeLinecap="round" transform="rotate(-90 18 18)"/></svg><div><div className="text-sm font-bold text-text-primary tabular-nums">99%</div><div className="text-[10px] text-text-muted">{label||"SLA"}</div></div></div>);
    case "data-table":
      return (<div className="space-y-1"><div className="flex text-[9px] text-text-muted border-b border-border pb-1 gap-2"><span className="flex-1">Name</span><span>Status</span><span>Latency</span></div>{[{n:"API",s:"Up",l:"12ms"},{n:"Web",s:"Up",l:"45ms"}].map(r=>(<div key={r.n} className="flex text-[10px] gap-2 py-0.5"><span className="flex-1 text-text-primary">{r.n}</span><span className="text-success">{r.s}</span><span className="text-text-secondary font-mono">{r.l}</span></div>))}</div>);
    case "check-history-feed":
      return (<div className="space-y-1 text-[10px]"><span className="text-text-secondary">{label||"Check History"}</span>{[{t:"12:00",ok:true,ms:"42ms"},{t:"11:45",ok:true,ms:"38ms"},{t:"11:30",ok:false,ms:"—"}].map((r,i)=>(<div key={i} className="flex items-center gap-1.5"><div className={`h-1.5 w-1.5 rounded-full ${r.ok?"bg-success":"bg-danger"}`}/><span className="text-text-muted">{r.t}</span><span className={`ml-auto font-mono ${r.ok?"text-text-secondary":"text-danger"}`}>{r.ms}</span></div>))}</div>);
    case "metric-comparison-row":
      return (<div className="flex items-stretch gap-2">{[{l:"Uptime",v:"99.9%",c:"text-success"},{l:"P95",v:"110ms",c:"text-warning"},{l:"MTTR",v:"18m",c:"text-text-primary"}].map(m=>(<div key={m.l} className="flex-1 text-center"><div className={`text-sm font-bold tabular-nums ${m.c}`}>{m.v}</div><div className="text-[9px] text-text-muted">{m.l}</div></div>))}</div>);

    // ── Multi-Env / Region / Deps ─────────────────────────────────────────
    case "multi-environment-status":
      return (<div className="grid grid-cols-3 gap-2">{[{e:"Prod",ok:true},{e:"Staging",ok:true},{e:"Dev",ok:false}].map(env=>(<div key={env.e} className={`rounded-lg border px-2 py-1.5 text-center ${env.ok?"border-success/20 bg-success/5":"border-warning/30 bg-warning/5"}`}><div className={`text-[10px] font-semibold ${env.ok?"text-success":"text-warning"}`}>{env.e}</div><div className={`text-[9px] ${env.ok?"text-success":"text-warning"}`}>{env.ok?"Operational":"Degraded"}</div></div>))}</div>);
    case "region-status-map":
      return (<div className="grid grid-cols-2 gap-1.5">{[{r:"EU West",ok:true},{r:"US East",ok:true},{r:"AP South",ok:false},{r:"US West",ok:true}].map(reg=>(<div key={reg.r} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-elevated border border-border/50 text-[10px]"><div className={`h-2 w-2 rounded-full ${reg.ok?"bg-success":"bg-danger"}`}/><span className="text-text-primary">{reg.r}</span></div>))}</div>);
    case "third-party-dependencies":
      return (<div className="space-y-1">{[{n:"Stripe",ok:true,ms:"120ms"},{n:"SendGrid",ok:true,ms:"95ms"},{n:"AWS S3",ok:false,ms:"—"}].map(d=>(<div key={d.n} className="flex items-center gap-2 text-[10px]"><div className={`h-1.5 w-1.5 rounded-full ${d.ok?"bg-success":"bg-danger"}`}/><span className="text-text-primary">{d.n}</span><span className={`ml-auto font-mono ${d.ok?"text-text-secondary":"text-danger"}`}>{d.ms}</span></div>))}</div>);
    case "dependency-map":
      return (<div className="relative h-full min-h-[60px]"><svg viewBox="0 0 100 50" className="w-full h-full" preserveAspectRatio="xMidYMid meet"><circle cx="20" cy="25" r="8" fill="#22c55e" fillOpacity="0.2" stroke="#22c55e" strokeWidth="1.5"/><text x="20" y="26" textAnchor="middle" fill="currentColor" fontSize="4">API</text><circle cx="80" cy="15" r="7" fill="#22c55e" fillOpacity="0.2" stroke="#22c55e" strokeWidth="1.5"/><text x="80" y="16" textAnchor="middle" fill="currentColor" fontSize="4">DB</text><circle cx="80" cy="38" r="7" fill="#ef4444" fillOpacity="0.2" stroke="#ef4444" strokeWidth="1.5"/><text x="80" y="39" textAnchor="middle" fill="currentColor" fontSize="4">Redis</text><line x1="28" y1="21" x2="73" y2="17" stroke="#22c55e" strokeWidth="1" strokeOpacity="0.7"/><line x1="28" y1="28" x2="73" y2="36" stroke="#ef4444" strokeWidth="1" strokeOpacity="0.7" strokeDasharray="2,1"/></svg></div>);

    // ── Content & Branding ────────────────────────────────────────────────
    case "announcement-bar":
      return (<div className="flex items-center gap-2 px-2 py-1 rounded bg-accent/10 border border-accent/20"><div className="h-1.5 w-1.5 rounded-full bg-accent shrink-0"/><span className="text-[10px] font-medium text-text-primary">{label||"Important announcement text"}</span></div>);
    case "image-banner":
      return (<div className="rounded-lg bg-surface-elevated border border-border flex items-center justify-center h-10"><span className="text-[10px] text-text-muted">🖼 {label||"Image / Banner"}</span></div>);
    case "link-list":
      return (<div className="space-y-1">{["Documentation","API Status","Changelog"].map(l=>(<div key={l} className="flex items-center gap-1.5 text-[10px]"><div className="h-1 w-1 rounded-full bg-accent/60"/><span className="text-accent hover:underline">{l}</span></div>))}</div>);
    case "social-links":
      return (<div className="flex items-center gap-3">{["GitHub","Twitter","Discord"].map(s=>(<div key={s} className="text-[10px] text-text-secondary flex items-center gap-1 px-2 py-1 rounded bg-surface-elevated border border-border/50">{s}</div>))}</div>);
    case "embed-iframe":
      return (<div className="rounded-lg bg-surface-elevated border border-border flex items-center justify-center h-12 border-dashed"><span className="text-[10px] text-text-muted">↗ {label||"Embedded content"}</span></div>);
    case "video-embed":
      return (<div className="rounded-lg bg-surface-elevated border border-border flex items-center justify-center h-10 border-dashed"><span className="text-[10px] text-text-muted">▶ {label||"Video"}</span></div>);
    case "code-block":
      return (<div className="rounded bg-bg border border-border px-2 py-1.5"><code className="text-[10px] font-mono text-accent">{"curl https://api.example.com/health"}</code></div>);
    case "subscriber-form":
      return (<div className="flex gap-1.5"><div className="flex-1 rounded-lg border border-border bg-bg px-2 py-1 text-[10px] text-text-muted">Email address</div><div className="rounded-lg bg-accent px-2 py-1 text-[10px] text-white font-medium">Subscribe</div></div>);
    case "rss-feed-widget":
      return (<div className="space-y-1 text-[10px]"><span className="text-text-secondary">RSS Feed</span><div className="flex items-center gap-1.5 text-accent"><span>⚡</span><span className="hover:underline">Subscribe to updates</span></div></div>);
    case "faq-accordion":
      return (<div className="space-y-1">{["What is your uptime SLA?","How do I report an issue?"].map(q=>(<div key={q} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-surface-elevated border border-border/50 text-[10px]"><span className="text-text-primary">{q}</span><span className="text-text-muted">▾</span></div>))}</div>);
    case "countdown":
      return (<div className="flex items-center gap-2"><div className="font-mono text-base font-bold text-accent tabular-nums">03:12:45</div><div className="text-[10px] text-text-secondary">{label||"Event countdown"}</div></div>);

    // ── Layout & Navigation ───────────────────────────────────────────────
    case "tab-container":
      return (<div className="space-y-1"><div className="flex gap-1 border-b border-border pb-1">{["Overview","Details","Logs"].map((t,i)=>(<div key={t} className={`px-2 py-0.5 text-[10px] rounded-t font-medium ${i===0?"text-accent border-b-2 border-accent -mb-[5px]":"text-text-muted"}`}>{t}</div>))}</div><p className="text-[10px] text-text-secondary pt-1">Tab content appears here</p></div>);
    case "collapsible-section":
      return (<div className="space-y-1"><div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-surface-elevated border border-border text-[10px] cursor-pointer"><span className="font-medium text-text-primary">{label||"Section Title"}</span><span className="text-text-muted">▾</span></div></div>);
    case "column-layout":
      return (<div className="grid grid-cols-2 gap-2 h-full">{[0,1].map(i=>(<div key={i} className="rounded-lg border border-dashed border-border flex items-center justify-center"><span className="text-[10px] text-text-muted">Column {i+1}</span></div>))}</div>);
    case "sticky-header":
      return (<div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-success/10 border border-success/20"><div className="h-2 w-2 rounded-full bg-success animate-pulse"/><span className="text-[10px] font-semibold text-success">{label||"All Systems Operational"}</span></div>);
    case "table-of-contents":
      return (<div className="space-y-1 text-[10px]"><span className="text-text-secondary font-medium">{label||"Contents"}</span>{["Status Overview","Incidents","Maintenance"].map((s,i)=>(<div key={s} className="flex items-center gap-1.5"><span className="text-text-muted">{i+1}.</span><span className="text-accent hover:underline">{s}</span></div>))}</div>);
    case "page-navigation":
      return (<div className="grid grid-cols-2 gap-1.5">{["Main Status","API Status"].map(p=>(<div key={p} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-elevated border border-border/50 text-[10px]"><div className="h-1.5 w-1.5 rounded-full bg-success"/><span className="text-text-primary">{p}</span></div>))}</div>);
    case "offline-banner":
      return (<div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-warning/10 border border-warning/20"><div className="h-2 w-2 rounded-full bg-warning shrink-0 animate-pulse"/><span className="text-[10px] font-medium text-warning">You are offline — showing cached data</span></div>);

    default:
      return (
        <div className="flex items-center justify-center h-full min-h-[32px]">
          <span className="text-[10px] text-text-secondary/50 italic">{WIDGET_PALETTE.find(p => p.type === type)?.label ?? type}</span>
        </div>
      );
  }
}
