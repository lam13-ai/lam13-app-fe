import type { ReactNode } from 'react';
import { Wordmark } from '@/components/AgentMark';

/** Centred auth card on the subtle workspace background — same tokens as the chat card. */
export function AuthLayout({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg-subtle px-4 py-10">
      <div className="w-full max-w-[440px] animate-enter rounded-card border border-hairline-strong bg-bg px-6 py-8 shadow-card sm:px-10 sm:py-10">
        <Wordmark />
        <div className="mt-10">{children}</div>
      </div>
      {footer && <div className="mt-6 text-center text-2xs text-fg-muted">{footer}</div>}
    </main>
  );
}

/** Uppercase monospace label flanked by accent squares (reference §1). */
export function Eyebrow({ children }: { children: ReactNode }) {
  const square = <span aria-hidden="true" className="size-1.5 [background:var(--gradient-accent)]" />;
  return (
    <p className="eyebrow flex items-center gap-2.5">
      {square}
      {children}
      {square}
    </p>
  );
}
