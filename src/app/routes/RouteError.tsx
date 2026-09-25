import { ErrorState } from '@/components/ErrorState';
import { RoutePanel } from './RoutePanel';

const COPY = {
  eyebrow: 'Error',
  title: 'Something went wrong.',
  description: 'This view hit an unexpected problem. Reload to continue — your conversations are safe.',
  action: { label: 'Reload', onClick: () => window.location.reload() },
};

/**
 * Router error boundary (`errorElement`). Shows a generic message only — the error itself is never
 * rendered (it may hold internals); React Router reports it to the console in development.
 * `standalone`: outside the workspace shell (the shell itself or an auth screen failed).
 */
export function RouteError({ standalone = false }: { standalone?: boolean }) {
  if (standalone) {
    return (
      <main className="flex h-dvh bg-bg-subtle p-2 lg:p-3">
        <ErrorState {...COPY} level={1} className="flex-1 bg-bg md:rounded-card md:border md:border-hairline-strong" />
      </main>
    );
  }
  return <RoutePanel {...COPY} />;
}
