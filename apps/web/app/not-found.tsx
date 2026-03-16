'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

const GLITCHY_MESSAGES = [
  "The page you're looking for doesn't exist.",
  "Th3 p4g3 y0u'r3 l00k1ng f0r d03sn't 3x1st.",
  "The page you're looking for doesn't exist.",
  "Th3 pag3 y0u'r3 look1ng f0r d0esn't 3x1st.",
  "The page you're looking for doesn't exist.",
];

const EASTER_EGG_SEQUENCE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

const KONAMI_MESSAGES = [
  '🎮 +30 LIVES ADDED',
  '🚀 CHEAT CODE ACTIVATED',
  '🏆 ACHIEVEMENT UNLOCKED: "Lost & Found"',
  '🎯 BONUS: You still can\'t find the page tho',
];

const PARTICLES = ['💫', '⭐', '🌟', '✨', '💥', '🎆', '🎇'];

export default function NotFound() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(10);
  const [glitchIdx, setGlitchIdx] = useState(0);
  const [konamiProgress, setKonamiProgress] = useState(0);
  const [konamiActivated, setKonamiActivated] = useState(false);
  const [konamiMsg, setKonamiMsg] = useState('');
  const [particles, setParticles] = useState<{ id: number; emoji: string; x: number; y: number }[]>([]);
  const [clickCount, setClickCount] = useState(0);
  const [eyePos, setEyePos] = useState({ x: 0, y: 0 });
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const particleId = useRef(0);

  // Countdown redirect
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

  // Glitch text effect
  useEffect(() => {
    const t = setInterval(() => {
      setGlitchIdx((i) => (i + 1) % GLITCHY_MESSAGES.length);
    }, 150);
    return () => clearInterval(t);
  }, []);

  // Konami code listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      setKonamiProgress((prev) => {
        if (e.key === EASTER_EGG_SEQUENCE[prev]) {
          const next = prev + 1;
          if (next === EASTER_EGG_SEQUENCE.length) {
            setKonamiActivated(true);
            setKonamiMsg(KONAMI_MESSAGES[Math.floor(Math.random() * KONAMI_MESSAGES.length)]);
            // Spawn particles
            const newParticles = Array.from({ length: 20 }, (_, i) => ({
              id: particleId.current++,
              emoji: PARTICLES[Math.floor(Math.random() * PARTICLES.length)],
              x: Math.random() * 100,
              y: Math.random() * 100,
            }));
            setParticles(newParticles);
            setTimeout(() => { setKonamiActivated(false); setParticles([]); }, 3000);
            return 0;
          }
          return next;
        }
        return 0;
      });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Eye tracking
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      setEyePos({ x: (e.clientX / window.innerWidth) * 100, y: (e.clientY / window.innerHeight) * 100 });
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  // Click the 404 for silly messages
  const sillySayings = [
    "Still 404. Surprise!",
    "Maybe try clicking somewhere else?",
    "This is definitely working.",
    "Have you tried turning it off and on again?",
    "Error 404: Effort not found.",
    "The 404 clicked back. Scared?",
    "OK you can stop now.",
    "Seriously.",
    "...",
    "Fine. I respect the dedication.",
    "🏆 You win. (There's no prize.)",
  ];

  return (
    <div className="relative min-h-screen bg-bg flex items-center justify-center p-4 overflow-hidden">
      {/* Animated grid background */}
      <div className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: 'linear-gradient(rgba(99,102,241,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.5) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Konami particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute text-2xl animate-bounce pointer-events-none"
          style={{ left: `${p.x}%`, top: `${p.y}%`, animationDelay: `${Math.random() * 0.5}s` }}
        >
          {p.emoji}
        </div>
      ))}

      {/* Konami banner */}
      {konamiActivated && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 bg-accent text-bg px-8 py-4 rounded-2xl font-black text-xl shadow-2xl animate-bounce">
          {konamiMsg}
        </div>
      )}

      <div className="relative z-10 text-center max-w-lg w-full space-y-8">

        {/* Googly eyes 404 */}
        <div
          className="cursor-pointer select-none"
          onClick={() => setClickCount((c) => c + 1)}
        >
          <div className="relative inline-block">
            <span
              className="text-[8rem] sm:text-[10rem] font-black text-text-primary leading-none tracking-tighter"
              style={{
                textShadow: konamiActivated
                  ? '0 0 40px rgba(99,102,241,1), 0 0 80px rgba(99,102,241,0.5)'
                  : '0 0 60px rgba(99,102,241,0.3)',
                transition: 'text-shadow 0.3s',
              }}
            >
              4
            </span>

            {/* Googly eye for the 0 */}
            <span className="inline-flex items-center justify-center w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-white border-4 border-text-primary mx-1 align-middle relative overflow-hidden">
              <span
                className="w-10 h-10 sm:w-14 sm:h-14 bg-gray-900 rounded-full absolute transition-all duration-75"
                style={{
                  left: `calc(50% + ${(eyePos.x - 50) * 0.15}px - 1.75rem)`,
                  top: `calc(50% + ${(eyePos.y - 50) * 0.15}px - 1.75rem)`,
                }}
              >
                <span className="w-3 h-3 bg-white rounded-full absolute top-1 right-1" />
              </span>
            </span>

            <span
              className="text-[8rem] sm:text-[10rem] font-black text-text-primary leading-none tracking-tighter"
              style={{ textShadow: '0 0 60px rgba(99,102,241,0.3)' }}
            >
              4
            </span>
          </div>

          {/* Click easter egg */}
          {clickCount > 0 && clickCount < sillySayings.length && (
            <p className="text-xs text-accent mt-2 animate-pulse">
              {sillySayings[Math.min(clickCount, sillySayings.length - 1)]}
            </p>
          )}
        </div>

        {/* Glitchy description */}
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-text-primary">
            {GLITCHY_MESSAGES[glitchIdx]}
          </h1>
          <p className="text-text-secondary text-sm">
            Monitor everything. Except apparently this URL.
          </p>
        </div>

        {/* Konami hint */}
        <p className="text-xs text-text-secondary/40 font-mono">
          {'↑ ↑ ↓ ↓ ← → ← → B A'
            .split(' ')
            .map((k, i) => (
              <span key={i} className={i < konamiProgress ? 'text-accent' : ''}>{k} </span>
            ))}
        </p>

        {/* Countdown */}
        <div className="space-y-4">
          <p className="text-text-secondary text-sm">
            Rerouting in{' '}
            <span className="font-mono font-bold text-accent text-lg">{countdown}s</span>
            {' '}— or you can do it yourself:
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => { clearInterval(countdownRef.current!); router.push('/dashboard'); }}
              className="px-6 py-3 bg-accent hover:bg-accent/90 text-white rounded-xl font-semibold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-accent/30"
            >
              Take me home 🏠
            </button>
            <button
              onClick={() => router.back()}
              className="px-6 py-3 border border-border hover:border-accent text-text-secondary hover:text-accent rounded-xl font-semibold transition-all hover:scale-105 active:scale-95"
            >
              ← Go back
            </button>
          </div>
        </div>

        {/* Footer joke */}
        <p className="text-xs text-text-secondary/30">
          PulseDock monitors uptime. Ironically, this page doesn't exist. 🤷
        </p>
      </div>
    </div>
  );
}
