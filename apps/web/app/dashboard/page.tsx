"use client";

import { AlertCircle } from "lucide-react";
import { AppFrame } from "../../components/app-frame";
import { FadeIn } from "../components/FadeIn";
import { OnboardingChecklist } from "../components/OnboardingChecklist";
import { ProductTour, type TourStep } from "../../components/product-tour";
import { brand } from "../../lib/brand";
import { useDashboard } from "./hooks/useDashboard";
import { ActiveIncidentsBanner } from "./components/ActiveIncidentsBanner";
import { DashboardControls } from "./components/DashboardControls";
import { HealthTimelineSection } from "./components/HealthTimelineSection";
import { MonitorsSection } from "./components/MonitorsSection";
import { RecentActivitySection } from "./components/RecentActivitySection";
import { SloSection } from "./components/SloSection";
import { UptimeSection } from "./components/UptimeSection";
import { VersionSection } from "./components/VersionSection";

const DASHBOARD_TOUR_STEPS: TourStep[] = [
  {
    title: `Welcome to ${brand.name}! 👋`,
    content: `${brand.name} monitors your self-hosted tools, tracks versions, and builds beautiful status pages. Let's take a quick tour to get you started.`,
  },
  {
    target: "nav[aria-label='Main navigation']",
    placement: "right",
    title: "Navigation",
    content: "Use the left sidebar to navigate between Monitors, Alerts, Versions, Status Pages, and more. Each section has its own tools and views.",
  },
  {
    target: "[data-tour='stats-row']",
    placement: "bottom",
    title: "Live Stats",
    content: "These cards show real-time counts of your monitors, uptime percentage, checks run today, and version tracking status. All update live via WebSocket.",
  },
  {
    target: "[data-tour='add-monitor']",
    placement: "bottom",
    title: "Add Your First Monitor",
    content: "Click here to add a monitor. Choose from HTTP uptime checks, SSL certificate monitoring, TCP port checks, Heartbeat monitors, or version tracking for 5000+ self-hosted tools.",
  },
  {
    target: "[data-tour='time-range']",
    placement: "bottom",
    title: "Time Range Selector",
    content: "Filter your dashboard view by time period — 1h, 6h, 24h, 7d, or 30d. The live indicator shows when auto-refresh is active.",
  },
];

export default function DashboardPage() {
  const db = useDashboard();

  if (!db.user) return null;

  if (db.loading) {
    return (
      <AppFrame title="Dashboard" subtitle="Loading...">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-accent border-t-transparent" />
        </div>
      </AppFrame>
    );
  }

  return (
    <AppFrame title="Dashboard" subtitle={`Welcome back, ${db.user.name || "there"}!`} breadcrumbs={[{ label: "Dashboard" }]}>
      <div className="space-y-8">

        {/* Controls (heading + time range + actions + customize panel) */}
        <DashboardControls
          timeRange={db.timeRange}
          onSetTimeRange={db.setTimeRange}
          autoRefresh={db.autoRefresh}
          onToggleAutoRefresh={() => db.setAutoRefresh(!db.autoRefresh)}
          refreshInterval={db.refreshInterval}
          onSetRefreshInterval={db.setRefreshInterval}
          lastRefreshedText={db.lastRefreshedText}
          refreshing={db.refreshing}
          onRefreshNow={() => db.loadDashboard(true)}
          isFullscreen={db.isFullscreen}
          onToggleFullscreen={db.toggleFullscreen}
          showCustomize={db.showCustomize}
          onToggleCustomize={() => db.setShowCustomize(!db.showCustomize)}
          sectionOrder={db.sectionOrder}
          onMoveSectionUp={db.moveSectionUp}
          onMoveSectionDown={db.moveSectionDown}
          onResetSectionOrder={db.resetSectionOrder}
        />

        {/* Error */}
        {db.error && (
          <FadeIn>
            <div className="flex items-start gap-3 p-4 rounded-xl bg-danger/10 border border-danger/20">
              <AlertCircle className="w-5 h-5 text-danger mt-0.5 shrink-0" />
              <span className="text-danger text-sm">{db.error}</span>
            </div>
          </FadeIn>
        )}

        {/* Onboarding */}
        <FadeIn>
          <OnboardingChecklist
            userId={db.user.id}
            hasMonitors={db.monitors.length > 0}
            hasAlertChannels={db.hasAlertChannels}
          />
          <ProductTour
            storageKey={`pulsedock_tour_dashboard_${db.user.id}`}
            autoStart={db.monitors.length === 0}
            steps={DASHBOARD_TOUR_STEPS}
          />
        </FadeIn>

        {/* Active incidents banner */}
        <ActiveIncidentsBanner incidents={db.activeIncidents} />

        {/* Ordered sections */}
        {db.sectionOrder.map((sectionKey) => {
          if (sectionKey === "uptime") {
            if (!db.stats) return null;
            return (
              <FadeIn key="uptime">
                <UptimeSection stats={db.stats} />
              </FadeIn>
            );
          }
          if (sectionKey === "versions") {
            if (!db.stats) return null;
            return (
              <FadeIn key="versions">
                <VersionSection stats={db.stats} />
              </FadeIn>
            );
          }
          if (sectionKey === "monitors") {
            return (
              <FadeIn key="monitors">
                <MonitorsSection
                  monitors={db.monitors}
                  runs={db.runs}
                  monitorView={db.monitorView}
                  setMonitorView={db.setMonitorView}
                  seedingDemo={db.seedingDemo}
                  onSeedDemo={db.handleSeedDemo}
                />
              </FadeIn>
            );
          }
          if (sectionKey === "slo") {
            if (!db.sloSummary) return null;
            return (
              <FadeIn key="slo">
                <SloSection sloSummary={db.sloSummary} />
              </FadeIn>
            );
          }
          if (sectionKey === "health") {
            if (!db.healthTimeline) return null;
            return (
              <FadeIn key="health">
                <HealthTimelineSection healthTimeline={db.healthTimeline} />
              </FadeIn>
            );
          }
          return null;
        })}

        {/* Recent activity — always last */}
        <FadeIn>
          <RecentActivitySection uptimeRuns={db.uptimeRuns} />
        </FadeIn>

      </div>
    </AppFrame>
  );
}
