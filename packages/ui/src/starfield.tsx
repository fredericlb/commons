// A starry night behind a page: a full-screen canvas of twinkling stars drifting sideways, with now
// and then a shooting star. The backdrop of every sign-in screen (sign-in-screen.tsx). Still, with
// no motion, for those who ask the system for reduced motion.

import { useEffect, useRef } from "react";
import { cn } from "./lib/utils";

type Star = { x: number; y: number; r: number; speed: number; phase: number };
type Meteor = { x: number; y: number; vx: number; vy: number; life: number };

// One star per this many square pixels of screen.
const DENSITY = 2600;

export function Starfield({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stars: Star[] = [];
    let meteor: Meteor | null = null;
    let width = 0;
    let height = 0;
    let frame = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = Array.from(
        { length: Math.round((width * height) / DENSITY) },
        () => {
          const r = Math.random() ** 3 * 1.6 + 0.3;
          // Bigger stars are nearer, so they drift faster.
          return {
            x: Math.random() * width,
            y: Math.random() * height,
            r,
            speed: r * 6,
            phase: Math.random() * Math.PI * 2,
          };
        },
      );
    };

    const draw = (t: number, dt: number) => {
      const sky = ctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, "#03040c");
      sky.addColorStop(0.6, "#0b1030");
      sky.addColorStop(1, "#1c1b45");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height);

      for (const s of stars) {
        s.x -= s.speed * dt;
        if (s.x < -2) s.x = width + 2;
        const twinkle = 0.55 + 0.45 * Math.sin(t / 700 + s.phase);
        ctx.globalAlpha = still ? 0.8 : twinkle;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (still) return;
      if (!meteor && Math.random() < dt * 0.15)
        meteor = {
          x: Math.random() * width,
          y: Math.random() * height * 0.4,
          vx: -500,
          vy: 220,
          life: 1,
        };
      if (meteor) {
        const m = meteor;
        const tail = ctx.createLinearGradient(
          m.x,
          m.y,
          m.x - m.vx * 0.15,
          m.y - m.vy * 0.15,
        );
        tail.addColorStop(0, `rgba(255,255,255,${m.life})`);
        tail.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = tail;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - m.vx * 0.15, m.y - m.vy * 0.15);
        ctx.stroke();
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.life -= dt * 1.2;
        if (m.life <= 0) meteor = null;
      }
    };

    let last = performance.now();
    function loop(now: number) {
      draw(now, Math.min((now - last) / 1000, 0.1));
      last = now;
      frame = requestAnimationFrame(loop);
    }

    const onResize = () => {
      resize();
      if (still) draw(0, 0);
    };
    onResize();
    window.addEventListener("resize", onResize);
    if (!still) frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={cn(
        "pointer-events-none fixed inset-0 h-full w-full",
        className,
      )}
    />
  );
}
