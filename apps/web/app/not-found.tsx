"use client";
import Link from "next/link";
import { Monitor, ArrowLeft, Home } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[15%] w-[400px] h-[400px] rounded-full bg-accent/6 blur-[100px] motion-safe:animate-blob" />
        <div className="absolute bottom-[10%] right-[15%] w-[350px] h-[350px] rounded-full bg-purple-500/6 blur-[100px] motion-safe:animate-blob animation-delay-2000" />
      </div>
      <div className="relative text-center px-6 max-w-lg">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Monitor className="w-6 h-6 text-accent" />
          <span className="font-bold text-lg tracking-tight">PulseDock</span>
        </div>
        <h1 className="text-8xl font-bold tracking-tighter text-accent mb-4">404</h1>
        <h2 className="text-2xl font-semibold mb-3">Page Not Found</h2>
        <p className="text-text-muted mb-8">The page you&apos;re looking for doesn&apos;t exist or has been moved.</p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/dashboard" className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-bg font-semibold px-6 py-3 rounded-xl transition-colors">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 bg-surface hover:bg-surface-elevated border border-border text-text-primary font-semibold px-6 py-3 rounded-xl transition-colors">
            <Home className="w-4 h-4" /> Home
          </Link>
        </div>
      </div>
    </main>
  );
}
