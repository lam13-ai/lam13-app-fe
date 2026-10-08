import { ChevronDown, Download } from 'lucide-react';
import { useState } from 'react';
import { toErrorInfo } from '@/api';
import { BrandLogo, brandName } from '@/components/BrandLogo';
import { Button, Menu, MenuItem, Popover, Spinner, smallIconProps, useToast } from '@/components/ui';
import { useConnectProvider, useDisconnectProvider, useImportContacts, useIntegrations } from '@/features/integrations';
import type { ContactImportResult } from '@/types/api';

/**
 * Import contacts from Gmail / Outlook, against the backend (`/integrations/{gmail|outlook}`): the state
 * shown is the account's real connection. Choosing a provider that is not connected opens its own sign-in
 * (Google / Microsoft); one that is connected imports its contacts into My Contacts. A provider the server
 * has no credentials for says so and cannot be pressed.
 */

const MAIL_PROVIDERS = ['gmail', 'outlook'] as const;
type MailProvider = (typeof MAIL_PROVIDERS)[number];

const plural = (n: number) => `${n} contact${n === 1 ? '' : 's'}`;
/** What an import did, e.g. "Imported 12 contacts from Gmail. 3 were already in My Contacts." */
const importSummary = (name: string, { imported, skipped }: ContactImportResult) =>
  `${imported === 0 ? `No new contacts in ${name}.` : `Imported ${plural(imported)} from ${name}.`}${skipped > 0 ? ` ${skipped} already in My Contacts or without a name.` : ''}`;

/** One provider's real state, and the one thing choosing it does: sign in when disconnected, import when connected. */
function useMailProvider(provider: MailProvider) {
  const integrations = useIntegrations();
  const connect = useConnectProvider();
  const importer = useImportContacts();
  const toast = useToast();
  const name = brandName(provider);
  const connection = integrations.data?.find((c) => c.provider === provider);
  const state = integrations.isPending
    ? ('loading' as const)
    : !connection
      ? ('unknown' as const)
      : connection.status === 'connected'
        ? ('connected' as const)
        : !connection.configured
          ? ('unavailable' as const)
          : connection.status === 'error'
            ? ('expired' as const)
            : ('disconnected' as const);
  const [result, setResult] = useState<string | null>(null);
  const run = () => {
    if (state === 'connected') {
      setResult(null);
      importer.mutate(provider, {
        onSuccess: (summary) => {
          setResult(importSummary(name, summary));
          toast.show(importSummary(name, summary));
        },
        onError: (error) => toast.show(`Couldn't import from ${name}. ${toErrorInfo(error).message}`, { tone: 'danger' }),
      });
    } else if (state === 'disconnected' || state === 'expired') {
      connect.mutate(provider, { onError: (error) => toast.show(`Couldn't connect ${name}. ${toErrorInfo(error).message}`, { tone: 'danger' }) });
    } else if (state === 'unavailable') {
      toast.show(`${name} import is not set up on this server yet.`);
    }
  };
  const status = { loading: 'Checking…', unknown: 'Status unavailable', connected: 'Connected', unavailable: 'Not set up on this server', expired: 'Connect again', disconnected: '' }[state];
  return { name, state, status, account: connection?.account ?? null, run, importing: importer.isPending, connecting: connect.isPending, result };
}

function ImportMenuItem({ provider }: { provider: MailProvider }) {
  const mail = useMailProvider(provider);
  return (
    <MenuItem onSelect={mail.run} leading={<BrandLogo brand={provider} size={18} />}>
      <span className="flex flex-1 items-center justify-between gap-2">
        {mail.name}
        {mail.status && <span className="text-2xs font-normal text-fg-muted">{mail.status}</span>}
      </span>
    </MenuItem>
  );
}

/** "Import contacts ▾": Gmail and Outlook, each with its real state. */
export function ImportMenu() {
  return (
    <Popover
      placement="bottom-end"
      className="w-72"
      trigger={(props) => (
        <Button {...props} variant="ghost" size="sm" aria-label="Import contacts" leadingIcon={<Download {...smallIconProps} />} trailingIcon={<ChevronDown size={14} strokeWidth={1.8} aria-hidden />}>
          <span className="max-sm:sr-only">Import contacts</span>
        </Button>
      )}
    >
      <Menu label="Import contacts from">
        {MAIL_PROVIDERS.map((provider) => (
          <ImportMenuItem key={provider} provider={provider} />
        ))}
      </Menu>
    </Popover>
  );
}

/** One provider's option on the page: "Import from Gmail" signs in first when the account is not connected. */
function ImportOption({ provider }: { provider: MailProvider }) {
  const mail = useMailProvider(provider);
  const busy = mail.importing || mail.connecting;
  const blocked = mail.state === 'loading' || mail.state === 'unknown' || mail.state === 'unavailable';
  return (
    <button
      type="button"
      aria-label={`Import from ${mail.name}`}
      aria-busy={busy || undefined}
      disabled={busy || blocked}
      onClick={mail.run}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-card border border-border bg-bg px-3 py-2 text-left text-sm text-fg transition-colors duration-150 ease-standard hover:border-accent/60 hover:bg-accent-wash disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:border-border disabled:hover:bg-bg"
    >
      {busy ? <Spinner size={18} state="active" /> : <BrandLogo brand={provider} size={22} />}
      <span className="min-w-0">
        <span className="block">{mail.importing ? `Importing from ${mail.name}…` : `Import from ${mail.name}`}</span>
        {(mail.account ?? mail.status) && <span className="block truncate text-2xs text-fg-muted">{mail.state === 'connected' ? (mail.account ?? 'Connected') : mail.status}</span>}
      </span>
    </button>
  );
}

/** "Import from Gmail" / "Import from Outlook", side by side (stacked on a phone). */
export function ImportOptions({ className }: { className?: string }) {
  return (
    <div className={className ?? 'flex flex-col gap-2 sm:flex-row'}>
      {MAIL_PROVIDERS.map((provider) => (
        <div key={provider} className="w-full sm:w-56">
          <ImportOption provider={provider} />
        </div>
      ))}
    </div>
  );
}

/** Below the contact list: the import stays visible however many contacts there are. */
export function ImportMoreContacts() {
  return (
    <section aria-labelledby="import-more-contacts" className="mt-8 border-t border-hairline pt-6">
      {/* The whole block — heading, line and both buttons — sits in the centre of the page, not at the list's left edge. */}
      <div data-import-block className="mx-auto flex w-full max-w-xl flex-col items-center text-center">
        <h2 id="import-more-contacts" className="text-sm font-bold">
          Import more contacts
        </h2>
        <p className="mb-3 mt-1 text-sm text-fg-muted">Bring contacts from Gmail or Outlook.</p>
        <ImportOptions className="flex w-full flex-col items-stretch justify-center gap-2 sm:flex-row" />
      </div>
    </section>
  );
}

/** One connected account: "Gmail ● Connected  user@gmail.com  [Import contacts] [Disconnect Gmail]". */
function ConnectionRow({ provider }: { provider: MailProvider }) {
  const mail = useMailProvider(provider);
  const disconnect = useDisconnectProvider();
  const toast = useToast();
  const { name } = mail;
  return (
    <li aria-label={`${name} connection`} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline py-3 last:border-b-0">
      <span className="flex min-w-0 flex-1 basis-56 items-center gap-3">
        <BrandLogo brand={provider} size={28} />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-sm">
            <span className="font-bold">{name}</span>
            <span className="flex items-center gap-1.5 text-xs">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
              Connected
            </span>
          </span>
          {mail.account && <span className="block truncate text-xs text-fg-muted">{mail.account}</span>}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-2">
        {mail.result && (
          <span role="status" className="text-xs text-fg">
            {mail.result}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={mail.importing}
          aria-busy={mail.importing || undefined}
          aria-label={mail.importing ? `Importing contacts from ${name}` : `Import contacts from ${name}`}
          leadingIcon={mail.importing ? <Spinner size={14} state="active" /> : <Download {...smallIconProps} />}
          onClick={mail.run}
        >
          {mail.importing ? 'Importing…' : 'Import contacts'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={disconnect.isPending}
          onClick={() => disconnect.mutate(provider, { onError: (error) => toast.show(`Couldn't disconnect ${name}. ${toErrorInfo(error).message}`, { tone: 'danger' }) })}
        >
          Disconnect {name}
        </Button>
      </span>
    </li>
  );
}

/** The mail accounts that are really connected, above the contacts. Nothing here when none is. */
export function MailConnections() {
  const integrations = useIntegrations();
  const connected = MAIL_PROVIDERS.filter((p) => integrations.data?.some((c) => c.provider === p && c.status === 'connected'));
  if (connected.length === 0) return null;
  return (
    <section aria-label="Connected accounts" className="mb-5">
      <ul className="rounded-card border border-border px-3.5">
        {connected.map((p) => (
          <ConnectionRow key={p} provider={p} />
        ))}
      </ul>
    </section>
  );
}
