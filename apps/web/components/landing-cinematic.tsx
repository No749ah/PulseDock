'use client';

import { useEffect, useRef, useState } from 'react';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function LandingCinematic() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onLoaded = () => setHasVideo(true);
    const onError = () => setHasVideo(false);

    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('error', onError);

    return () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
    };
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    let progress = 0;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const drawFallback = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.floor(w * ratio);
      canvas.height = Math.floor(h * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#1b2d59');
      grad.addColorStop(1, '#6e4dff');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const cx = w * 0.5;
      const cy = h * 0.5;
      const r = Math.min(w, h) * 0.17;

      ctx.beginPath();
      ctx.fillStyle = '#f2f7ff';
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.strokeStyle = `rgba(116,200,255,${0.45 + progress * 0.4})`;
      ctx.lineWidth = 3;
      ctx.arc(cx, cy, r + 22, 0, Math.PI * 2);
      ctx.stroke();
    };

    const sync = () => {
      if (reducedMotion) {
        progress = 0.5;
      } else {
        const rect = wrap.getBoundingClientRect();
        const total = Math.max(1, wrap.offsetHeight - window.innerHeight);
        const passed = clamp(-rect.top, 0, total);
        progress = passed / total;
      }

      const video = videoRef.current;
      if (video && hasVideo && Number.isFinite(video.duration) && video.duration > 0) {
        const t = progress * video.duration;
        if (Math.abs(video.currentTime - t) > 0.02) {
          video.currentTime = t;
        }
      } else {
        drawFallback();
      }
    };

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sync);
    };

    sync();
    if (!reducedMotion) {
      window.addEventListener('scroll', onScroll, { passive: true });
    }
    window.addEventListener('resize', sync);

    return () => {
      if (!reducedMotion) {
        window.removeEventListener('scroll', onScroll);
      }
      window.removeEventListener('resize', sync);
      cancelAnimationFrame(raf);
    };
  }, [hasVideo]);

  return (
    <div ref={wrapRef} className="landing-cinematic-wrap">
      <div className="landing-cinematic-sticky">
        <video
          ref={videoRef}
          className="landing-cinematic-video"
          src="/hero-video/hero.mp4"
          muted
          playsInline
          preload="metadata"
          style={{ display: hasVideo ? 'block' : 'none' }}
        />
        <canvas ref={canvasRef} className="landing-cinematic-canvas" style={{ display: hasVideo ? 'none' : 'block' }} />
      </div>
    </div>
  );
}
