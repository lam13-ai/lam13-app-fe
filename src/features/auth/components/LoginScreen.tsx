import { ArrowUpRight } from 'lucide-react';
import { useId, useState, type ComponentProps, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { toErrorInfo } from '@/api';
import { LegalLinks } from '@/components/LegalLinks';
import { Button, iconProps } from '@/components/ui';
import { useAuth } from '../context';
import { sanitizeReturnTo } from '../returnTo';
import { AuthLayout, Eyebrow } from './AuthLayout';
import { AuthSplash } from './AuthSplash';

type Mode = 'signin' | 'signup' | 'forgot' | 'reset';

const MIN_PASSWORD = 8;

const copy: Record<Mode, { eyebrow: string; title: string; body: string; submit: string }> = {
  signin: {
    eyebrow: 'Welcome back',
    title: 'Sign in to Lam13.',
    body: 'Continue to your strategy workspace — conversations, drafts and board-ready outputs.',
    submit: 'Sign in',
  },
  signup: {
    eyebrow: 'Get started',
    title: 'Create your account.',
    body: 'Start turning briefs into structured, board-ready strategy in minutes.',
    submit: 'Create account',
  },
  forgot: {
    eyebrow: 'Password',
    title: 'Reset your password.',
    body: "Enter your email and we'll send you a link to choose a new password.",
    submit: 'Send reset link',
  },
  reset: {
    eyebrow: 'Password',
    title: 'Choose a new password.',
    body: `Use at least ${MIN_PASSWORD} characters.`,
    submit: 'Update password',
  },
};

function parseMode(value: string | null): Mode {
  return value === 'signup' || value === 'forgot' || value === 'reset' ? value : 'signin';
}

const inputClass =
  'h-11 w-full border border-hairline-strong bg-bg px-3 font-sans text-sm text-fg outline-none focus-visible:border-accent/60 focus-visible:ring-1 focus-visible:ring-accent/20';

function Field({
  label,
  ...props
}: { label: string } & Omit<ComponentProps<'input'>, 'id' | 'className'>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs text-fg-muted">
        {label}
      </label>
      <input id={id} required className={inputClass} {...props} />
    </div>
  );
}

/**
 * `/login` and `/auth` — sign in, create an account, request a reset link, or set a new password
 * (`?mode=reset&token=…`, the link the backend emails).
 */
export function LoginScreen() {
  const auth = useAuth();
  const [params, setParams] = useSearchParams();
  const mode = parseMode(params.get('mode'));
  const token = params.get('token') ?? '';
  const returnTo = sanitizeReturnTo(params.get('returnTo'));
  const text = copy[mode];

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (auth.status === 'loading') return <AuthSplash />;
  // A reset link opened while signed in still shows the reset form.
  if (auth.status === 'authenticated' && mode !== 'reset') return <Navigate to={returnTo} replace />;

  const switchMode = (next: Mode) => {
    const query = new URLSearchParams(params);
    query.delete('token');
    if (next === 'signin') query.delete('mode');
    else query.set('mode', next);
    setParams(query, { replace: true });
    setError(null);
    setNotice(null);
    setPassword('');
    setConfirm('');
  };

  const validate = (): string | null => {
    if ((mode === 'signup' || mode === 'reset') && password.length < MIN_PASSWORD) {
      return `Password must be at least ${MIN_PASSWORD} characters.`;
    }
    if ((mode === 'signup' || mode === 'reset') && password !== confirm) return "Passwords don't match.";
    if (mode === 'reset' && !token) return 'This reset link is missing its token. Request a new one.';
    return null;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signin') await auth.signIn(email.trim(), password);
      else if (mode === 'signup') await auth.signUp(email.trim(), password, fullName.trim());
      else if (mode === 'forgot') setNotice(await auth.forgotPassword(email.trim()));
      else {
        await auth.resetPassword(token, password);
        await auth.logout();
        setParams(new URLSearchParams(), { replace: true });
        setPassword('');
        setConfirm('');
        setNotice('Password updated. Sign in with your new password.');
      }
    } catch (err) {
      setError(toErrorInfo(err).message);
    } finally {
      setPending(false);
    }
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
        <Eyebrow>{text.eyebrow}</Eyebrow>
        <h1 className="text-[26px] font-bold leading-tight tracking-tight sm:text-[30px]">{text.title}</h1>
        <p className="font-sans text-sm leading-relaxed text-fg-muted">{text.body}</p>
      </div>

      <form className="mt-8 flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
        {mode === 'signup' && (
          <Field label="Full name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        )}
        {mode !== 'reset' && (
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
        {mode !== 'forgot' && (
          <Field
            label={mode === 'reset' ? 'New password' : 'Password'}
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            minLength={mode === 'signin' ? undefined : MIN_PASSWORD}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        {(mode === 'signup' || mode === 'reset') && (
          <Field
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        )}

        {error && (
          <p role="alert" className="border-l-2 border-danger pl-3 text-xs text-danger">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="border-l-2 border-accent pl-3 text-xs text-fg">
            {notice}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={pending}
          trailingIcon={<ArrowUpRight {...iconProps} />}
          className="mt-2 w-full"
        >
          {pending ? 'Please wait…' : text.submit}
        </Button>
      </form>

      <div className="mt-6 flex flex-col items-center gap-2 text-xs text-fg-muted">
        {mode === 'signin' && (
          <>
            <button type="button" className="hover:text-fg" onClick={() => switchMode('forgot')}>
              Forgot your password?
            </button>
            <button type="button" className="hover:text-fg" onClick={() => switchMode('signup')}>
              New to Lam13? <span className="text-fg underline">Create an account</span>
            </button>
          </>
        )}
        {mode !== 'signin' && (
          <button type="button" className="hover:text-fg" onClick={() => switchMode('signin')}>
            Back to <span className="text-fg underline">sign in</span>
          </button>
        )}
      </div>
    </AuthLayout>
  );
}
