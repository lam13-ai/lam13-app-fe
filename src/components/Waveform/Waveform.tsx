import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

const BAR = 2;
const GAP = 2;
const SAMPLE_MS = 60;
const MIN_LEVEL = 0.08;

interface CommonProps {
  className?: string;
}

interface LiveProps extends CommonProps {
  mode: 'live';
  /** Polled every animation frame — must be cheap and must not trigger React updates. */
  getLevel: () => number;
  /** When false the history freezes (e.g. paused). */
  active: boolean;
}

interface StaticProps extends CommonProps {
  mode: 'static';
  /** 0..1 bar heights. */
  peaks: number[];
  /** 0..1 played fraction (bars before it are drawn at full strength). */
  progress?: number;
}

export type WaveformProps = LiveProps | StaticProps;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Sizes the canvas to its CSS box (device-pixel aware) and returns the drawing context. */
function prepare(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = getComputedStyle(canvas).color;
  return { ctx, width, height, bars: Math.max(1, Math.floor((width + GAP) / (BAR + GAP))) };
}

function drawBars(canvas: HTMLCanvasElement, levels: (bars: number) => number[], progress = 1) {
  const frame = prepare(canvas);
  if (!frame) return;
  const { ctx, height, bars } = frame;
  const values = levels(bars);
  values.forEach((value, i) => {
    const h = Math.max(2, Math.round(Math.max(MIN_LEVEL, Math.min(1, value)) * height));
    ctx.globalAlpha = i / bars < progress ? 1 : 0.3;
    ctx.fillRect(i * (BAR + GAP), Math.round((height - h) / 2), BAR, h);
  });
  ctx.globalAlpha = 1;
}

function resample(peaks: number[], count: number): number[] {
  if (peaks.length === 0) return Array.from({ length: count }, () => MIN_LEVEL);
  return Array.from({ length: count }, (_, i) => peaks[Math.min(peaks.length - 1, Math.floor((i * peaks.length) / count))] ?? 0);
}

/**
 * Lightweight square-bar waveform on a canvas (reference geometry: no rounded caps).
 * Live mode scrolls recent input levels via requestAnimationFrame without React re-renders;
 * with reduced motion it shows a still bar row instead. Decorative — status is conveyed in text.
 */
export function Waveform(props: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const getLevelRef = useRef<() => number>(() => 0);
  // Kept across pause/resume so the waveform does not reset.
  const historyRef = useRef<number[]>([]);
  const { mode, className } = props;
  const active = props.mode === 'live' ? props.active : false;
  const peaks = props.mode === 'static' ? props.peaks : null;
  const progress = props.mode === 'static' ? (props.progress ?? 1) : 1;

  useEffect(() => {
    if (props.mode === 'live') getLevelRef.current = props.getLevel;
  });

  // Static: redraw on data/progress/resize.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (mode !== 'static' || !canvas || !peaks) return;
    const draw = () => drawBars(canvas, (bars) => resample(peaks, bars), progress);
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [mode, peaks, progress]);

  // Live: scrolling level history.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (mode !== 'live' || !canvas) return;
    const history = historyRef.current;
    const drawHistory = () =>
      drawBars(canvas, (bars) => {
        const recent = history.slice(-bars);
        return [...Array.from({ length: bars - recent.length }, () => MIN_LEVEL), ...recent];
      });

    if (!active || prefersReducedMotion()) {
      drawHistory();
      return;
    }

    let frame = 0;
    let last = 0;
    const loop = (time: number) => {
      if (time - last >= SAMPLE_MS) {
        last = time;
        history.push(getLevelRef.current());
        if (history.length > 400) history.splice(0, history.length - 400);
        drawHistory();
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [mode, active]);

  return <canvas ref={canvasRef} aria-hidden="true" className={cn('block h-6 w-full', className)} />;
}
