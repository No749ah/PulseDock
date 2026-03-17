"use client";

import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  value: string; // e.g. "1300+", "100%", "6"
  duration?: number; // ms
}

function parseValue(raw: string): { prefix: string; num: number; suffix: string } {
  const match = raw.match(/^([^0-9]*)([0-9]+)([^0-9]*)$/);
  if (!match) return { prefix: "", num: 0, suffix: raw };
  return { prefix: match[1], num: parseInt(match[2], 10), suffix: match[3] };
}

export function CountUp({ value, duration = 1800 }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState("0");
  const [started, setStarted] = useState(false);
  const { prefix, num, suffix } = parseValue(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;

    const steps = 60;
    const stepDuration = duration / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += 1;
      const progress = current / steps;
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentVal = Math.round(eased * num);
      setDisplay(currentVal.toString());

      if (current >= steps) {
        clearInterval(timer);
        setDisplay(num.toString());
      }
    }, stepDuration);

    return () => clearInterval(timer);
  }, [started, num, duration]);

  return (
    <span ref={ref}>
      {prefix}{display}{suffix}
    </span>
  );
}
