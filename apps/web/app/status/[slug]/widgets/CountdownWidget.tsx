"use client";

import { useState, useEffect } from "react";

interface CountdownWidgetProps {
  label: string;
  targetAt: string | null;
  initialSecondsRemaining: number;
  hideAfterExpiry: boolean;
}

function formatCountdown(secondsRemaining: number): { days: number; hours: number; minutes: number; seconds: number } {
  const days = Math.floor(secondsRemaining / 86400);
  const hours = Math.floor((secondsRemaining % 86400) / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  const seconds = secondsRemaining % 60;
  return { days, hours, minutes, seconds };
}

export function CountdownWidget({ label, targetAt, initialSecondsRemaining, hideAfterExpiry }: CountdownWidgetProps) {
  const [secondsLeft, setSecondsLeft] = useState(initialSecondsRemaining);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetAt]);

  const expired = secondsLeft === 0;

  if (expired && hideAfterExpiry) return null;

  if (expired) {
    return (
      <div className="rounded-xl border border-border bg-surface/50 p-6 text-center space-y-1">
        <div className="text-sm text-text-secondary">{label}</div>
        <div className="text-lg font-semibold text-text-primary">Event has passed</div>
      </div>
    );
  }

  const { days, hours, minutes, seconds } = formatCountdown(secondsLeft);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-6 text-center space-y-3">
      <div className="text-sm font-medium text-text-secondary">{label}</div>
      <div className="flex items-end justify-center gap-1 font-mono">
        {days > 0 && (
          <>
            <div className="flex flex-col items-center">
              <span className="text-4xl font-bold text-text-primary">{days}</span>
              <span className="text-[10px] text-text-secondary uppercase tracking-wider">days</span>
            </div>
            <span className="mb-4 text-2xl font-bold text-text-secondary/50 mx-1">:</span>
          </>
        )}
        <div className="flex flex-col items-center">
          <span className="text-4xl font-bold text-text-primary">{pad(hours)}</span>
          <span className="text-[10px] text-text-secondary uppercase tracking-wider">hrs</span>
        </div>
        <span className="mb-4 text-2xl font-bold text-text-secondary/50 mx-1">:</span>
        <div className="flex flex-col items-center">
          <span className="text-4xl font-bold text-text-primary">{pad(minutes)}</span>
          <span className="text-[10px] text-text-secondary uppercase tracking-wider">min</span>
        </div>
        <span className="mb-4 text-2xl font-bold text-text-secondary/50 mx-1">:</span>
        <div className="flex flex-col items-center">
          <span className="text-4xl font-bold text-text-primary">{pad(seconds)}</span>
          <span className="text-[10px] text-text-secondary uppercase tracking-wider">sec</span>
        </div>
      </div>
    </div>
  );
}
