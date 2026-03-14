"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { FadeIn } from "./components/FadeIn";
import { GradientText } from "./components/GradientText";
import { LocaleSwitcher } from "./components/LocaleSwitcher";
import { useI18n } from "../components/i18n-provider";
import {
  Activity,
  Bell,
  GitBranch,
  Globe,
  Lock,
  Monitor,
  Package,
  Shield,
  Zap,
} from "lucide-react";

const features = [
  {
    icon: Activity,
    title: "Real-time Monitoring",
    description: "Track version changes across all your apps with live status updates and instant notifications.",
  },
  {
    icon: GitBranch,
    title: "Version Intelligence",
    description: "Automatic changelog summaries and semantic version tracking for every dependency.",
  },
  {
    icon: Bell,
    title: "Smart Alerts",
    description: "Get notified through email, Discord, Slack, or webhooks when critical updates land.",
  },
  {
    icon: Globe,
    title: "Public Status Pages",
    description: "Share beautiful, real-time status pages with your team or stakeholders.",
  },
  {
    icon: Shield,
    title: "Security First",
    description: "Detect vulnerable versions instantly. Never miss a critical security patch.",
  },
  {
    icon: Package,
    title: "Self-Hosted",
    description: "Your data stays yours. Deploy on your infrastructure with Docker in minutes.",
  },
];

const stats = [
  { value: "< 1s", labelKey: "landing.checkLatency" },
  { value: "99.9%", labelKey: "landing.uptimeSla" },
  { value: "∞", labelKey: "landing.monitorCount" },
  { value: "0", labelKey: "landing.lockIn" },
] as const;

export default function LandingPage() {
  const { t } = useI18n();

  return (
    <main className="min-h-screen overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border backdrop-blur-xl bg-bg/70">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-accent" />
            <span className="font-semibold text-lg tracking-tight">PulseDock</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-text-secondary">
            <a href="#features" className="hover:text-text-primary transition-colors">{t("landing.navFeatures")}</a>
            <a href="#how-it-works" className="hover:text-text-primary transition-colors">{t("landing.navHowItWorks")}</a>
            <a href="https://github.com/No749ah/PulseDock" target="_blank" rel="noopener noreferrer" className="hover:text-text-primary transition-colors">{t("common.github")}</a>
          </div>
          <div className="flex items-center gap-3">
            <LocaleSwitcher compact />
            <Link href="/login" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
              {t("landing.signIn")}
            </Link>
            <Link href="/login" className="text-sm bg-accent hover:bg-accent-hover text-bg font-medium px-4 py-2 rounded-lg transition-colors">
              {t("landing.getStarted")}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 md:pt-44 md:pb-32">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-20%] left-[10%] w-[600px] h-[600px] rounded-full bg-accent/5 blur-[120px]" />
          <div className="absolute top-[-10%] right-[10%] w-[500px] h-[500px] rounded-full bg-purple-500/5 blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <FadeIn>
            <div className="inline-flex items-center gap-2 bg-surface border border-border rounded-full px-4 py-1.5 text-sm text-text-secondary mb-8">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              {t("landing.heroBadge")}
            </div>
          </FadeIn>

          <FadeIn delay={0.1}>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
              {t("landing.heroTitleLine1")}
              <br />
              apps <GradientText>{t("landing.heroTitleAccent")}</GradientText>
            </h1>
          </FadeIn>

          <FadeIn delay={0.2}>
            <p className="text-lg md:text-xl text-text-secondary max-w-2xl mx-auto mb-10 leading-relaxed">
              {t("landing.heroDescription")}
            </p>
          </FadeIn>

          <FadeIn delay={0.3}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/login" className="bg-accent hover:bg-accent-hover text-bg font-semibold px-8 py-3.5 rounded-xl transition-all hover:shadow-[0_0_30px_rgba(88,166,255,0.3)] text-base">
                {t("landing.startMonitoring")}
              </Link>
              <a href="https://github.com/No749ah/PulseDock" target="_blank" rel="noopener noreferrer" className="border border-border hover:border-border-hover text-text-secondary hover:text-text-primary px-8 py-3.5 rounded-xl transition-all text-base">
                {t("landing.viewOnGithub")}
              </a>
            </div>
          </FadeIn>

          {/* Dashboard preview */}
          <FadeIn delay={0.5}>
            <div className="mt-16 md:mt-24 relative">
              <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-transparent z-10 pointer-events-none" />
              <div className="rounded-2xl border border-border bg-surface p-1.5 shadow-2xl shadow-black/50">
                <div className="rounded-xl bg-surface-elevated overflow-hidden">
                  {/* Mock dashboard header */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-danger/60" />
                      <div className="w-3 h-3 rounded-full bg-warning/60" />
                      <div className="w-3 h-3 rounded-full bg-success/60" />
                    </div>
                    <div className="flex-1 text-center text-xs text-text-muted">pulsedock.app/dashboard</div>
                  </div>
                  {/* Mock dashboard content */}
                  <div className="p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{t("landing.monitors")}</span>
                      <span className="text-xs text-text-muted">{t("landing.lastChecked")}</span>
                    </div>
                    {[
                      { name: "next@16.1.6", status: "up-to-date", color: "bg-success" },
                      { name: "prisma@7.4.0", status: "update available", color: "bg-warning" },
                      { name: "nestjs@11.1.6", status: "up-to-date", color: "bg-success" },
                      { name: "react@19.2.0", status: "up-to-date", color: "bg-success" },
                    ].map((item) => (
                      <div key={item.name} className="flex items-center justify-between py-2 px-3 rounded-lg bg-bg/50">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${item.color}`} />
                          <span className="text-sm font-mono">{item.name}</span>
                        </div>
                        <span className="text-xs text-text-muted">{item.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 border-y border-border">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, i) => (
              <FadeIn key={stat.labelKey} delay={i * 0.1}>
                <div className="text-center">
                  <div className="text-3xl md:text-4xl font-bold text-text-primary">{stat.value}</div>
                  <div className="text-sm text-text-muted mt-1">{t(stat.labelKey)}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 md:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <FadeIn>
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
                {t("landing.sectionTitleLine1")}
                <br />
                <GradientText from="#3fb950" to="#58a6ff">{t("landing.sectionTitleAccent")}</GradientText>
              </h2>
              <p className="text-text-secondary text-lg max-w-xl mx-auto">
                {t("landing.sectionDescription")}
              </p>
            </div>
          </FadeIn>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((feature, i) => (
              <FadeIn key={feature.title} delay={i * 0.08}>
                <div className="group p-6 rounded-2xl border border-border bg-surface hover:bg-surface-elevated hover:border-border-hover transition-all duration-300">
                  <feature.icon className="w-10 h-10 text-accent mb-4 group-hover:scale-110 transition-transform duration-300" />
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-text-secondary text-sm leading-relaxed">{feature.description}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 md:py-32 border-t border-border">
        <div className="mx-auto max-w-4xl px-6">
          <FadeIn>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-center mb-16">
              {t("landing.stepsTitle")} <GradientText>{t("landing.stepsTitleAccent")}</GradientText>
            </h2>
          </FadeIn>

          <div className="space-y-12">
            {[
              {
                step: "01",
                title: "Deploy",
                description: "Clone the repo, configure your .env, and run docker compose up. That's it.",
                code: "docker compose up -d",
              },
              {
                step: "02",
                title: "Add Monitors",
                description: "Point PulseDock at your apps — HTTP endpoints, Git repos, Docker images. Configure check intervals and alert thresholds.",
                code: 'curl -X POST /api/v1/monitors -d \'{"name": "my-app", "type": "HTTP", "target": "https://my-app.com"}\'',
              },
              {
                step: "03",
                title: "Relax",
                description: "PulseDock watches your stack 24/7. Get notified the moment something changes, breaks, or needs your attention.",
                code: "# You'll get a notification. Go grab a coffee.",
              },
            ].map((item, i) => (
              <FadeIn key={item.step} delay={i * 0.15}>
                <div className="flex gap-8 items-start">
                  <div className="text-5xl font-bold text-text-muted/30 tabular-nums select-none">{item.step}</div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                    <p className="text-text-secondary mb-4">{item.description}</p>
                    <div className="bg-surface-elevated border border-border rounded-xl p-4 font-mono text-sm text-text-secondary overflow-x-auto">
                      <span className="text-text-muted select-none">$ </span>{item.code}
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 md:py-32">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <FadeIn>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">
              {t("landing.ctaTitleLine1")}
              <br />
              <GradientText>{t("landing.ctaTitleAccent")}</GradientText>
            </h2>
            <p className="text-text-secondary text-lg mb-10 max-w-xl mx-auto">
              {t("landing.ctaDescription")}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/login" className="bg-accent hover:bg-accent-hover text-bg font-semibold px-8 py-3.5 rounded-xl transition-all hover:shadow-[0_0_30px_rgba(88,166,255,0.3)] text-base">
                {t("landing.ctaGetStarted")}
              </Link>
              <a href="https://github.com/No749ah/PulseDock" target="_blank" rel="noopener noreferrer" className="border border-border hover:border-border-hover text-text-secondary hover:text-text-primary px-8 py-3.5 rounded-xl transition-all text-base flex items-center gap-2">
                <Zap className="w-4 h-4" /> {t("landing.starOnGithub")}
              </a>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="mx-auto max-w-6xl px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <Monitor className="w-4 h-4" />
            <span>© {new Date().getFullYear()} PulseDock</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-text-muted">
            <a href="https://github.com/No749ah/PulseDock" target="_blank" rel="noopener noreferrer" className="hover:text-text-primary transition-colors">{t("common.github")}</a>
            <Link href="/login" className="hover:text-text-primary transition-colors">{t("common.dashboard")}</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
