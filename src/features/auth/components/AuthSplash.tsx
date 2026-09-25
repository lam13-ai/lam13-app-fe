import { Wordmark } from '@/components/AgentMark';
import { Spinner } from '@/components/ui';

/** Neutral full-screen state while the session resolves — never renders protected content. */
export function AuthSplash({ label = 'Loading your workspace…' }: { label?: string }) {
  return (
    <main
      aria-busy="true"
      className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg-subtle px-4 text-center"
    >
      <Wordmark />
      <div role="status" className="flex items-center gap-3 text-xs text-fg-muted">
        <Spinner size={20} state="active" />
        {label}
      </div>
    </main>
  );
}
