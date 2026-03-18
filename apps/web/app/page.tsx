"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUser } from "../components/auth";
import Link from "next/link";
import { FadeIn } from "./components/FadeIn";
import { GradientText } from "./components/GradientText";
import { Badge } from "./components/Badge";
import { CountUp } from "./components/CountUp";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Check,
  ExternalLink,
  Github,
  Globe,
  Heart,
  LayoutDashboard,
  Monitor,
  Search,
  Server,
  Shield,
  Terminal,
  Users,
  X,
  Zap,
} from "lucide-react";

/* ────────────────────────────────────────────────────────────
   Data
   ──────────────────────────────────────────────────────────── */

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How it Works", href: "#how" },
  { label: "Status Pages", href: "#demo" },
  { label: "Changelog", href: "https://github.com/No749ah/PulseDock/releases" },
];

const stats = [
  { value: "1400+", label: "Tools Tracked" },
  { value: "65+", label: "Status Page Widgets" },
  { value: "86+", label: "Monitor Templates" },
  { value: "100%", label: "Free & Open Source" },
];

const features = [
  {
    icon: Activity,
    title: "Version Intelligence",
    description:
      "Automatic version tracking for 1300+ self-hosted tools. Know instantly when a new release drops.",
  },
  {
    icon: Server,
    title: "Uptime Monitoring",
    description:
      "HTTP, TCP & ping checks with configurable intervals. Sub-second latency detection worldwide.",
  },
  {
    icon: LayoutDashboard,
    title: "Status Pages",
    description:
      "Beautiful, public-facing status pages you can share with your team or stakeholders.",
  },
  {
    icon: Bell,
    title: "Smart Alerting",
    description:
      "Get notified via Email, Discord, Slack, Telegram, Webhooks, or Push — your choice.",
  },
  {
    icon: AlertTriangle,
    title: "Incident Management",
    description:
      "Create, track, and resolve incidents with real-time status updates and post-mortems.",
  },
  {
    icon: Search,
    title: "Tool Registry",
    description:
      "Browse 1300+ self-hosted tools. Find alternatives, compare features, track new releases.",
  },
  {
    icon: Globe,
    title: "Public API",
    description:
      "Integrate checks, status pages, incidents, and versions into your own tooling with a clean REST API.",
  },
  {
    icon: Terminal,
    title: "CLI Tool",
    description:
      "Manage monitors, check status, and trigger incidents from your terminal. Built for automation.",
  },
];

interface MockMonitor {
  name: string;
  status: "up" | "warning" | "down";
  latency: string;
  uptime: string;
  bars: number[];
}

const mockMonitors: MockMonitor[] = [
  { name: "api.pulsedock.io", status: "up", latency: "42ms", uptime: "99.9%", bars: [70,85,90,75,88,92,80,95,78,88,91,85,90,82,88,95,72,88,91,85] },
  { name: "app.pulsedock.io", status: "up", latency: "38ms", uptime: "100%", bars: [80,88,92,85,90,88,95,82,90,88,92,85,90,88,95,80,88,92,85,90] },
  { name: "db.internal", status: "up", latency: "12ms", uptime: "99.99%", bars: [90,92,88,95,90,92,88,95,90,92,88,95,90,92,88,95,90,92,88,95] },
  { name: "cdn.assets", status: "warning", latency: "180ms", uptime: "99.7%", bars: [75,80,70,85,60,78,82,75,65,80,72,78,68,82,75,70,80,65,78,72] },
  { name: "mail.smtp", status: "up", latency: "55ms", uptime: "99.9%", bars: [82,88,85,90,82,88,85,90,82,88,85,90,82,88,85,90,82,88,85,90] },
];

const heroStats = [
  { icon: Monitor, label: "47 Monitors", color: "text-accent" },
  { icon: Activity, label: "99.97% Uptime", color: "text-success" },
  { icon: Bell, label: "2 Updates", color: "text-warning" },
  { icon: Shield, label: "0 Incidents", color: "text-success" },
];

const steps = [
  {
    number: "01",
    title: "Add a Monitor",
    description:
      "Point PulseDock at any HTTP endpoint, Docker container, or Git repo in seconds — one click or a single CLI command.",
    visual: "form",
  },
  {
    number: "02",
    title: "Run Checks",
    description:
      "PulseDock monitors 24/7 from multiple locations. Sub-second latency detection, configurable intervals.",
    visual: "pulse",
  },
  {
    number: "03",
    title: "Get Alerted",
    description:
      "The moment something changes or updates are available, you're notified via your preferred channel.",
    visual: "alert",
  },
];

const demoServices = [
  { name: "API Gateway", uptime: "99.98%" },
  { name: "Web Application", uptime: "100%" },
  { name: "Database Cluster", uptime: "99.99%" },
  { name: "CDN / Assets", uptime: "100%" },
];

const comparisonFeatures = [
  { label: "Open Source", pulsedock: true, uptimeKuma: true, betterStack: false, statuspage: false },
  { label: "Self-Hosted", pulsedock: true, uptimeKuma: true, betterStack: false, statuspage: false },
  { label: "Version Tracking", pulsedock: true, uptimeKuma: false, betterStack: false, statuspage: false },
  { label: "Tool Registry (1400+)", pulsedock: true, uptimeKuma: false, betterStack: false, statuspage: false },
  { label: "Status Pages", pulsedock: true, uptimeKuma: true, betterStack: true, statuspage: true },
  { label: "Incident Management", pulsedock: true, uptimeKuma: true, betterStack: true, statuspage: true },
  { label: "Public API", pulsedock: true, uptimeKuma: true, betterStack: true, statuspage: true },
  { label: "CLI Tool", pulsedock: true, uptimeKuma: false, betterStack: true, statuspage: false },
  { label: "100% Free", pulsedock: true, uptimeKuma: true, betterStack: false, statuspage: false },
];

const selfHostedFeatures = [
  "Unlimited monitors",
  "Unlimited status pages",
  "All alert channels",
  "All features included",
  "Self-hosted & private",
];

const cloudFeatures = [
  "Fully hosted & managed",
  "Automatic updates",
  "Team collaboration",
  "Priority support",
  "Global check nodes",
];

const footerLinks = {
  Product: [
    { label: "Features", href: "#features" },
    { label: "Status Pages", href: "#demo" },
    { label: "Pricing", href: "#pricing" },
    { label: "Changelog", href: "https://github.com/No749ah/PulseDock/releases" },
  ],
  Resources: [
    { label: "Documentation", href: "https://github.com/No749ah/PulseDock#readme" },
    { label: "GitHub", href: "https://github.com/No749ah/PulseDock" },
    { label: "Community", href: "https://github.com/No749ah/PulseDock/discussions" },
    { label: "Report a Bug", href: "https://github.com/No749ah/PulseDock/issues" },
  ],
  More: [
    { label: "MIT License", href: "https://github.com/No749ah/PulseDock/blob/main/LICENSE" },
    { label: "Roadmap", href: "/dashboard" },
    { label: "Status", href: "/status/status" },
  ],
};

/* ────────────────────────────────────────────────────────────
   Sub-components
   ──────────────────────────────────────────────────────────── */

function StatusDot({ status }: { status: "up" | "warning" | "down" }) {
  const colors = {
    up: "bg-success",
    warning: "bg-warning",
    down: "bg-danger",
  };
  return (
    <div className={`w-2 h-2 rounded-full shrink-0 ${colors[status]}`} />
  );
}

function MiniSparkline({ bars }: { bars: number[] }) {
  return (
    <div className="flex items-end gap-[1.5px] h-4">
      {bars.map((h, i) => (
        <div
          key={i}
          className="w-[2px] rounded-full bg-success/50"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   Component
   ──────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    const user = getUser();
    if (user?.id) router.replace("/dashboard");
  }, [router]);

  return (
    <main className="min-h-screen overflow-hidden">
      {/* ─── Navigation ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border backdrop-blur-xl bg-bg/60">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-6 h-16">
          <Link href="/" className="flex items-center gap-2.5 group">
            <Monitor className="w-5 h-5 text-accent group-hover:scale-110 transition-transform" />
            <span className="font-bold text-lg tracking-tight">PulseDock</span>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm text-text-secondary">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="hover:text-text-primary transition-colors"
                {...(link.href.startsWith("http")
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                {link.label}
              </a>
            ))}
          </div>

          <Link
            href="/login"
            className="text-sm bg-accent hover:bg-accent-hover text-bg font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            Sign In
          </Link>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section aria-label="Hero section" className="relative pt-32 pb-20 md:pt-48 md:pb-32">
        {/* Animated background blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[15%] w-72 h-72 md:w-[500px] md:h-[500px] rounded-full bg-accent/8 blur-[100px] motion-safe:animate-blob" />
          <div className="absolute top-[5%] right-[10%] w-64 h-64 md:w-[450px] md:h-[450px] rounded-full bg-purple-500/8 blur-[100px] motion-safe:animate-blob animation-delay-2000" />
          <div className="absolute bottom-[-5%] left-[40%] w-56 h-56 md:w-[400px] md:h-[400px] rounded-full bg-success/6 blur-[100px] motion-safe:animate-blob animation-delay-4000" />
        </div>

        <div className="relative mx-auto max-w-5xl px-6 text-center">
          <FadeIn>
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight leading-[1.08] mb-6">
              <span className="animated-gradient-text">
                Version Intelligence
              </span>
              <br />
              <span className="animated-gradient-text">
                &amp; Uptime Monitoring
              </span>
              <br />
              <span className="text-text-primary">for the Modern Stack</span>
            </h1>
          </FadeIn>

          <FadeIn delay={0.1}>
            <p className="text-lg md:text-xl text-text-secondary max-w-2xl mx-auto mb-10 leading-relaxed">
              Monitor 1300+ self-hosted tools, track versions, build beautiful
              status pages. Open source, self-hosted, free.
            </p>
          </FadeIn>

          <FadeIn delay={0.2}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
              <Link
                href="/login"
                className="bg-accent hover:bg-accent-hover text-bg font-semibold px-8 py-3.5 rounded-xl transition-all hover:shadow-[0_0_40px_rgba(88,166,255,0.3)] text-base flex items-center gap-2"
              >
                Get Started Free <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#how"
                className="border border-border hover:border-border-hover text-text-secondary hover:text-text-primary px-8 py-3.5 rounded-xl transition-all text-base"
              >
                See How It Works
              </a>
            </div>
          </FadeIn>

          <FadeIn delay={0.3}>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Badge variant="success">✦ Open Source</Badge>
              <Badge variant="default">✦ Self-Hosted</Badge>
              <Badge variant="success">✦ Free Forever</Badge>
            </div>
          </FadeIn>

          {/* ─── Hero Dashboard Mockup ─── */}
          <FadeIn delay={0.4}>
            <div className="mt-16 mx-auto max-w-4xl">
              <div
                className="rounded-2xl border border-border/60 bg-surface/80 backdrop-blur-xl shadow-2xl shadow-black/50 overflow-hidden"
                style={{ boxShadow: "0 0 80px rgba(88,166,255,0.08), 0 32px 64px rgba(0,0,0,0.5)" }}
              >
                {/* Browser chrome */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface-elevated/80">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-danger/60" />
                    <div className="w-3 h-3 rounded-full bg-warning/60" />
                    <div className="w-3 h-3 rounded-full bg-success/60" />
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="bg-bg/70 rounded-md px-3 py-1.5 text-xs text-text-muted text-center font-mono max-w-[220px] mx-auto">
                      app.pulsedock.io
                    </div>
                  </div>
                </div>

                {/* Dashboard content */}
                <div className="p-5 space-y-4">
                  {/* Stat cards row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {heroStats.map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-xl border border-border bg-bg/60 p-3 flex items-center gap-2.5"
                      >
                        <stat.icon className={`w-4 h-4 shrink-0 ${stat.color}`} />
                        <span className="text-xs font-medium text-text-primary truncate">{stat.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Monitors list */}
                  <div className="rounded-xl border border-border bg-bg/40 overflow-hidden">
                    <div className="px-4 py-2 border-b border-border/60 flex items-center justify-between">
                      <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Monitors</span>
                      <span className="text-xs text-text-muted">Live</span>
                    </div>
                    <div className="divide-y divide-border/40">
                      {mockMonitors.map((monitor) => (
                        <div key={monitor.name} className="flex items-center gap-3 px-4 py-2.5">
                          <StatusDot status={monitor.status} />
                          <span className="text-xs text-text-primary font-mono flex-1 truncate">{monitor.name}</span>
                          <MiniSparkline bars={monitor.bars} />
                          <span className={`text-xs tabular-nums w-12 text-right ${monitor.status === "warning" ? "text-warning" : "text-text-muted"}`}>
                            {monitor.latency}
                          </span>
                          <span className="text-xs tabular-nums text-success w-12 text-right hidden sm:block">
                            {monitor.uptime}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── Stats Bar ─── */}
      <section aria-label="Stats" className="py-16 border-y border-border bg-surface/40">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
            {stats.map((stat, i) => (
              <FadeIn key={stat.label} delay={i * 0.08}>
                <div className="text-center">
                  <div className="text-4xl md:text-5xl font-bold text-text-primary tracking-tight">
                    <CountUp value={stat.value} duration={1600} />
                  </div>
                  <div className="text-sm text-text-muted mt-2 uppercase tracking-wider">
                    {stat.label}
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features Grid ─── */}
      <section id="features" aria-label="Features" className="py-24 md:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <FadeIn>
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
                Everything you need to{" "}
                <GradientText from="#58a6ff" to="#a78bfa">
                  stay ahead
                </GradientText>
              </h2>
              <p className="text-text-secondary text-lg max-w-xl mx-auto">
                A complete toolkit for monitoring, alerting, and sharing the
                health of your infrastructure.
              </p>
            </div>
          </FadeIn>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((feature, i) => (
              <FadeIn key={feature.title} delay={i * 0.06}>
                <div className="group p-6 rounded-2xl border border-border bg-surface/60 backdrop-blur-sm hover:bg-surface-elevated hover:border-accent/30 transition-all duration-300 h-full">
                  <feature.icon className="w-9 h-9 text-accent mb-4 group-hover:scale-110 transition-transform duration-300" />
                  <h3 className="text-base font-semibold mb-2">{feature.title}</h3>
                  <p className="text-text-secondary text-sm leading-relaxed">{feature.description}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How It Works (Enhanced) ─── */}
      <section id="how" aria-label="How it works" className="py-24 md:py-32 border-t border-border">
        <div className="mx-auto max-w-5xl px-6">
          <FadeIn>
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
                Up and running in{" "}
                <GradientText from="#3fb950" to="#58a6ff">
                  three steps
                </GradientText>
              </h2>
            </div>
          </FadeIn>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Step 1 */}
            <FadeIn delay={0}>
              <div className="rounded-2xl border border-border bg-surface/40 p-6 flex flex-col gap-5 h-full">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-purple-500 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-bg">01</span>
                  </div>
                  <h3 className="text-lg font-semibold">{steps[0].title}</h3>
                </div>
                <p className="text-text-secondary text-sm leading-relaxed">{steps[0].description}</p>
                {/* Mini form mockup */}
                <div className="mt-auto rounded-xl border border-border bg-bg/60 p-3 space-y-2">
                  <div className="text-xs text-text-muted font-medium mb-1">Add Monitor</div>
                  <div className="flex gap-2">
                    <div className="flex-1 bg-surface/80 border border-border rounded-lg px-3 py-1.5 text-xs text-text-muted font-mono">
                      https://api.example.com
                    </div>
                    <div className="bg-accent rounded-lg px-3 py-1.5 text-xs font-semibold text-bg shrink-0">
                      Add
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="bg-surface/60 border border-border rounded-md px-2 py-1 text-xs text-text-muted">HTTP</div>
                    <div className="bg-surface/60 border border-border rounded-md px-2 py-1 text-xs text-text-muted">60s</div>
                    <div className="bg-surface/60 border border-border rounded-md px-2 py-1 text-xs text-text-muted">Discord</div>
                  </div>
                </div>
              </div>
            </FadeIn>

            {/* Step 2 */}
            <FadeIn delay={0.15}>
              <div className="rounded-2xl border border-border bg-surface/40 p-6 flex flex-col gap-5 h-full">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-success to-accent flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-bg">02</span>
                  </div>
                  <h3 className="text-lg font-semibold">{steps[1].title}</h3>
                </div>
                <p className="text-text-secondary text-sm leading-relaxed">{steps[1].description}</p>
                {/* Pulse check visual */}
                <div className="mt-auto rounded-xl border border-border bg-bg/60 p-4 flex items-center gap-4">
                  <div className="relative shrink-0">
                    <div className="w-3 h-3 rounded-full bg-success" />
                    <div className="absolute inset-0 rounded-full bg-success/40 animate-ping" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-text-primary">Checking api.example.com</div>
                    <div className="text-xs text-text-muted mt-0.5 font-mono">
                      <span className="text-success">42ms</span>
                      {" · "}
                      <span className="text-success">200 OK</span>
                    </div>
                  </div>
                  <Zap className="w-4 h-4 text-warning ml-auto shrink-0" />
                </div>
              </div>
            </FadeIn>

            {/* Step 3 */}
            <FadeIn delay={0.3}>
              <div className="rounded-2xl border border-border bg-surface/40 p-6 flex flex-col gap-5 h-full">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-warning to-danger flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-bg">03</span>
                  </div>
                  <h3 className="text-lg font-semibold">{steps[2].title}</h3>
                </div>
                <p className="text-text-secondary text-sm leading-relaxed">{steps[2].description}</p>
                {/* Notification card */}
                <div className="mt-auto rounded-xl border border-border bg-bg/60 p-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-accent/20 border border-accent/20 flex items-center justify-center shrink-0 text-base">
                      🔔
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-text-primary">Update Available</div>
                      <div className="text-xs text-text-muted mt-0.5">Grafana 11.4.0 is available</div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-xs bg-warning/15 text-warning border border-warning/20 rounded px-1.5 py-0.5">11.3.2 → 11.4.0</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ─── Screenshot Gallery ─── */}
      <section aria-label="Screenshots" className="py-24 md:py-32 border-t border-border">
        <div className="mx-auto max-w-6xl px-6">
          <FadeIn>
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
                Everything You Need,{" "}
                <GradientText from="#58a6ff" to="#a78bfa">
                  Nothing You Don&apos;t
                </GradientText>
              </h2>
              <p className="text-text-secondary text-lg max-w-xl mx-auto">
                A clean, focused interface that gets out of your way.
              </p>
            </div>
          </FadeIn>

          <div className="grid sm:grid-cols-2 gap-5">
            {/* Dashboard card */}
            <FadeIn delay={0.05}>
              <div className="group hover:-translate-y-1 transition-transform duration-300">
                <div className="rounded-2xl border border-border bg-surface/60 overflow-hidden">
                  <div className="p-4 space-y-3">
                    {/* mini metric cards */}
                    <div className="grid grid-cols-3 gap-2">
                      {["47 Monitors", "99.97%", "2 Alerts"].map((m, i) => (
                        <div key={i} className="bg-bg/60 border border-border/60 rounded-lg p-2 text-center">
                          <div className="text-xs font-semibold text-text-primary">{m}</div>
                        </div>
                      ))}
                    </div>
                    {/* mini status dots */}
                    <div className="flex gap-1.5 flex-wrap">
                      {Array.from({ length: 18 }, (_, i) => (
                        <div
                          key={i}
                          className={`w-3 h-3 rounded-sm ${i === 4 || i === 11 ? "bg-warning/70" : "bg-success/60"}`}
                        />
                      ))}
                    </div>
                    {/* mini chart */}
                    <div className="rounded-lg bg-bg/40 border border-border/40 p-2">
                      <div className="flex items-end gap-[2px] h-8">
                        {[60,72,65,80,75,88,82,90,85,92,78,88,91,85,90,82,88,95,78,88].map((h, i) => (
                          <div key={i} className="flex-1 rounded-sm bg-accent/40" style={{ height: `${h}%` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-text-muted text-center mt-3 font-medium">Dashboard</p>
              </div>
            </FadeIn>

            {/* Monitors List card */}
            <FadeIn delay={0.1}>
              <div className="group hover:-translate-y-1 transition-transform duration-300">
                <div className="rounded-2xl border border-border bg-surface/60 overflow-hidden">
                  <div className="p-4 space-y-2">
                    <div className="flex gap-3 text-xs text-text-muted font-medium pb-1 border-b border-border/50">
                      <span className="flex-1">Name</span>
                      <span className="w-10 text-right">Status</span>
                      <span className="w-12 text-right">Latency</span>
                      <span className="w-12 text-right">Uptime</span>
                    </div>
                    {[
                      { n: "api.example.com", s: "up", l: "42ms", u: "99.9%" },
                      { n: "app.example.com", s: "up", l: "38ms", u: "100%" },
                      { n: "db.internal", s: "up", l: "12ms", u: "99.99%" },
                      { n: "mail.smtp", s: "down", l: "—", u: "98.2%" },
                      { n: "cdn.assets", s: "up", l: "55ms", u: "100%" },
                    ].map((row, i) => (
                      <div key={i} className="flex items-center gap-3 text-xs py-1">
                        <span className="flex-1 font-mono text-text-primary truncate">{row.n}</span>
                        <div className={`w-10 flex justify-end`}>
                          <div className={`w-2 h-2 rounded-full ${row.s === "up" ? "bg-success" : "bg-danger"}`} />
                        </div>
                        <span className={`w-12 text-right tabular-nums ${row.s === "down" ? "text-danger" : "text-text-muted"}`}>{row.l}</span>
                        <span className="w-12 text-right tabular-nums text-text-muted">{row.u}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-sm text-text-muted text-center mt-3 font-medium">Monitors List</p>
              </div>
            </FadeIn>

            {/* Status Page Builder card */}
            <FadeIn delay={0.15}>
              <div className="group hover:-translate-y-1 transition-transform duration-300">
                <div className="rounded-2xl border border-border bg-surface/60 overflow-hidden">
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-text-secondary">Page Builder</span>
                      <div className="bg-accent/20 text-accent text-xs px-2 py-0.5 rounded-full border border-accent/20">Live</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {["Status Banner", "Uptime Chart", "Incidents", "Metrics", "Services", "Timeline"].map((w, i) => (
                        <div key={i} className={`rounded-lg border px-3 py-2 text-xs text-center ${i === 0 || i === 2 ? "border-accent/40 bg-accent/10 text-accent" : "border-border bg-bg/40 text-text-muted"}`}>
                          {w}
                        </div>
                      ))}
                    </div>
                    <div className="rounded-lg bg-bg/40 border border-border/40 px-3 py-2 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-success" />
                      <span className="text-xs text-success font-medium">All Systems Operational</span>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-text-muted text-center mt-3 font-medium">Status Page Builder</p>
              </div>
            </FadeIn>

            {/* Incidents card */}
            <FadeIn delay={0.2}>
              <div className="group hover:-translate-y-1 transition-transform duration-300">
                <div className="rounded-2xl border border-border bg-surface/60 overflow-hidden">
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-text-secondary">Incidents</span>
                      <span className="text-xs text-text-muted">Last 30d</span>
                    </div>
                    {[
                      { title: "API elevated latency", sev: "minor", time: "2h ago", color: "text-warning border-warning/30 bg-warning/10" },
                      { title: "DB connection pool", sev: "major", time: "1d ago", color: "text-danger border-danger/30 bg-danger/10" },
                      { title: "CDN cache miss spike", sev: "minor", time: "3d ago", color: "text-warning border-warning/30 bg-warning/10" },
                      { title: "Grafana update applied", sev: "info", time: "5d ago", color: "text-accent border-accent/30 bg-accent/10" },
                    ].map((inc, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-px h-8 bg-border/60 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-text-primary truncate font-medium">{inc.title}</div>
                          <div className="text-xs text-text-muted">{inc.time}</div>
                        </div>
                        <span className={`text-xs border rounded-full px-2 py-0.5 shrink-0 ${inc.color}`}>{inc.sev}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-sm text-text-muted text-center mt-3 font-medium">Incidents</p>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ─── Demo Preview ─── */}
      <section id="demo" aria-label="Demo" className="py-24 md:py-32 border-t border-border">
        <div className="mx-auto max-w-4xl px-6">
          <FadeIn>
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
                Beautiful{" "}
                <GradientText from="#58a6ff" to="#3fb950">
                  Status Pages
                </GradientText>
              </h2>
              <p className="text-text-secondary text-lg max-w-xl mx-auto">
                Share real-time system health with your team or the world.
                Always on, always accurate.
              </p>
            </div>
          </FadeIn>

          <FadeIn delay={0.15}>
            <div className="rounded-2xl border border-border bg-surface shadow-2xl shadow-black/40 overflow-hidden">
              {/* Browser chrome */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface-elevated">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-danger/50" />
                  <div className="w-3 h-3 rounded-full bg-warning/50" />
                  <div className="w-3 h-3 rounded-full bg-success/50" />
                </div>
                <div className="flex-1 mx-4">
                  <div className="bg-bg/60 rounded-md px-3 py-1.5 text-xs text-text-muted text-center font-mono">
                    status.yourcompany.com
                  </div>
                </div>
              </div>

              {/* Status page content */}
              <div className="p-6 md:p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">System Status</h3>
                    <p className="text-sm text-text-muted mt-0.5">Updated just now</p>
                  </div>
                  <div className="flex items-center gap-2 bg-success/10 border border-success/20 rounded-full px-4 py-1.5">
                    <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                    <span className="text-sm font-medium text-success">All Systems Operational</span>
                  </div>
                </div>

                <div className="space-y-3">
                  {demoServices.map((service) => (
                    <div
                      key={service.name}
                      className="flex items-center justify-between py-3 px-4 rounded-xl bg-bg/50 border border-border"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-success" />
                        <span className="text-sm font-medium">{service.name}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="hidden sm:flex items-end gap-[2px] h-4">
                          {Array.from({ length: 30 }, (_, j) => (
                            <div
                              key={j}
                              className="w-[3px] rounded-full bg-success/60"
                              style={{ height: `${60 + ((j * 17 + 7) % 40)}%` }}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-text-muted tabular-nums w-14 text-right">
                          {service.uptime}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── Comparison ─── */}
      <section aria-label="Comparison" className="py-24 md:py-32 border-t border-border">
        <div className="mx-auto max-w-5xl px-6">
          <FadeIn>
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
                Why{" "}
                <GradientText from="#58a6ff" to="#a78bfa">
                  PulseDock
                </GradientText>
                ?
              </h2>
              <p className="text-text-secondary text-lg">See how we compare to the alternatives.</p>
            </div>
          </FadeIn>

          <FadeIn delay={0.1}>
            <div className="rounded-2xl border border-border bg-surface/60 backdrop-blur-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-4 px-6 font-medium text-text-muted">Feature</th>
                      <th className="py-4 px-4 font-semibold text-accent text-center">PulseDock</th>
                      <th className="py-4 px-4 font-medium text-text-secondary text-center">Uptime Kuma</th>
                      <th className="py-4 px-4 font-medium text-text-secondary text-center">Better Stack</th>
                      <th className="py-4 px-4 font-medium text-text-secondary text-center hidden sm:table-cell">Statuspage.io</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonFeatures.map((row) => (
                      <tr key={row.label} className="border-b border-border/50 last:border-0">
                        <td className="py-3.5 px-6 text-text-primary font-medium">{row.label}</td>
                        <td className="py-3.5 px-4 text-center">
                          {row.pulsedock ? (
                            <Check className="w-5 h-5 text-success mx-auto" />
                          ) : (
                            <X className="w-5 h-5 text-text-muted/40 mx-auto" />
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {row.uptimeKuma ? (
                            <Check className="w-5 h-5 text-success/60 mx-auto" />
                          ) : (
                            <X className="w-5 h-5 text-text-muted/40 mx-auto" />
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {row.betterStack ? (
                            <Check className="w-5 h-5 text-success/60 mx-auto" />
                          ) : (
                            <X className="w-5 h-5 text-text-muted/40 mx-auto" />
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center hidden sm:table-cell">
                          {row.statuspage ? (
                            <Check className="w-5 h-5 text-success/60 mx-auto" />
                          ) : (
                            <X className="w-5 h-5 text-text-muted/40 mx-auto" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── Open Source Banner ─── */}
      <section aria-label="Open source" className="py-20 md:py-28 border-t border-border">
        <div className="mx-auto max-w-4xl px-6">
          <FadeIn>
            <div className="relative rounded-3xl border border-border bg-surface/60 backdrop-blur-sm p-10 md:p-16 text-center overflow-hidden">
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-[-50%] left-[20%] w-[400px] h-[400px] rounded-full bg-accent/5 blur-[100px]" />
              </div>

              <div className="relative">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-surface-elevated border border-border mb-6">
                  <Heart className="w-8 h-8 text-accent" />
                </div>
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                  Open Source &amp; Free Forever
                </h2>
                <p className="text-text-secondary text-lg max-w-lg mx-auto mb-8">
                  PulseDock is MIT licensed. Run it on your own infrastructure,
                  modify it, contribute — it&apos;s yours.
                </p>
                <a
                  href="https://github.com/No749ah/PulseDock"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-surface-elevated hover:bg-surface-hover border border-border hover:border-border-hover text-text-primary font-semibold px-6 py-3 rounded-xl transition-all text-base"
                >
                  <Github className="w-5 h-5" />
                  View on GitHub
                  <ExternalLink className="w-4 h-4 text-text-muted" />
                </a>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── Social Proof ─── */}
      <section aria-label="Social proof" className="py-24 md:py-32 border-t border-border">
        <div className="mx-auto max-w-5xl px-6">
          <FadeIn>
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                Why Developers Trust PulseDock
              </h2>
              <p className="text-text-secondary text-lg max-w-xl mx-auto">
                Open, transparent, and built for the community — no surprises.
              </p>
            </div>
          </FadeIn>
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <FadeIn delay={0.1}>
              <div className="rounded-2xl border border-border bg-surface/40 p-6 flex flex-col gap-4">
                <Shield className="w-8 h-8 text-accent" />
                <h3 className="font-semibold text-text-primary text-lg">Open Source &amp; Private</h3>
                <p className="text-text-secondary text-sm leading-relaxed">
                  MIT licensed. No telemetry, no phone home, no vendor lock-in. Your data stays yours.
                </p>
              </div>
            </FadeIn>
            <FadeIn delay={0.2}>
              <div className="rounded-2xl border border-border bg-surface/40 p-6 flex flex-col gap-4">
                <Users className="w-8 h-8 text-accent" />
                <h3 className="font-semibold text-text-primary text-lg">Community-Driven</h3>
                <p className="text-text-secondary text-sm leading-relaxed">
                  Backed by an active GitHub community. Open issues, discussions, and PRs welcome.
                </p>
              </div>
            </FadeIn>
            <FadeIn delay={0.3}>
              <div className="rounded-2xl border border-border bg-surface/40 p-6 flex flex-col gap-4">
                <Server className="w-8 h-8 text-accent" />
                <h3 className="font-semibold text-text-primary text-lg">Built for Self-Hosters</h3>
                <p className="text-text-secondary text-sm leading-relaxed">
                  Docker, Kubernetes, bare metal — runs anywhere. Documented and production-ready.
                </p>
              </div>
            </FadeIn>
          </div>
          <FadeIn delay={0.4}>
            <div className="text-center">
              <a
                href="https://github.com/No749ah/PulseDock"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-surface-elevated hover:bg-surface-hover border border-border hover:border-border-hover text-text-primary font-semibold px-6 py-3 rounded-xl transition-all text-base"
              >
                <Github className="w-5 h-5" />
                Star us on GitHub
                <ExternalLink className="w-4 h-4 text-text-muted" />
              </a>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── Pricing ─── */}
      <section id="pricing" aria-label="Pricing" className="py-24 md:py-32 border-t border-border">
        <div className="mx-auto max-w-4xl px-6">
          <FadeIn>
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
                Simple,{" "}
                <GradientText from="#3fb950" to="#58a6ff">
                  Transparent Pricing
                </GradientText>
              </h2>
              <p className="text-text-secondary text-lg max-w-xl mx-auto">
                No surprises. No hidden fees. No vendor lock-in.
              </p>
            </div>
          </FadeIn>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Self-Hosted Card */}
            <FadeIn delay={0.1}>
              <div className="relative rounded-2xl border-2 border-accent/50 bg-surface/60 p-8 flex flex-col h-full overflow-hidden">
                {/* Subtle glow */}
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />

                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-text-primary">Self-Hosted</h3>
                    <div className="mt-3">
                      <span className="text-4xl font-bold text-text-primary">Free</span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold bg-accent/20 text-accent border border-accent/30 rounded-full px-3 py-1 shrink-0">
                    Free Forever
                  </span>
                </div>

                <ul className="space-y-3 flex-1 mb-8">
                  {selfHostedFeatures.map((f) => (
                    <li key={f} className="flex items-center gap-3 text-sm text-text-secondary">
                      <Check className="w-4 h-4 text-success shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                <a
                  href="https://github.com/No749ah/PulseDock"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full text-center bg-accent hover:bg-accent-hover text-bg font-semibold py-3 rounded-xl transition-all hover:shadow-[0_0_30px_rgba(88,166,255,0.25)] text-sm"
                >
                  Deploy Now →
                </a>
              </div>
            </FadeIn>

            {/* Cloud Card */}
            <FadeIn delay={0.2}>
              <div className="relative rounded-2xl border border-border bg-surface/40 p-8 flex flex-col h-full opacity-80">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-text-primary">Cloud</h3>
                    <div className="mt-3">
                      <span className="text-2xl font-bold text-text-muted">TBD</span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold bg-surface-elevated text-text-muted border border-border rounded-full px-3 py-1 shrink-0">
                    Coming Soon
                  </span>
                </div>

                <ul className="space-y-3 flex-1 mb-8">
                  {cloudFeatures.map((f) => (
                    <li key={f} className="flex items-center gap-3 text-sm text-text-muted">
                      <Check className="w-4 h-4 text-text-muted/60 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  disabled
                  className="w-full text-center bg-surface-elevated border border-border text-text-muted font-semibold py-3 rounded-xl text-sm cursor-not-allowed"
                >
                  Join Waitlist
                </button>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section aria-label="CTA" className="py-24 md:py-32 border-t border-border">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <FadeIn>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
              Ready to get started?
            </h2>
            <p className="text-text-secondary text-lg mb-10 max-w-xl mx-auto">
              Deploy PulseDock in minutes. Monitor your entire stack. Never miss
              an update again.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-bg font-semibold px-10 py-4 rounded-xl transition-all hover:shadow-[0_0_40px_rgba(88,166,255,0.3)] text-lg"
            >
              Get Started Free <ArrowRight className="w-5 h-5" />
            </Link>
          </FadeIn>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-border py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <Monitor className="w-5 h-5 text-accent" />
                <span className="font-bold text-lg tracking-tight">PulseDock</span>
              </div>
              <p className="text-sm text-text-muted leading-relaxed">
                Version intelligence &amp; uptime monitoring for the modern
                stack. Open source, self-hosted, free.
              </p>
            </div>

            {/* Link columns */}
            {Object.entries(footerLinks).map(([heading, links]) => (
              <div key={heading}>
                <h4 className="text-sm font-semibold mb-4 text-text-secondary uppercase tracking-wider">
                  {heading}
                </h4>
                <ul className="space-y-2.5">
                  {links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-text-muted hover:text-text-primary transition-colors"
                        {...(link.href.startsWith("http")
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Copyright */}
          <div className="pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-text-muted">
              © {new Date().getFullYear()} PulseDock. MIT License.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/No749ah/PulseDock"
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <Github className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
