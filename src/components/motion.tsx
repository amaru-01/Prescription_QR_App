"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";

/** Fades/slides children in when they scroll into view. */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          node.classList.add("is-visible");
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${className}`} style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}>
      {children}
    </div>
  );
}

/** Animates a number from 0 up to `value` once visible. */
export function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let frame = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        setDisplay(Math.round(value * (1 - Math.pow(1 - t, 3))));
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, duration]);
  return (
    <span ref={ref} aria-label={String(value)}>
      {display}
    </span>
  );
}

/** Subtle 3D tilt that follows the pointer (disabled for touch). */
export function Tilt({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onMove = (event: MouseEvent<HTMLDivElement>) => {
    const node = ref.current;
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = node.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    node.style.transform = `perspective(900px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg) translateY(-2px)`;
  };
  const reset = () => {
    if (ref.current) ref.current.style.transform = "";
  };
  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={reset} className={`tilt ${className}`}>
      {children}
    </div>
  );
}

/** Global ripple feedback on every `.btn` press. */
export function RippleEffect() {
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(".btn");
      if (!target || target.hasAttribute("disabled")) return;
      const rect = target.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const dot = document.createElement("span");
      dot.className = "ripple-dot";
      dot.style.width = dot.style.height = `${size}px`;
      dot.style.left = `${event.clientX - rect.left - size / 2}px`;
      dot.style.top = `${event.clientY - rect.top - size / 2}px`;
      target.appendChild(dot);
      window.setTimeout(() => dot.remove(), 650);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);
  return null;
}

const CONFETTI_COLORS = ["#0e7c66", "#52d3b0", "#e9834b", "#f5ae7f", "#dff3ea", "#0a5d4d"];

/** Lightweight CSS confetti burst for celebratory moments. */
export function Confetti({ count = 60 }: { count?: number }) {
  const [pieces] = useState(() =>
    Array.from({ length: count }, (_, index) => ({
      id: index,
      left: Math.random() * 100,
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      style: {
        "--drift": `${(Math.random() - 0.5) * 220}px`,
        "--spin": `${(Math.random() - 0.5) * 1080}deg`,
        "--dur": `${1.8 + Math.random() * 1.6}s`,
        "--delay": `${Math.random() * 0.35}s`,
      } as CSSProperties,
    })),
  );
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 4000);
    return () => window.clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div aria-hidden>
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="confetti-piece"
          style={{ ...piece.style, left: `${piece.left}vw`, background: piece.color }}
        />
      ))}
    </div>
  );
}
