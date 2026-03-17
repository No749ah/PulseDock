"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getUser } from "../components/auth";
import Link from "next/link";
import { FadeIn } from "./components/FadeIn";
import { GradientText } from "./components/GradientText";
import { Badge } from "./components/Badge";
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
  X,
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
  { value: "1 300+", label: "Tools Tracked" },
  { value: "20+", label: "Widgets" },
  { value: "6", label: "Alert Channels" },
  { value: "100%", label: "Free" },
];

const features = [
  {
    icon: Activity,
    title: "Version Intelligence",
    description:
      "Automatic version tracking for 1 300+ self-hosted tools. Know instantly when a new release drops.",
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
      "Browse 1 300+ self-hosted tools. Find alternatives, compare features, track new releases.",
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

const steps = [
  {
    number: "01",
    title: "Add Your Services",
    description:
      "Point PulseDock at your apps — HTTP endpoints, Docker containers, Git repos. One click or a single CLI command.",
  },
  {
    number: "02",
    title: "Get Alerts Instantly",
    description:
      "PulseDock monitors 24/7 and notifies you the moment something changes, breaks, or needs attention.",
  },
  {
    number: "03",
    title: "Share Your Status",
    description:
      "Publish beautiful status pages for your team, users, or stakeholders. Always up-to-date, zero effort.",
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
  { label: "Tool Registry (1 300+)", pulsedock: true, uptimeKuma: false, betterStack: false, statuspage: false },
  { label: "Status Pages", pulsedock: true, uptimeKuma: true, betterStack: true, statuspage: true },
  { label: "Incident Management", pulsedock: true, uptimeKuma: true, betterStack: true, statuspage: true },
  { label: "Public API", pulsedock: true, uptimeKuma: true, betterStack: true, statuspage: true },
  { label: "CLI Tool", pulsedock: true, uptimeKuma: false, betterStack: true, statuspage: false },
  { label: "100% Free", pulsedock: true, uptimeKuma: true, betterStack: false, statuspage: false },
];

const footerLinks = {
  Product: [
    { label: "Features", href: "#features" },
    { label: "Status Pages", href: "#demo" },
    { label: "Pricing", href: "#" },
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
   Component
   ──────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const router = useRouter();

  // Redirect logged-in users straight to dashboard
  useEffect(() => {
    const user = getUser();
    if (user?.id) router.replace("/dashboard");
  }, [router]);

  return (
    <main className="min-h-screen overflow-hidden">
      {/* ─── Navigation ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border backdrop-blur-xl bg-bg/60">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-6 h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <Monitor className="w-5 h-5 text-accent group-hover:scale-110 transition-transform" />
            <span className="font-bold text-lg tracking-tight">PulseDock</span>
          </Link>

          {/* Nav Links */}
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

          {/* CTA */}
          <Link
            href="/login"
            className="text-sm bg-accent hover:bg-accent-hover text-bg font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            Sign In
          </Link>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative pt-32 pb-20 md:pt-48 md:pb-32">
        {/* Animated background blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[15%] w-72 h-72 md:w-[500px] md:h-[500px] rounded-full bg-accent/8 blur-[100px] animate-blob" />
          <div className="absolute top-[5%] right-[10%] w-64 h-64 md:w-[450px] md:h-[450px] rounded-full bg-purple-500/8 blur-[100px] animate-blob animation-delay-2000" />
          <div className="absolute bottom-[-5%] left-[40%] w-56 h-56 md:w-[400px] md:h-[400px] rounded-full bg-success/6 blur-[100px] animate-blob animation-delay-4000" />
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
              Monitor 1 300+ self-hosted tools, track versions, build beautiful
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
              <Badge variant="success">
                ✦ Open Source
              </Badge>
              <Badge variant="default">
                ✦ Self-Hosted
              </Badge>
              <Badge variant="success">
                ✦ Free Forever
              </Badge>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── Stats Bar ─── */}
      <section className="py-16 border-y border-border bg-surface/40">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
            {stats.map((stat, i) => (
              <FadeIn key={stat.label} delay={i * 0.08}>
                <div className="text-center">
                  <div className="text-4xl md:text-5xl font-bold text-text-primary tracking-tight">
                    {stat.value}
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
      <section id="features" className="py-24 md:py-32">
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
                  <h3 className="text-base font-semibold mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-text-secondary text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section id="how" className="py-24 md:py-32 border-t border-border">
        <div className="mx-auto max-w-4xl px-6">
          <FadeIn>
            <div className="text-center mb-20">
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
                Up and running in{" "}
                <GradientText from="#3fb950" to="#58a6ff">
                  three steps
                </GradientText>
              </h2>
            </div>
          </FadeIn>

          <div className="relative">
            {/* Connecting line */}
            <div className="hidden md:block absolute left-[39px] top-8 bottom-8 w-px bg-gradient-to-b from-accent/40 via-accent/20 to-transparent" />

            <div className="space-y-16 md:space-y-20">
              {steps.map((step, i) => (
                <FadeIn key={step.number} delay={i * 0.15}>
                  <div className="flex gap-6 md:gap-10 items-start">
                    {/* Number */}
                    <div className="relative shrink-0">
                      <div className="w-20 h-20 rounded-2xl bg-surface border border-border flex items-center justify-center">
                        <span className="text-3xl font-bold text-accent">
                          {step.number}
                        </span>
                      </div>
                    </div>
                    {/* Content */}
                    <div className="pt-2">
                      <h3 className="text-xl md:text-2xl font-semibold mb-3">
                        {step.title}
                      </h3>
                      <p className="text-text-secondary text-base leading-relaxed max-w-lg">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Demo Preview ─── */}
      <section id="demo" className="py-24 md:py-32 border-t border-border">
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
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">System Status</h3>
                    <p className="text-sm text-text-muted mt-0.5">
                      Updated just now
                    </p>
                  </div>
                  <div className="flex items-center gap-2 bg-success/10 border border-success/20 rounded-full px-4 py-1.5">
                    <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                    <span className="text-sm font-medium text-success">
                      All Systems Operational
                    </span>
                  </div>
                </div>

                {/* Services */}
                <div className="space-y-3">
                  {demoServices.map((service) => (
                    <div
                      key={service.name}
                      className="flex items-center justify-between py-3 px-4 rounded-xl bg-bg/50 border border-border"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-success" />
                        <span className="text-sm font-medium">
                          {service.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        {/* Mini uptime bars */}
                        <div className="hidden sm:flex items-end gap-[2px] h-4">
                          {Array.from({ length: 30 }, (_, j) => (
                            <div
                              key={j}
                              className="w-[3px] rounded-full bg-success/60"
                              style={{ height: `${60 + Math.random() * 40}%` }}
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
      <section className="py-24 md:py-32 border-t border-border">
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
              <p className="text-text-secondary text-lg">
                See how we compare to the alternatives.
              </p>
            </div>
          </FadeIn>

          <FadeIn delay={0.1}>
            <div className="rounded-2xl border border-border bg-surface/60 backdrop-blur-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-4 px-6 font-medium text-text-muted">
                        Feature
                      </th>
                      <th className="py-4 px-4 font-semibold text-accent text-center">
                        PulseDock
                      </th>
                      <th className="py-4 px-4 font-medium text-text-secondary text-center">
                        Uptime Kuma
                      </th>
                      <th className="py-4 px-4 font-medium text-text-secondary text-center">
                        Better Stack
                      </th>
                      <th className="py-4 px-4 font-medium text-text-secondary text-center hidden sm:table-cell">
                        Statuspage.io
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonFeatures.map((row) => (
                      <tr
                        key={row.label}
                        className="border-b border-border/50 last:border-0"
                      >
                        <td className="py-3.5 px-6 text-text-primary font-medium">
                          {row.label}
                        </td>
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
      <section className="py-20 md:py-28 border-t border-border">
        <div className="mx-auto max-w-4xl px-6">
          <FadeIn>
            <div className="relative rounded-3xl border border-border bg-surface/60 backdrop-blur-sm p-10 md:p-16 text-center overflow-hidden">
              {/* Subtle glow */}
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

      {/* ─── Final CTA ─── */}
      <section className="py-24 md:py-32 border-t border-border">
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
                <span className="font-bold text-lg tracking-tight">
                  PulseDock
                </span>
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
