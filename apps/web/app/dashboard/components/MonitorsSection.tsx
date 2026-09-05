"use client";

import { Activity, GitBranch, LayoutGrid, List, Plus, RefreshCw, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/Table";
import { MiniSparkline } from "../../../components/charts/mini-sparkline";
import { formatMonitorType, relativeTime } from "../../components/timeUtils";
import type { Monitor, MonitorRun } from "../hooks/useDashboard";
import { VERSION_TYPES } from "../hooks/useDashboard";

interface Props {
  monitors: Monitor[];
  runs: MonitorRun[];
  monitorView: "table" | "grid";
  setMonitorView: (v: "table" | "grid") => void;
  seedingDemo: boolean;
  onSeedDemo: () => void;
}

function versionStatusBadge(level?: "green" | "yellow" | "red") {
  if (level === "green") return <Badge variant="success">Up to date</Badge>;
  if (level === "yellow") return <Badge variant="warning">Update available</Badge>;
  if (level === "red") return <Badge variant="danger">Major update</Badge>;
  return <Badge variant="default">Pending</Badge>;
}

export function MonitorsSection({ monitors, runs, monitorView, setMonitorView, seedingDemo, onSeedDemo }: Props) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Monitors</h2>
          <p className="text-text-secondary text-sm mt-1">
            {monitors.length} {monitors.length === 1 ? "monitor" : "monitors"} configured
          </p>
        </div>
        <div className="flex items-center gap-2">
          {monitors.length > 0 && (
            <div role="toolbar" aria-label="Monitor view" className="flex items-center rounded-lg border border-border bg-surface overflow-hidden">
              <button
                type="button"
                onClick={() => setMonitorView("table")}
                aria-pressed={monitorView === "table"}
                className={`p-1.5 transition-colors ${monitorView === "table" ? "bg-accent/10 text-accent" : "text-text-secondary hover:text-text-primary"}`}
                title="Table view"
                aria-label="Table view"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setMonitorView("grid")}
                aria-pressed={monitorView === "grid"}
                className={`p-1.5 transition-colors ${monitorView === "grid" ? "bg-accent/10 text-accent" : "text-text-secondary hover:text-text-primary"}`}
                title="Grid view"
                aria-label="Grid view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          )}
          <Button onClick={() => router.push("/monitors")} size="lg" className="flex items-center gap-2" data-tour="add-monitor">
            <Plus className="w-4 h-4" /> Add Monitor
          </Button>
        </div>
      </div>

      {monitors.length === 0 ? (
        <EmptyState seedingDemo={seedingDemo} onSeedDemo={onSeedDemo} onAddMonitor={() => router.push("/monitors")} />
      ) : monitorView === "grid" ? (
        <GridView monitors={monitors} runs={runs} onNavigate={(id, isVersion) => router.push(isVersion ? "/versions" : `/monitors/${id}`)} />
      ) : (
        <TableView monitors={monitors} runs={runs} onNavigate={(id, isVersion) => router.push(isVersion ? "/versions" : `/monitors?id=${id}`)} />
      )}
    </div>
  );
}

function EmptyState({ seedingDemo, onSeedDemo, onAddMonitor }: { seedingDemo: boolean; onSeedDemo: () => void; onAddMonitor: () => void }) {
  return (
    <Card className="text-center py-16">
      <div className="p-4 rounded-2xl bg-surface-elevated inline-block mb-4">
        <Activity className="w-12 h-12 text-text-secondary opacity-50" />
      </div>
      <p className="text-text-primary text-lg font-medium mb-2">No monitors configured yet</p>
      <p className="text-text-secondary text-sm mb-6">Start monitoring your services, APIs, and endpoints</p>
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <Button onClick={onAddMonitor} size="lg">
          <Plus className="w-4 h-4 mr-2" />
          Create monitor
        </Button>
        <Button variant="secondary" size="lg" onClick={onSeedDemo} disabled={seedingDemo}>
          {seedingDemo ? (
            <span className="flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" />Loading…</span>
          ) : (
            <span className="flex items-center gap-2"><Zap className="w-4 h-4" />Load sample monitors</span>
          )}
        </Button>
      </div>
      <p className="text-xs text-text-muted mt-4">Sample monitors check GitHub, Cloudflare, and your local API</p>
    </Card>
  );
}

function GridView({ monitors, runs, onNavigate }: { monitors: Monitor[]; runs: MonitorRun[]; onNavigate: (id: string, isVersion: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {monitors.map((monitor) => {
        const lastRun = runs.find((r) => r.monitorId === monitor.id);
        const isVersion = VERSION_TYPES.has(monitor.type);
        const statusColor = !monitor.enabled || !lastRun
          ? "border-border text-text-secondary"
          : isVersion
          ? lastRun.level === "red" ? "border-danger/40 text-danger" : lastRun.level === "yellow" ? "border-warning/40 text-warning" : "border-success/30 text-success"
          : lastRun.ok ? "border-success/30 text-success" : lastRun.level === "yellow" ? "border-warning/40 text-warning" : "border-danger/40 text-danger";
        const dot = !monitor.enabled || !lastRun
          ? "bg-text-muted/40"
          : isVersion
          ? lastRun.level === "red" ? "bg-danger" : lastRun.level === "yellow" ? "bg-warning" : "bg-success"
          : lastRun.ok ? "bg-success" : lastRun.level === "yellow" ? "bg-warning" : "bg-danger";
        return (
          <button
            key={monitor.id}
            type="button"
            onClick={() => onNavigate(monitor.id, isVersion)}
            className={`flex flex-col gap-2 rounded-xl border bg-surface p-3 text-left hover:bg-surface-elevated transition-colors ${statusColor}`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className={`h-2 w-2 rounded-full shrink-0 ${dot}`} />
              {isVersion && <GitBranch className="w-3 h-3 text-text-muted/60 shrink-0" />}
            </div>
            <span className="text-xs font-medium text-text-primary truncate leading-tight">{monitor.name}</span>
            {lastRun?.latencyMs != null && !isVersion && (
              <span className="text-[10px] text-text-muted font-mono">{lastRun.latencyMs}ms</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function TableView({ monitors, runs, onNavigate }: { monitors: Monitor[]; runs: MonitorRun[]; onNavigate: (id: string, isVersion: boolean) => void }) {
  return (
    <Card className="p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHead>
            <tr>
              <TableHeader>Name</TableHeader>
              <TableHeader>Type</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Trend</TableHeader>
              <TableHeader>Last Check</TableHeader>
              <TableHeader>Actions</TableHeader>
            </tr>
          </TableHead>
          <TableBody>
            {monitors.map((monitor) => {
              const lastRun = runs.find((r) => r.monitorId === monitor.id);
              const isVersion = VERSION_TYPES.has(monitor.type);
              return (
                <TableRow key={monitor.id}>
                  <TableCell className="font-medium">{monitor.name}</TableCell>
                  <TableCell className="text-text-secondary">
                    <div className="flex items-center gap-1.5">
                      {isVersion && <GitBranch className="w-3.5 h-3.5 text-text-secondary opacity-60" />}
                      {formatMonitorType(monitor.type)}
                    </div>
                  </TableCell>
                  <TableCell>
                    {!monitor.enabled ? (
                      <Badge variant="warning">Disabled</Badge>
                    ) : lastRun ? (
                      isVersion ? versionStatusBadge(lastRun.level) : (
                        lastRun.level === "yellow" ? <Badge variant="warning">Degraded</Badge> :
                        lastRun.ok ? <Badge variant="success">Operational</Badge> :
                        <Badge variant="danger">Down</Badge>
                      )
                    ) : <Badge variant="default">Pending</Badge>}
                  </TableCell>
                  <TableCell>
                    <MiniSparkline
                      data={runs.filter((r) => r.monitorId === monitor.id).slice(0, 20).reverse().map((r) => ({ value: r.latencyMs ?? 0, ok: r.ok }))}
                      height={28}
                      color={!lastRun || lastRun.ok ? "#3fb950" : "#f85149"}
                      className="w-20"
                    />
                  </TableCell>
                  <TableCell className="text-text-secondary text-sm">
                    {lastRun ? relativeTime(lastRun.checkedAt) : "Never"}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => onNavigate(monitor.id, isVersion)} className="text-accent hover:text-accent-hover">
                      View →
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
