import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Button } from '@/components/ui';
import { useAuth } from '../context';
import { clearReturnTo, peekReturnTo } from '../returnTo';
import { AuthLayout, Eyebrow } from './AuthLayout';
import { AuthSplash } from './AuthSplash';

/**
 * `/callback` — the identity provider redirects here after sign-in. The provider completes the
 * code exchange; this screen waits for the session and continues to the intended page.
 */
export function CallbackScreen() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.status !== 'authenticated') return;
    const target = peekReturnTo();
    clearReturnTo();
    navigate(target, { replace: true });
  }, [auth.status, navigate]);

  if (auth.status === 'unauthenticated' && auth.error) {
    return (
      <AuthLayout>
        <div role="alert" className="flex flex-col gap-4">
          <Eyebrow>Sign-in</Eyebrow>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight">We couldn&apos;t sign you in.</h1>
          <p className="font-sans text-sm leading-relaxed text-fg-muted">{auth.error}</p>
        </div>
        <Button variant="primary" size="lg" className="mt-8 w-full" onClick={() => navigate('/login', { replace: true })}>
          Back to sign in
        </Button>
      </AuthLayout>
    );
  }

  // Opened directly without a sign-in in progress.
  if (auth.status === 'unauthenticated') return <Navigate to="/login" replace />;

  return <AuthSplash label="Signing you in…" />;
}
