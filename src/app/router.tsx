import { createBrowserRouter, type RouteObject } from 'react-router';
import { RequireAuth } from '@/features/auth';
import { AppShell } from './layouts/AppShell';
import { RouteError } from './routes/RouteError';

const chatRoute = async () => ({ Component: (await import('./routes/ChatRoute')).default });
const notFoundRoute = async () => ({ Component: (await import('./routes/NotFoundRoute')).default });
const loginRoute = async () => ({ Component: (await import('./routes/LoginRoute')).default });
const callbackRoute = async () => ({ Component: (await import('./routes/CallbackRoute')).default });

/** Route table (frontend-architecture.md §10). Everything except /login and /callback requires auth. */
export const routes: RouteObject[] = [
  {
    // Last-resort boundary: a crash anywhere (shell, auth screens) renders a recoverable error page.
    errorElement: <RouteError standalone />,
    children: [
      { path: 'login', lazy: loginRoute, HydrateFallback: () => null },
      { path: 'callback', lazy: callbackRoute, HydrateFallback: () => null },
      {
        element: (
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        ),
        HydrateFallback: () => null,
        // In-shell boundaries: a crashed view stays inside the workspace, so the sidebar still works.
        children: [
          { index: true, lazy: chatRoute, errorElement: <RouteError /> },
          { path: 'c/:conversationId', lazy: chatRoute, errorElement: <RouteError /> },
          { path: '*', lazy: notFoundRoute, errorElement: <RouteError /> },
        ],
      },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
