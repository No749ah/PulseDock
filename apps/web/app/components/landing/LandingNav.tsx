"use client";

import { useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Menu, Monitor, X } from "lucide-react";
import { getUser } from "../../../components/auth";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How it Works", href: "#how" },
  { label: "Status Pages", href: "#demo" },
  { label: "Changelog", href: "https://github.com/No749ah/PulseDock/releases" },
];

export function LandingNav() {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  useEffect(() => {
    const user = getUser();
    if (user?.id) router.replace("/dashboard");
  }, [router]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMobileMenu();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [closeMobileMenu]);

  return (
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

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm bg-accent hover:bg-accent-hover active:scale-95 text-bg font-semibold px-5 py-2 rounded-lg transition-all"
          >
            Sign In
          </Link>
          <button
            className="md:hidden p-2.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-bg/95 backdrop-blur-xl px-6 py-4 space-y-1">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={closeMobileMenu}
              className="block py-3 text-base text-text-secondary hover:text-text-primary transition-colors border-b border-border/40 last:border-0"
              {...(link.href.startsWith("http")
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              {link.label}
            </a>
          ))}
        </div>
      )}
    </nav>
  );
}
