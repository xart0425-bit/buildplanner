import { useEffect, useRef } from "react";

/**
 * Canvas "digital rain" that streams behind the hero headline.
 *
 * Motion is time-based rather than frame-locked: every column falls at its own speed and
 * the trail is *erased* each frame (`destination-out`) instead of being painted over with
 * the page colour, so the canvas stays transparent and the glow behind it shows through.
 * Leading glyphs are drawn with a shadow so the stream itself gives off light.
 *
 * The animation runs regardless of `prefers-reduced-motion` — it is the requested visual
 * identity of the hero — but it slows down and dims when that preference is set.
 */

const GLYPHS =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンｱｲｳｴｵ0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ<>/\\{}[]()=+-*&^%$#@!?;:";

const FONT_SIZE = 16;
/** Rows per second — each column picks a speed in this range. */
const MIN_SPEED = 4;
const MAX_SPEED = 13;
/** How long a glyph stays visible, in ms; drives the per-frame erase strength. */
const TRAIL_MS = 900;

const randomGlyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
const randomSpeed = () => MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);

interface Column {
  /** Fractional row index of the leading glyph; grows over time. */
  row: number;
  speed: number;
}

export function MatrixRain({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const speedScale = calm ? 0.45 : 1;
    const headAlpha = calm ? 0.55 : 0.9;

    let columns: Column[] = [];
    let width = 0;
    let height = 0;
    let rows = 0;

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.floor(rect.width));
      const nextHeight = Math.max(1, Math.floor(rect.height));
      if (nextWidth === width && nextHeight === height) return;

      width = nextWidth;
      height = nextHeight;
      rows = Math.ceil(height / FONT_SIZE);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.textBaseline = "top";

      const count = Math.ceil(width / FONT_SIZE);
      columns = Array.from({ length: count }, (_, i) => ({
        // Stagger the start so the field is already full of rain on the first frame.
        row: columns[i]?.row ?? -Math.random() * rows * 1.5,
        speed: columns[i]?.speed ?? randomSpeed(),
      }));
      ctx.clearRect(0, 0, width, height);
    };

    const drawFrame = (dtMs: number) => {
      // Fade the whole canvas by erasing a little alpha — this is what leaves the tail.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.3, dtMs / TRAIL_MS)})`;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";

      ctx.font = `500 ${FONT_SIZE}px "JetBrains Mono", ui-monospace, monospace`;
      const dt = (dtMs / 1000) * speedScale;

      for (let i = 0; i < columns.length; i++) {
        const column = columns[i];
        const previousRow = Math.floor(column.row);
        column.row += column.speed * dt;
        const currentRow = Math.floor(column.row);

        // Draw every row the head crossed this frame so fast columns stay continuous.
        for (let row = previousRow + 1; row <= currentRow; row++) {
          if (row < 0 || row > rows) continue;
          const x = i * FONT_SIZE;
          const y = row * FONT_SIZE;

          // The head glows...
          ctx.shadowColor = "rgba(150, 190, 255, 0.9)";
          ctx.shadowBlur = 10;
          ctx.fillStyle = `rgba(214, 228, 255, ${headAlpha})`;
          ctx.fillText(randomGlyph(), x, y);

          // ...the glyph just behind it is already dimming into the tail.
          ctx.shadowBlur = 0;
          ctx.fillStyle = "rgba(126, 145, 190, 0.45)";
          if (row - 1 >= 0) ctx.fillText(randomGlyph(), x, y - FONT_SIZE);
        }
        ctx.shadowBlur = 0;

        // Once the head has fallen past the bottom, restart it above the top.
        if (column.row > rows + 6) {
          column.row = -Math.random() * 20;
          column.speed = randomSpeed();
        }
      }
    };

    resize();

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      // Clamp dt so a backgrounded tab does not fast-forward the whole field on return.
      const dt = Math.min(now - last, 120);
      last = now;
      if (width > 0 && height > 0) drawFrame(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const observer = new ResizeObserver(resize);
    observer.observe(parent);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{
        maskImage:
          "radial-gradient(ellipse 62% 58% at 50% 50%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 45%, transparent 78%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 62% 58% at 50% 50%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 45%, transparent 78%)",
      }}
    />
  );
}

export default MatrixRain;
