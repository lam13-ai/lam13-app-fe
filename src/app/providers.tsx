import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ComponentType, type ReactNode } from 'react';
import { ApiProvider, createDefaultAdapter, isApiError, type ApiAdapter } from '@/api';
import { ToastProvider } from '@/components/ui';
import { AuthProvider } from '@/features/auth';
import { CallingDepsProvider, type CallingDeps } from '@/features/calling';
import { SessionBoundary } from './session';

const NO_OVERRIDES: CallingDeps = {};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Client errors (401, 404, 422…) will not fix themselves; retry network/5xx once.
        retry: (failureCount, error) => failureCount < 1 && !(isApiError(error) && !error.retryable),
      },
      mutations: { retry: 0 },
    },
  });
}

export interface ProvidersProps {
  children: ReactNode;
  /** API adapter override (tests). Defaults to the app's adapter. */
  api?: ApiAdapter;
  /** Auth provider override (tests). Defaults to the environment-selected provider. */
  auth?: ComponentType<{ children: ReactNode }>;
  /** Voice-call provider/config override (tests use the mock provider). */
  calling?: CallingDeps;
}

/** App-wide providers: API adapter, server-state cache, auth session, toasts. */
export function Providers({ children, api, auth: Auth = AuthProvider, calling }: ProvidersProps) {
  const [queryClient] = useState(createQueryClient);
  const [adapter] = useState(() => api ?? createDefaultAdapter());
  return (
    <ApiProvider adapter={adapter}>
      <QueryClientProvider client={queryClient}>
        <Auth>
          <SessionBoundary />
          <CallingDepsProvider value={calling ?? NO_OVERRIDES}>
            <ToastProvider>{children}</ToastProvider>
          </CallingDepsProvider>
        </Auth>
      </QueryClientProvider>
    </ApiProvider>
  );
}
