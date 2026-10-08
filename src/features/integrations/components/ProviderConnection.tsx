import { useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { toErrorInfo } from '@/api';
import { Button, Spinner, useToast } from '@/components/ui';
import type { IntegrationProvider } from '@/types/api';
import { PROVIDER_NAMES, useConnectProvider, useDisconnectProvider, useFinishSignIn, useIntegrations } from '../hooks/useIntegrations';
import { ConnectedDot } from './IntegrationRow';

/** A row's state when there is nothing to press: why, in a few words. */
export function StatusNote({ children }: { children: string }) {
  return <p className="text-xs text-fg-muted">{children}</p>;
}

/**
 * One provider's real state and its action. "Connected" appears only when the backend says the provider's
 * sign-in succeeded; a provider the server has no credentials for says so and offers nothing to press.
 */
export function ProviderConnection({ provider }: { provider: IntegrationProvider }) {
  const integrations = useIntegrations();
  const connect = useConnectProvider();
  const disconnect = useDisconnectProvider();
  const toast = useToast();
  const name = PROVIDER_NAMES[provider];
  const connection = integrations.data?.find((c) => c.provider === provider);

  if (integrations.isPending) return <Spinner size={16} state="active" label={`Loading ${name} status`} />;
  if (!connection) return <StatusNote>Status unavailable</StatusNote>;
  if (connection.status === 'connected') {
    return (
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
        <span className="min-w-0 text-right">
          <ConnectedDot />
          {connection.account && <span className="block truncate text-2xs text-fg-muted">{connection.account}</span>}
        </span>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Disconnect ${name}`}
          disabled={disconnect.isPending}
          onClick={() => disconnect.mutate(provider, { onError: (error) => toast.show(`Couldn't disconnect ${name}. ${toErrorInfo(error).message}`, { tone: 'danger' }) })}
        >
          Disconnect
        </Button>
      </div>
    );
  }
  if (!connection.configured) return <StatusNote>Not set up on this server</StatusNote>;
  const expired = connection.status === 'error';
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
      {expired && <StatusNote>Needs to be connected again</StatusNote>}
      <Button
        variant="outline"
        size="sm"
        disabled={connect.isPending}
        aria-busy={connect.isPending || undefined}
        leadingIcon={connect.isPending ? <Spinner size={14} state="active" /> : undefined}
        onClick={() => connect.mutate(provider, { onError: (error) => toast.show(`Couldn't connect ${name}. ${toErrorInfo(error).message}`, { tone: 'danger' }) })}
      >
        {expired ? 'Reconnect' : 'Connect'} {name}
      </Button>
    </div>
  );
}

const isProvider = (value: string | undefined): value is IntegrationProvider => value !== undefined && value in PROVIDER_NAMES;
/** Gmail and Outlook are connected from My Contacts (to import contacts), so their sign-in returns there. */
const returnPath = (provider: IntegrationProvider) => (provider === 'gmail' || provider === 'outlook' ? '/contacts' : '/integrations');

/**
 * `/integrations/:provider/callback`: the provider returns here after sign-in. Sends the code to the backend
 * once, then goes back to where the connection was started with `?connection=connected|cancelled|error`.
 */
export function IntegrationCallback() {
  const { provider } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const finish = useFinishSignIn();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // a code works once; StrictMode runs effects twice
    started.current = true;
    if (!isProvider(provider)) {
      void navigate('/integrations', { replace: true });
      return;
    }
    const done = (result: 'connected' | 'cancelled' | 'error') => void navigate(`${returnPath(provider)}?connection=${result}&provider=${provider}`, { replace: true });
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) {
      done(params.get('error') === 'access_denied' ? 'cancelled' : 'error');
      return;
    }
    void finish.mutateAsync({ provider, code, state }).then(
      () => done('connected'),
      () => done('error'),
    );
  }, [finish, navigate, params, provider]);

  return (
    <p role="status" className="flex h-full items-center justify-center text-xs text-fg-muted">
      Connecting{isProvider(provider) ? ` ${PROVIDER_NAMES[provider]}` : ''}…
    </p>
  );
}

/** On the page a sign-in returns to: says how it went (from `?connection=…&provider=…`), then clears the query. */
export function useConnectionResult() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  useEffect(() => {
    const result = params.get('connection');
    if (!result) return;
    const provider = params.get('provider') ?? undefined;
    const name = isProvider(provider) ? PROVIDER_NAMES[provider] : 'the account';
    if (result === 'connected') toast.show(`${name} connected.`);
    if (result === 'error') toast.show(`Couldn't connect ${name}. Please try again.`, { tone: 'danger' });
    setParams({}, { replace: true });
  }, [params, setParams, toast]);
}
