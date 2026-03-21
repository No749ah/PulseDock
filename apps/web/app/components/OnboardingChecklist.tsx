"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, X, Zap, Sparkles, Loader2 } from "lucide-react";
import { Card } from "./Card";
import { Button } from "./Button";
import { brand } from "../../lib/brand";
import { api } from "../../lib/api";
import { useToast } from "../../components/ui/toast";

interface Step {
  id: string;
  label: string;
  description: string;
  done: boolean;
  href: string;
  action: string;
  note?: string;
}

interface OnboardingChecklistProps {
  userId: string;
  hasMonitors: boolean;
  hasAlertChannels: boolean;
}

const DISMISSED_KEY_PREFIX = "pulsedock_onboarding_dismissed_";
const GLOBAL_DISMISSED_KEY = "onboarding-dismissed";

export function OnboardingChecklist({
  userId,
  hasMonitors,
  hasAlertChannels,
}: OnboardingChecklistProps) {
  const router = useRouter();
  const toast = useToast();
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    const perUserKey = DISMISSED_KEY_PREFIX + userId;
    const globalKey = GLOBAL_DISMISSED_KEY;
    const isDismissed =
      localStorage.getItem(perUserKey) === "true" ||
      localStorage.getItem(globalKey) === "true";
    setDismissed(isDismissed);
    setMounted(true);
  }, [userId]);

  const handleDismiss = () => {
    const perUserKey = DISMISSED_KEY_PREFIX + userId;
    localStorage.setItem(perUserKey, "true");
    localStorage.setItem(GLOBAL_DISMISSED_KEY, "true");
    setDismissed(true);
  };

  const handleSeedDemo = async () => {
    setSeeding(true);
    try {
      const res = await api<{ alreadySeeded: boolean; monitors?: string[] }>('/v1/demo/seed', undefined, { method: 'POST' });
      if (res.alreadySeeded) {
        toast.info('Your account already has monitors — no demo data needed.');
      } else {
        toast.success(`Demo data loaded! Created ${res.monitors?.length ?? 0} monitors, 1 alert channel, and a status page.`);
        // Refresh to show new monitors / alert channels in checklist
        router.refresh();
      }
    } catch {
      toast.error('Failed to load demo data. Please try again.');
    } finally {
      setSeeding(false);
    }
  };

  if (!mounted || dismissed) return null;
  // Don't show if all complete (check after steps are defined — handled below)

  const steps: Step[] = [
    {
      id: "monitor",
      label: "Create your first monitor",
      description: "Set up HTTP, version, or custom endpoint monitoring",
      done: hasMonitors,
      href: "/monitors",
      action: "Add Monitor",
    },
    {
      id: "alerts",
      label: "Set up an alert channel",
      description: "Get notified via Email, Slack, Discord, or Webhook",
      done: hasAlertChannels,
      href: "/alerts",
      action: "Add Channel",
    },
    {
      id: "explore",
      label: "Explore your dashboard",
      description: "View uptime stats, recent activity, and live updates",
      done: hasMonitors && hasAlertChannels,
      href: "/dashboard",
      action: "View Dashboard",
    },
    {
      id: "status-page",
      label: "Create a status page",
      description: "Share a public status page with your users",
      done: false,
      href: "/status-pages",
      action: "Create Page",
    },
    {
      id: "team",
      label: "Invite a team member",
      description: "Collaborate with your team on monitoring",
      done: false,
      href: "/account",
      action: "Go to Account",
      note: "Team features coming soon",
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allComplete = completedCount === steps.length;
  const progressPct = Math.round((completedCount / steps.length) * 100);

  // Hide if all steps complete (steps 1-3 matter most — team/status-page are always incomplete)
  // Only hide if the first 3 core steps are all done and user hasn't manually dismissed
  const coreSteps = steps.slice(0, 3);
  const coreAllDone = coreSteps.every((s) => s.done);
  if (coreAllDone && allComplete) return null;

  return (
    <Card className="relative border-accent/30 bg-gradient-to-br from-accent/5 to-transparent">
      {/* Dismiss button */}
      <button
        className="absolute top-4 right-4 p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
        onClick={handleDismiss}
        aria-label="Dismiss getting started guide"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Header */}
      <div className="flex items-start gap-4 mb-6 pr-8">
        <div className="p-3 rounded-xl bg-accent/10 shrink-0">
          <Zap className="w-6 h-6 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-text-primary">Get started with {brand.name}</h2>
          <p className="text-text-secondary text-sm mt-1">
            Complete these steps to start monitoring your services
          </p>
        </div>
        {!hasMonitors && (
          <Button
            size="sm"
            variant="secondary"
            onClick={handleSeedDemo}
            disabled={seeding}
            className="shrink-0 text-xs flex items-center gap-1.5"
            title="Populate your account with sample monitors and a status page"
          >
            {seeding ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {seeding ? 'Loading…' : 'Load Sample Data'}
          </Button>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-text-secondary">
            {completedCount} of {steps.length} steps complete
          </span>
          <span className="text-xs font-medium text-accent">{progressPct}%</span>
        </div>
        <div className="h-1.5 bg-surface-elevated rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step) => (
          <div
            key={step.id}
            className={[
              "flex items-start gap-4 p-4 rounded-xl border transition-all",
              step.done
                ? "bg-success/5 border-success/20 opacity-70"
                : "bg-surface-elevated/50 border-border hover:border-border-hover",
            ].join(" ")}
          >
            {step.done ? (
              <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
            ) : (
              <Circle className="w-5 h-5 text-text-secondary/50 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p
                className={[
                  "text-sm font-medium",
                  step.done ? "line-through text-text-secondary" : "text-text-primary",
                ].join(" ")}
              >
                {step.label}
              </p>
              <p className="text-xs text-text-secondary mt-0.5">{step.description}</p>
              {step.note && !step.done && (
                <p className="text-xs text-text-muted mt-0.5 italic">{step.note}</p>
              )}
            </div>
            {!step.done && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => router.push(step.href)}
                className="shrink-0 text-accent border-accent/25 hover:border-accent/50"
              >
                {step.action} →
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* All done banner */}
      {coreAllDone && (
        <div className="mt-4 p-4 rounded-xl bg-success/10 border border-success/20 flex items-center justify-between gap-4">
          <p className="text-sm text-success font-medium">
            🎉 You&apos;re all set! {brand.name} is monitoring your services.
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDismiss}
            className="text-success shrink-0"
          >
            Dismiss
          </Button>
        </div>
      )}
    </Card>
  );
}
