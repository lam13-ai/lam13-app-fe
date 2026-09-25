import { cn } from '@/lib/cn';

/** Four-point sparkle glyph used in the agent mark and wordmark. */
export function SparkleGlyph({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className={cn('shrink-0', className)}>
      <path
        d="M12 1.5c.55 5.9 2.6 8 10.5 10.5-7.9 2.5-9.95 4.6-10.5 10.5-.55-5.9-2.6-8-10.5-10.5C9.4 9.5 11.45 7.4 12 1.5z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Square gradient avatar with a white sparkle (reference §3). */
export function AgentMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex shrink-0 items-center justify-center text-white [background:var(--gradient-accent)]', className)}
      style={{ width: size, height: size }}
    >
      <SparkleGlyph size={Math.round(size * 0.47)} />
    </span>
  );
}

/** "✦ Lam13.ai" wordmark from the reference header. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-[17px] font-bold leading-none tracking-tight', className)}>
      <SparkleGlyph size={18} />
      <span>
        Lam13<span className="text-link">.ai</span>
      </span>
    </span>
  );
}
