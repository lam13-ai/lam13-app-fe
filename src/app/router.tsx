import { createBrowserRouter, Outlet, type RouteObject } from 'react-router';
import { RequireAuth } from '@/features/auth';
import { AppShell } from './layouts/AppShell';
import { RouteError } from './routes/RouteError';

const chatRoute = async () => ({ Component: (await import('./routes/ChatRoute')).default });
const notFoundRoute = async () => ({ Component: (await import('./routes/NotFoundRoute')).default });
const loginRoute = async () => ({ Component: (await import('./routes/LoginRoute')).default });
const adminLayout = async () => ({ Component: (await import('@/features/admin/AdminLayout')).AdminLayout });
const adminKbRoute = async () => ({ Component: (await import('@/features/admin/KnowledgeBasePage')).KnowledgeBasePage });
const adminKeysRoute = async () => ({ Component: (await import('@/features/admin/ApiKeysPage')).ApiKeysPage });

/**
 * Route table. Everything except the auth screens requires sign-in. `/auth?mode=reset&token=…` is the
 * password-reset link the backend emails (RESET_PASSWORD_URL).
 */
export const routes: RouteObject[] = [
  {
    // Last-resort boundary: a crash anywhere (shell, auth screens) renders a recoverable error page.
    errorElement: <RouteError standalone />,
    children: [
      { path: 'login', lazy: loginRoute, HydrateFallback: () => null },
      { path: 'auth', lazy: loginRoute, HydrateFallback: () => null },
      {
        // Admin panel: full page, outside the chat shell. Access is checked by AdminLayout and the backend.
        path: 'admin',
        element: (
          <RequireAuth>
            <Outlet />
          </RequireAuth>
        ),
        HydrateFallback: () => null,
        children: [
          {
            lazy: adminLayout,
            errorElement: <RouteError standalone />,
            children: [
              { index: true, lazy: adminKbRoute },
              { path: 'api-keys', lazy: adminKeysRoute },
            ],
          },
        ],
      },
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
