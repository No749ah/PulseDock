'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

const GUARD_LINES = [
  "🛡️ HALT! Who goes there?",
  "🔐 Access denied. Obviously.",
  "🚨 Intruder detected. Just kidding. Kinda.",
  "🤖 BEEP BOOP. Not today, friend.",
  "👮 Security guard has entered the chat.",
];

const EXCUSES = [
  '"I was just looking around" — You, probably',
  '"The link made me do it" — Also you',
  '"I thought I had access" — Everyone',
  '"This is clearly a mistake" — It is not',
  '"Can I speak to your manager?" — No',
  '"I clicked the wrong button" — Sure you did',
  '"I\'m a developer, I need this" — Use your own account',
];

const COUNTDOWN_MESSAGES = [
  "Initiating ejection sequence...",
  "Packing your bags...",
  "Escorting you out...",
  "Almost there...",
  "Goodbye!",
];

export default function UnauthorizedPage() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(8);
  const [guardLine, setGuardLine] = useState(0);
  const [excuse, setExcuse] = useState(0);
  const [shakeCount, setShakeCount] = useState(0);
  const [badgeFlash, setBadgeFlash] = useState(false);
  const [secretFound, setSecretFound] = useState(false);
  const [clickPos, setClickPos] = useState<{ x: number; y: number } | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const badgeRef = useRef<HTMLDivElement>(null);

  // Countdown
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(countdownRef.current!);
          router.push('/dashboard');
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(countdownRef.current!);
  }, [router]);

  // Cycle guard lines
  useEffect(() => {
    const t = setInterval(() => {
      setGuardLine((i) => (i + 1) % GUARD_LINES.length);
    }, 2000);
    return () => clearInterval(t);
  }, []);

  // Cycle excuses
  useEffect(() => {
    const t = setInterval(() => {
      setExcuse((i) => (i + 1) % EXCUSES.length);
    }, 1500);
    return () => clearInterval(t);
  }, []);

  // Badge flash on load
  useEffect(() => {
    const t = setTimeout(() => setBadgeFlash(true), 300);
    const t2 = setTimeout(() => setBadgeFlash(false), 1000);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, []);

  // Click anywhere for ripple
  const handleClick = (e: React.MouseEvent) => {
    setClickPos({ x: e.clientX, y: e.clientY });
    setTimeout(() => setClickPos(null), 800);
  };

  // Secret: click the lock 10 times
  const handleLockClick = () => {
    setShakeCount((c) => {
      if (c + 1 >= 10) {
        setSecretFound(true);
        return 0;
      }
      return c + 1;
    });
  };

  const countdownMsg = COUNTDOWN_MESSAGES[Math.min(Math.floor((8 - countdown) / 2), COUNTDOWN_MESSAGES.length - 1)];

  return (
    <div
      className="relative min-h-screen bg-bg flex items-center justify-center p-4 overflow-hidden"
      onClick={handleClick}
    >
      {/* Scanline overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)',
        }}
      />

      {/* Red alert corner lights */}
      <div className="absolute top-4 left-4 w-3 h-3 rounded-full bg-danger animate-ping" />
      <div className="absolute top-4 right-4 w-3 h-3 rounded-full bg-danger animate-ping" style={{ animationDelay: '0.5s' }} />
      <div className="absolute bottom-4 left-4 w-3 h-3 rounded-full bg-danger animate-ping" style={{ animationDelay: '1s' }} />
      <div className="absolute bottom-4 right-4 w-3 h-3 rounded-full bg-danger animate-ping" style={{ animationDelay: '1.5s' }} />

      {/* Click ripple */}
      {clickPos && (
        <div
          className="fixed w-4 h-4 rounded-full border-2 border-danger animate-ping pointer-events-none"
          style={{ left: clickPos.x - 8, top: clickPos.y - 8, zIndex: 100 }}
        />
      )}

      {/* Secret found overlay */}
      {secretFound && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="text-center space-y-4 p-8 rounded-2xl border border-accent bg-surface max-w-sm mx-4">
            <div className="text-6xl">🔓</div>
            <h2 className="text-2xl font-bold text-accent">Secret Found!</h2>
            <p className="text-text-secondary">You clicked the lock 10 times. The door is still locked. But we respect the commitment.</p>
            <p className="text-xs text-text-secondary/50 font-mono">ACHIEVEMENT: "Persistent Little Gremlin" unlocked</p>
            <button
              onClick={() => setSecretFound(false)}
              className="px-6 py-2 bg-accent text-white rounded-lg font-semibold"
            >
              Okay 🫡
            </button>
          </div>
        </div>
      )}

      <div className="relative z-10 text-center max-w-lg w-full space-y-8">

        {/* Animated badge */}
        <div
          ref={badgeRef}
          className="flex justify-center"
          onClick={(e) => { e.stopPropagation(); handleLockClick(); }}
        >
          <div
            className={`relative w-32 h-32 rounded-full flex items-center justify-center cursor-pointer select-none transition-all duration-200 ${
              badgeFlash ? 'scale-125' : 'scale-100'
            } ${shakeCount > 0 ? 'animate-bounce' : ''}`}
            style={{
              background: 'radial-gradient(circle at 40% 35%, rgba(239,68,68,0.3), rgba(239,68,68,0.05))',
              border: '2px solid rgba(239,68,68,0.4)',
              boxShadow: `0 0 ${30 + shakeCount * 5}px rgba(239,68,68,${0.2 + shakeCount * 0.05})`,
            }}
            title="Click me... if you dare"
          >
            <span className="text-6xl" style={{ filter: 'drop-shadow(0 0 8px rgba(239,68,68,0.8))' }}>
              {shakeCount >= 8 ? '🔓' : shakeCount >= 5 ? '🔑' : '🔒'}
            </span>
            {shakeCount > 0 && shakeCount < 10 && (
              <span className="absolute -top-2 -right-2 bg-danger text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                {shakeCount}
              </span>
            )}
          </div>
        </div>

        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl sm:text-5xl font-black text-danger" style={{ textShadow: '0 0 40px rgba(239,68,68,0.4)' }}>
            403
          </h1>
          <div className="h-8 overflow-hidden">
            <p
              className="text-lg font-semibold text-text-primary transition-all duration-300"
              key={guardLine}
            >
              {GUARD_LINES[guardLine]}
            </p>
          </div>
        </div>

        {/* Rotating excuses */}
        <div className="bg-surface border border-border rounded-xl px-6 py-4 font-mono text-sm text-text-secondary min-h-[3rem] flex items-center justify-center">
          <span key={excuse} className="transition-all duration-300 italic">
            {EXCUSES[excuse]}
          </span>
        </div>

        {/* Countdown message */}
        <div className="space-y-2">
          <p className="text-text-secondary/60 text-xs font-mono uppercase tracking-widest">{countdownMsg}</p>
          <div className="flex items-center justify-center gap-3">
            <div className="flex gap-1">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-6 rounded-full transition-all duration-1000 ${i < (8 - countdown) ? 'bg-danger' : 'bg-surface-elevated'}`}
                />
              ))}
            </div>
            <span className="font-mono font-bold text-danger text-sm">{countdown}s</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={(e) => { e.stopPropagation(); clearInterval(countdownRef.current!); router.push('/dashboard'); }}
            className="px-6 py-3 bg-accent hover:bg-accent/90 text-white rounded-xl font-semibold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-accent/30"
          >
            Fine, take me to dashboard 🏠
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); router.back(); }}
            className="px-6 py-3 border border-border hover:border-accent text-text-secondary hover:text-accent rounded-xl font-semibold transition-all hover:scale-105 active:scale-95"
          >
            ← Retreat
          </button>
        </div>

        {/* Footer */}
        <p className="text-xs text-text-secondary/30">
          {shakeCount > 0
            ? `${10 - shakeCount} more clicks to unlock the secret...`
            : 'Pro tip: click the lock. Nothing will happen. Probably.'}
        </p>
      </div>
    </div>
  );
}
