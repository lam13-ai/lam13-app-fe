import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { AuthSplash } from './components/AuthSplash';
import { useAuth } from './context';

/**
 * Route guard. While the session resolves nothing protected renders; signed-out users go to
 * `/login` with the requested path preserved (including direct `/c/:id` links).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <AuthSplash />;
  if (status === 'unauthenticated') {
    const path = `${location.pathname}${location.search}${location.hash}`;
    const query = path === '/' ? '' : `?returnTo=${encodeURIComponent(path)}`;
    return <Navigate to={`/login${query}`} replace />;
  }
  return <>{children}</>;
}
