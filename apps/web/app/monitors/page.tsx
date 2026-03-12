"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Edit2, Trash2, Eye, AlertCircle, CheckCircle2 } from "lucide-react";
import { api } from "../../lib/api";
import { getUser } from "../../components/auth";
import { AppFrame } from "../../components/app-frame";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from "../components/Table";
import { Modal } from "../components/Modal";
import { FadeIn } from "../components/FadeIn";

interface Monitor {
  id: string;
  name: string;
  type: "HTTP" | "GIT_RELEASE" | "DOCKER_IMAGE";
  target: string;
  intervalSec: number;
  enabled: boolean;
  createdAt: string;
}

interface MonitorRun {
  id: string;
  monitorId: string;
  ok: boolean;
  status: number;
  latencyMs?: number;
  message: string;
  checkedAt: string;
}

export default function MonitorsPage() {
  const router = useRouter();
  const [user, setUser] = useState<ReturnType<typeof getUser> | null>(null);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [runs, setRuns] = useState<MonitorRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingMonitor, setEditingMonitor] = useState<Monitor | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    type: "HTTP" as const,
    target: "",
    intervalSec: 60,
    enabled: true,
  });

  useEffect(() => {
    const currentUser = getUser();
    setUser(currentUser);
    if (!currentUser) {
      router.push("/login");
      return;
    }

    const userId = currentUser.id;

    async function loadMonitors() {
      try {
        setLoading(true);
        setError("");
        const monitorsData = await api<Monitor[]>("/v1/monitors", userId);
        setMonitors(monitorsData);

        const runsData = await api<MonitorRun[]>("/v1/monitors/runs?limit=20", userId);
        setRuns(runsData);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load monitors");
      } finally {
        setLoading(false);
      }
    }

    loadMonitors();
  }, [router]);

  const handleCreate = async () => {
    try {
      await api("/v1/monitors", user?.id, {
        method: "POST",
        body: JSON.stringify(formData),
      });
      setShowModal(false);
      setFormData({ name: "", type: "HTTP", target: "", intervalSec: 60, enabled: true });
      // Reload
      const monitorsData = await api<Monitor[]>("/v1/monitors", user?.id);
      setMonitors(monitorsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create monitor");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this monitor?")) return;
    try {
      await api(`/v1/monitors/${id}`, user?.id, { method: "DELETE" });
      setMonitors(monitors.filter((m) => m.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete monitor");
    }
  };

  if (!user) return null;
  if (loading)
    return (
      <AppFrame title="Monitors">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-accent border-t-transparent" />
        </div>
      </AppFrame>
    );

  return (
    <AppFrame title="Monitors" subtitle="Manage your application monitors">
      <div className="space-y-6">
        {error && (
          <FadeIn>
            <div className="flex items-start gap-3 p-4 rounded-xl bg-danger/10 border border-danger/20">
              <AlertCircle className="w-5 h-5 text-danger mt-0.5 shrink-0" />
              <span className="text-danger text-sm">{error}</span>
            </div>
          </FadeIn>
        )}

        <FadeIn>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Monitors</h2>
              <p className="text-text-muted text-sm mt-1">
                {monitors.length} {monitors.length === 1 ? "monitor" : "monitors"} active
              </p>
            </div>
            <Button
              onClick={() => {
                setModalMode("create");
                setEditingMonitor(null);
                setFormData({ name: "", type: "HTTP", target: "", intervalSec: 60, enabled: true });
                setShowModal(true);
              }}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> New Monitor
            </Button>
          </div>
        </FadeIn>

        {monitors.length === 0 ? (
          <Card className="text-center py-12">
            <Eye className="w-12 h-12 text-text-muted mx-auto mb-4 opacity-50" />
            <p className="text-text-muted mb-4">No monitors yet</p>
            <Button onClick={() => setShowModal(true)}>Create your first monitor</Button>
          </Card>
        ) : (
          <FadeIn delay={0.1}>
            <Card>
              <Table>
                <TableHead>
                  <tr>
                    <TableHeader>Name</TableHeader>
                    <TableHeader>Type</TableHeader>
                    <TableHeader>Target</TableHeader>
                    <TableHeader>Interval</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Actions</TableHeader>
                  </tr>
                </TableHead>
                <TableBody>
                  {monitors.map((monitor) => {
                    const lastRun = runs.find((r) => r.monitorId === monitor.id);
                    return (
                      <TableRow key={monitor.id}>
                        <TableCell className="font-medium">{monitor.name}</TableCell>
                        <TableCell className="text-sm text-text-muted">{monitor.type}</TableCell>
                        <TableCell className="text-sm text-text-muted truncate max-w-xs">
                          {monitor.target}
                        </TableCell>
                        <TableCell className="text-sm text-text-muted">{monitor.intervalSec}s</TableCell>
                        <TableCell>
                          {!monitor.enabled ? (
                            <Badge variant="warning">Disabled</Badge>
                          ) : lastRun ? (
                            <Badge variant={lastRun.ok ? "success" : "danger"}>
                              {lastRun.ok ? "OK" : "Failed"}
                            </Badge>
                          ) : (
                            <Badge>Pending</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <button
                            onClick={() => handleDelete(monitor.id)}
                            className="text-danger hover:text-danger/80 text-sm transition-colors inline"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </FadeIn>
        )}

        {/* Recent runs */}
        {runs.length > 0 && (
          <FadeIn delay={0.2}>
            <Card>
              <h3 className="text-lg font-bold mb-4">Recent Activity</h3>
              <div className="space-y-2">
                {runs.slice(0, 10).map((run) => (
                  <div key={run.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-elevated/50">
                    <div className="flex items-center gap-2">
                      {run.ok ? (
                        <CheckCircle2 className="w-4 h-4 text-success" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-danger" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm">
                          <strong>{monitors.find((m) => m.id === run.monitorId)?.name}</strong> — {run.message}
                        </p>
                        <p className="text-xs text-text-muted">
                          {new Date(run.checkedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    {run.latencyMs && <span className="text-xs text-text-muted">{run.latencyMs}ms</span>}
                  </div>
                ))}
              </div>
            </Card>
          </FadeIn>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={modalMode === "create" ? "New Monitor" : "Edit Monitor"}
        size="md"
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate}>
              {modalMode === "create" ? "Create" : "Update"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Monitor Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 bg-surface-elevated border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
              placeholder="My API"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
              className="w-full px-4 py-2 bg-surface-elevated border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="HTTP">HTTP Check</option>
              <option value="GIT_RELEASE">Git Release</option>
              <option value="DOCKER_IMAGE">Docker Image</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Target</label>
            <input
              type="text"
              value={formData.target}
              onChange={(e) => setFormData({ ...formData, target: e.target.value })}
              className="w-full px-4 py-2 bg-surface-elevated border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
              placeholder="https://api.example.com/health"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Check Interval (seconds)</label>
            <input
              type="number"
              min="30"
              max="3600"
              value={formData.intervalSec}
              onChange={(e) => setFormData({ ...formData, intervalSec: parseInt(e.target.value) })}
              className="w-full px-4 py-2 bg-surface-elevated border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            />
          </div>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={formData.enabled}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
              className="w-4 h-4 rounded border-border bg-surface-elevated text-accent"
            />
            <span className="text-sm">Enabled</span>
          </label>
        </div>
      </Modal>
    </AppFrame>
  );
}
