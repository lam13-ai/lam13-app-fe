import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useFinishGranolaSignIn } from '@/features/meetings';

/**
 * `/integrations/granola/callback`: Granola returns here after sign-in (so its consent screen names
 * app.lam13.ai). Sends the code to the backend once, then goes to /integrations?granola=connected|cancelled|error.
 */
export function GranolaCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const finish = useFinishGranolaSignIn();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // a code works once; StrictMode runs effects twice
    started.current = true;
    const done = (result: 'connected' | 'cancelled' | 'error') => void navigate(`/integrations?granola=${result}`, { replace: true });
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) {
      done(params.get('error') === 'access_denied' ? 'cancelled' : 'error');
      return;
    }
    void finish.mutateAsync({ code, state }).then(
      () => done('connected'),
      () => done('error'),
    );
  }, [finish, navigate, params]);

  return (
    <p role="status" className="flex h-full items-center justify-center text-xs text-fg-muted">
      Connecting Granola…
    </p>
  );
}
