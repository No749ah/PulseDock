'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type HeroSequenceProps = {
  totalFrames?: number;
  fps?: number;
  path?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function HeroSequence({ totalFrames = 240, fps = 30, path = '/hero-frames' }: HeroSequenceProps) {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cacheRef = useRef<Map<number, HTMLImageElement>>(new Map());
  const [loop, setLoop] = useState(false);
  const [frame, setFrame] = useState(0);
  const [mode, setMode] = useState<'frames' | 'procedural'>('procedural');
  const [progress, setProgress] = useState(0);

  const sources = useMemo(
    () => Array.from({ length: totalFrames }, (_, i) => `${path}/frame_${String(i + 1).padStart(4, '0')}.jpg`),
    [path, totalFrames],
  );

  useEffect(() => {
    const probe = new Image();
    probe.onload = () => setMode('frames');
    probe.onerror = () => setMode('procedural');
    probe.src = sources[0];
  }, [sources]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    let raf = 0;

    const updateByScroll = () => {
      const rect = section.getBoundingClientRect();
      const total = Math.max(1, section.offsetHeight - window.innerHeight);
      const passed = clamp(-rect.top, 0, total);
      const p = passed / total;
      setProgress(p);
      const nextFrame = clamp(Math.floor(p * (totalFrames - 1)), 0, totalFrames - 1);
      setFrame(nextFrame);
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(updateByScroll);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    updateByScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [totalFrames]);

  useEffect(() => {
    if (!loop) return;
    const frameDuration = Math.max(16, Math.floor(1000 / fps));
    const timer = window.setInterval(() => {
      setFrame((prev) => (prev + 1) % totalFrames);
      setProgress((prev) => (prev + 1 / totalFrames) % 1);
    }, frameDuration);
    return () => window.clearInterval(timer);
  }, [fps, loop, totalFrames]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const el = canvas;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const context = ctx;

    function fitCanvas() {
      const ratio = window.devicePixelRatio || 1;
      const width = el.clientWidth;
      const height = el.clientHeight;
      el.width = Math.floor(width * ratio);
      el.height = Math.floor(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function drawProcedural(p: number) {
      const width = el.clientWidth;
      const height = el.clientHeight;
      const grad = context.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#132752');
      grad.addColorStop(1, '#5137b8');
      context.fillStyle = grad;
      context.fillRect(0, 0, width, height);

      const cx = width * 0.5;
      const cy = height * 0.5;
      const radius = Math.min(width, height) * 0.18;

      context.beginPath();
      context.fillStyle = '#f5f8ff';
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.fill();

      context.beginPath();
      context.strokeStyle = `rgba(120,190,255,${0.4 + p * 0.4})`;
      context.lineWidth = 3;
      context.arc(cx, cy, radius + 18 + p * 12, 0, Math.PI * 2);
      context.stroke();

      context.beginPath();
      context.fillStyle = '#0b1229';
      context.arc(cx, cy, radius * 0.24, 0, Math.PI * 2);
      context.fill();
    }

    function drawFrame(index: number) {
      const width = el.clientWidth;
      const height = el.clientHeight;
      context.clearRect(0, 0, width, height);

      const cached = cacheRef.current.get(index);
      if (!cached) {
        const img = new Image();
        img.src = sources[index];
        img.onload = () => {
          cacheRef.current.set(index, img);
          drawFrame(index);
        };
        drawProcedural(progress);
        return;
      }

      const imageRatio = cached.width / cached.height;
      const canvasRatio = width / height;
      let drawWidth = width;
      let drawHeight = height;
      let x = 0;
      let y = 0;
      if (imageRatio > canvasRatio) {
        drawWidth = height * imageRatio;
        x = (width - drawWidth) / 2;
      } else {
        drawHeight = width / imageRatio;
        y = (height - drawHeight) / 2;
      }
      context.drawImage(cached, x, y, drawWidth, drawHeight);
    }

    fitCanvas();
    if (mode === 'frames') drawFrame(frame);
    else drawProcedural(progress);

    const onResize = () => {
      fitCanvas();
      if (mode === 'frames') drawFrame(frame);
      else drawProcedural(progress);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [frame, mode, progress, sources]);

  return (
    <section ref={sectionRef} className="sequence-wrap card">
      <div className="sequence-toolbar">
        <div>
          <div className="kicker">Cinematic Hero Sequence</div>
          <div className="muted">
            {mode === 'frames'
              ? `Scroll-synced frame animation (${totalFrames} frames)`
              : 'Procedural fallback active (drop frames into /public/hero-frames)'}
          </div>
        </div>
        <label className="sequence-toggle">
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
          Infinite loop
        </label>
      </div>
      <div className="sequence-stage">
        <canvas ref={canvasRef} className="sequence-canvas" />
      </div>
    </section>
  );
}
