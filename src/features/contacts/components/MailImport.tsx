import { ChevronDown, Download } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { BrandLogo, brandName } from '@/components/BrandLogo';
import { Button, Menu, MenuItem, Popover, Spinner, smallIconProps, usePopover } from '@/components/ui';
import { MAIL_PROVIDERS, useDemoStore, type MailProvider } from '@/stores/demoStore';

/**
 * Import contacts from Gmail / Outlook — a FRONTEND DEMO. Connecting stores the typed address in the demo
 * store (session memory); "Import contacts" waits a moment and then says the demo ran. No contact is made up:
 * nothing is added to the list, which only ever shows the user's real contacts.
 * No Google or Microsoft sign-in, no request of any kind, and nothing goes through the real Contacts API.
 * TODO(backend): replace with the real OAuth + import flow.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** How long the simulated import takes. */
export const DEMO_IMPORT_MS = 900;

const COPY: Record<MailProvider, { field: string; placeholder: string }> = {
  gmail: { field: 'Gmail address', placeholder: 'you@gmail.com' },
  outlook: { field: 'Outlook email', placeholder: 'you@outlook.com' },
};

const FIELD =
  'h-11 w-full border border-border bg-bg px-3 text-base text-fg outline-none transition-colors duration-150 ease-standard placeholder:text-fg-muted focus:border-composer-focus focus:ring-1 focus:ring-composer-ring focus-visible:outline-none sm:text-sm md:h-10';

function DemoTag() {
  return <span className="rounded-full border border-hairline-strong px-1.5 text-[10px] uppercase leading-4 tracking-wide text-fg-muted">Demo</span>;
}

/** "Connect Gmail" / "Connect Outlook": an address, validated, then a local connected state. */
function ConnectForm({ provider }: { provider: MailProvider }) {
  const popover = usePopover();
  const connect = useDemoStore((s) => s.connectMail);
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const id = useId();
  const name = brandName(provider);
  const value = email.trim();
  const invalid = submitted && value !== '' && !EMAIL.test(value);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!EMAIL.test(value)) return;
    connect(provider, value);
    popover?.close();
  };
  return (
    <form noValidate onSubmit={onSubmit} aria-labelledby={`${id}-title`} className="flex flex-col gap-3 p-2 text-left">
      <div className="flex items-start gap-2.5">
        <BrandLogo brand={provider} size={28} />
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-sm font-bold">
            Connect {name}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">Connect your {name} account to import contacts into Lam13.</p>
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-email`} className="mb-1.5 block text-xs font-bold">
          {COPY[provider].field}
        </label>
        <input
          id={`${id}-email`}
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={COPY[provider].placeholder}
          autoComplete="off"
          spellCheck={false}
          autoFocus
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : `${id}-help`}
          className={FIELD}
        />
        {invalid ? (
          <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-danger">
            Enter a valid email address.
          </p>
        ) : (
          <p id={`${id}-help`} className="mt-1.5 text-2xs leading-relaxed text-fg-muted">
            Demo: there is no {provider === 'gmail' ? 'Google' : 'Microsoft'} sign-in, and nothing is sent anywhere.
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={value === ''}>
          Connect {name}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => popover?.close()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** "Import contacts ▾": Gmail and Outlook. Choosing one that is not connected opens its Connect form here. */
export function ImportMenu() {
  const mail = useDemoStore((s) => s.mail);
  const [connecting, setConnecting] = useState<MailProvider | null>(null);
  return (
    <Popover
      placement="bottom-end"
      // On a phone the button sits mid-header, so a panel hung from it would run off the left edge: there the
      // form is pinned to the screen's width, just under the header.
      className={connecting ? 'w-[min(20rem,calc(100vw-1.5rem))] max-sm:fixed! max-sm:inset-x-3! max-sm:top-[calc(var(--header-h)+0.25rem)]! max-sm:mt-0! max-sm:w-auto!' : 'w-56'}
      onOpenChange={(open) => {
        if (!open) setConnecting(null);
      }}
      trigger={(props) => (
        <Button {...props} variant="ghost" size="sm" aria-label="Import contacts" leadingIcon={<Download {...smallIconProps} />} trailingIcon={<ChevronDown size={14} strokeWidth={1.8} aria-hidden />}>
          <span className="max-sm:sr-only">Import contacts</span>
        </Button>
      )}
    >
      {connecting ? (
        <ConnectForm provider={connecting} />
      ) : (
        <Menu label="Import contacts from">
          {MAIL_PROVIDERS.map((provider) =>
            mail[provider] ? (
              // Already connected: its row (import, disconnect) is on the page.
              <MenuItem key={provider} onSelect={() => undefined} leading={<BrandLogo brand={provider} size={18} />}>
                <span className="flex flex-1 items-center justify-between gap-2">
                  {brandName(provider)}
                  <span className="text-2xs font-normal text-fg-muted">Connected</span>
                </span>
              </MenuItem>
            ) : (
              <MenuItem key={provider} keepOpen onSelect={() => setConnecting(provider)} leading={<BrandLogo brand={provider} size={18} />}>
                {brandName(provider)}
              </MenuItem>
            ),
          )}
        </Menu>
      )}
    </Popover>
  );
}

/**
 * One provider's option on the page: opens its Connect form; once connected, says so (its row is above).
 * `above`: the form opens over the button — for the section at the foot of the page, where there is no room below.
 */
function ImportOption({ provider, above = false }: { provider: MailProvider; above?: boolean }) {
  const connection = useDemoStore((s) => s.mail[provider]);
  // The form is mounted only while its popover is open (one Connect form on the page at a time).
  const [open, setOpen] = useState(false);
  const name = brandName(provider);
  if (connection) {
    return (
      <p className="flex min-h-11 items-center gap-2.5 rounded-card border border-hairline px-3 text-xs text-fg-muted">
        <BrandLogo brand={provider} size={22} />
        <span className="min-w-0 truncate">
          <span className="text-fg">{name}</span> · Connected · {connection.email}
        </span>
      </p>
    );
  }
  return (
    <Popover
      placement={above ? 'top-start' : 'bottom-start'}
      kind="dialog"
      className="w-[min(20rem,calc(100vw-1.5rem))]"
      onOpenChange={setOpen}
      trigger={(props) => (
        <button
          {...props}
          type="button"
          className="flex min-h-11 w-full items-center gap-2.5 rounded-card border border-border bg-bg px-3 text-left text-sm text-fg transition-colors duration-150 ease-standard hover:border-accent/60 hover:bg-accent-wash aria-expanded:border-accent/60 aria-expanded:bg-accent-wash"
        >
          <BrandLogo brand={provider} size={22} />
          Import from {name}
        </button>
      )}
    >
      {open && <ConnectForm provider={provider} />}
    </Popover>
  );
}

/** "Import from Gmail" / "Import from Outlook", side by side (stacked on a phone). */
export function ImportOptions({ className, above }: { className?: string; above?: boolean }) {
  return (
    <div className={className ?? 'flex flex-col gap-2 sm:flex-row'}>
      {MAIL_PROVIDERS.map((provider) => (
        // The popover's own wrapper is shrink-to-fit: stretch it, so each option fills its column.
        <div key={provider} className="w-full sm:w-56 [&>div]:flex [&>div]:w-full">
          <ImportOption provider={provider} above={above} />
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
        <ImportOptions above className="flex w-full flex-col items-stretch justify-center gap-2 sm:flex-row" />
      </div>
    </section>
  );
}

/** One connected provider: "Gmail • Connected  user@gmail.com  [Import contacts] [Disconnect Gmail]". */
function ConnectionRow({ provider }: { provider: MailProvider }) {
  const connection = useDemoStore((s) => s.mail[provider])!;
  const disconnect = useDemoStore((s) => s.disconnectMail);
  const markImported = useDemoStore((s) => s.markMailImported);
  const [importing, setImporting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const name = brandName(provider);
  const runImport = () => {
    setImporting(true);
    // The "import" is only a pause: no contact is read, created or shown.
    timer.current = setTimeout(() => {
      markImported(provider);
      setImporting(false);
    }, DEMO_IMPORT_MS);
  };
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
            <DemoTag />
          </span>
          <span className="block truncate text-xs text-fg-muted">{connection.email}</span>
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-2">
        {connection.imported ? (
          <span role="status" className="text-xs text-fg">
            Demo import finished. No contacts were added.
          </span>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={importing}
            aria-busy={importing || undefined}
            aria-label={importing ? `Importing contacts from ${name}` : `Import contacts from ${name}`}
            leadingIcon={importing ? <Spinner size={14} state="active" /> : <Download {...smallIconProps} />}
            onClick={runImport}
          >
            {importing ? 'Importing…' : 'Import contacts'}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => disconnect(provider)}>
          Disconnect {name}
        </Button>
      </span>
    </li>
  );
}

/**
 * The mail accounts connected in this demo, above the user's own contacts. Nothing here when none is.
 */
export function MailConnections() {
  const mail = useDemoStore((s) => s.mail);
  const connected = MAIL_PROVIDERS.filter((p) => mail[p]);
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
