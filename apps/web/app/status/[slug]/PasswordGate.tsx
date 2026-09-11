'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';

interface PasswordGateProps {
  slug: string;
  title: string;
}

export default function PasswordGate({ slug, title }: PasswordGateProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';
      const res = await fetch(
        `${apiBase}/v1/public/status/${slug}?password=${encodeURIComponent(password)}`,
        { cache: 'no-store' },
      );
      if (res.ok) {
        // Correct password — redirect with password as URL search param
        window.location.href =
          window.location.pathname + '?password=' + encodeURIComponent(password);
      } else {
        const data = await res.json() as { message?: string; error?: string };
        setError(data?.message || data?.error || 'Incorrect password');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/5 border border-white/10 mb-4">
            <Lock className="w-7 h-7 text-white/60" />
          </div>
          <h1 className="text-xl font-semibold text-white mb-1">{title}</h1>
          <p className="text-sm text-white/40">This page is password protected</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter password"
            autoFocus
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 text-sm"
          />
          {error && <p className="text-red-400 text-xs px-1">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-white text-black font-medium rounded-xl py-3 text-sm hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {loading ? 'Checking...' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  );
}
