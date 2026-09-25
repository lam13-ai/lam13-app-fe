import { ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { LegalLinks } from '@/components/LegalLinks';
import { Button, iconProps } from '@/components/ui';
import { useAuth } from '../context';
import { sanitizeReturnTo } from '../returnTo';
import { AuthLayout, Eyebrow } from './AuthLayout';
import { AuthSplash } from './AuthSplash';

type Variant = 'sign-in' | 'sign-up';

const copy: Record<Variant, { title: string; body: string; primary: string; secondary: string }> = {
  'sign-in': {
    title: 'Sign in to Lam13.',
    body: 'Continue to your strategy workspace — conversations, drafts and board-ready outputs.',
    primary: 'Continue to sign in',
    secondary: 'Create an account',
  },
  'sign-up': {
    title: 'Create your account.',
    body: 'Start turning briefs into structured, board-ready strategy in minutes.',
    primary: 'Create an account',
    secondary: 'I already have an account',
  },
};

/** `/login` — sign in or create an account via the identity provider's hosted pages. */
export function LoginScreen() {
  const auth = useAuth();
  const [params, setParams] = useSearchParams();
  const [pending, setPending] = useState(false);
  const returnTo = sanitizeReturnTo(params.get('returnTo'));
  const variant: Variant = params.get('screen') === 'sign-up' ? 'sign-up' : 'sign-in';
  const text = copy[variant];

  if (auth.status === 'loading') return <AuthSplash />;
  if (auth.status === 'authenticated') return <Navigate to={returnTo} replace />;

  const start = async (action: 'login' | 'register') => {
    setPending(true);
    try {
      await auth[action]({ returnTo });
    } finally {
      // With a hosted page the browser navigates away; otherwise re-enable the buttons.
      setPending(false);
    }
  };

  const switchVariant = () => {
    const next = new URLSearchParams(params);
    if (variant === 'sign-in') next.set('screen', 'sign-up');
    else next.delete('screen');
    setParams(next, { replace: true });
  };

  return (
    <AuthLayout
      footer={
        <>
          AI-native strategy consulting
          <LegalLinks className="mt-1 justify-center" />
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Eyebrow>{variant === 'sign-in' ? 'Welcome back' : 'Get started'}</Eyebrow>
        <h1 className="text-[26px] font-bold leading-tight tracking-tight sm:text-[30px]">{text.title}</h1>
        <p className="font-sans text-sm leading-relaxed text-fg-muted">{text.body}</p>
        {auth.error && (
          <p role="alert" className="border-l-2 border-danger pl-3 text-xs text-danger">
            {auth.error}
          </p>
        )}
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <Button
          variant="primary"
          size="lg"
          disabled={pending}
          onClick={() => void start(variant === 'sign-in' ? 'login' : 'register')}
          trailingIcon={<ArrowUpRight {...iconProps} />}
          className="w-full"
        >
          {pending ? 'Redirecting…' : text.primary}
        </Button>
        <Button variant="secondary" size="lg" disabled={pending} onClick={switchVariant} className="w-full">
          {text.secondary}
        </Button>
      </div>
    </AuthLayout>
  );
}
