import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { createMockAdapter, INSTANT_TIMING, type ApiAdapter, type MockAdapterOptions, type MockTiming } from '@/api';
import { MemoryAuthProvider, type MemoryAuthProviderProps } from '@/features/auth';
import { createMockCallFactory, type CallingDeps } from '@/features/calling';
import { Providers } from './providers';
import { routes } from './router';

export const TEST_USER = { id: 'user-1', name: 'Ada Lovelace', email: 'ada@example.com', avatarUrl: null };

interface RenderAppOptions {
  timing?: MockTiming;
  /** Extra mock-backend options (e.g. failure injection). */
  mock?: Omit<MockAdapterOptions, 'timing'>;
  /** A different adapter altogether (e.g. the HTTP adapter over a fake fetch). */
  api?: ApiAdapter;
  /** Auth session for the test (default: signed in as TEST_USER). */
  auth?: Omit<MemoryAuthProviderProps, 'children'>;
  /** Voice-call mock factory (default: a fresh mock; tests never reach Vapi). */
  calls?: ReturnType<typeof createMockCallFactory>;
  /** Calling config override (default: fake public config). */
  callingEnv?: CallingDeps['env'];
}

export const TEST_CALLING_ENV: NonNullable<CallingDeps['env']> = {
  vapi: { publicKey: 'test-public-key', assistantId: 'test-assistant-id' },
  features: { calling: true, voiceNotes: true },
};

/** Renders the full app at `path` against an in-memory mock backend and auth session. */
export function renderApp(
  path: string,
  { timing = INSTANT_TIMING, mock, api: adapter, auth = {}, calls = createMockCallFactory(), callingEnv = TEST_CALLING_ENV }: RenderAppOptions = {},
) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const api = adapter ?? createMockAdapter({ ...mock, timing });
  const Auth = ({ children }: { children: ReactNode }) => (
    <MemoryAuthProvider initialStatus="authenticated" user={TEST_USER} {...auth}>
      {children}
    </MemoryAuthProvider>
  );
  render(
    <Providers api={api} auth={Auth} calling={{ createProvider: calls.create, env: callingEnv }}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { router, api, calls };
}
