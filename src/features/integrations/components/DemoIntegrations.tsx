import { Server } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { brandName, type Brand } from '@/components/BrandLogo';
import { Button } from '@/components/ui';
import { isHttpsUrl } from '@/lib/url';
import { useDemoStore } from '@/stores/demoStore';
import { ConnectedDot, IntegrationRow } from './IntegrationRow';

/** Marks a state that exists only in this page, so "Connected" is never read as a real account link. */
function DemoTag() {
  return <span className="rounded-full border border-hairline-strong px-1.5 text-[10px] uppercase leading-4 tracking-wide text-fg-muted">Demo</span>;
}

/**
 * An integration that has no backend yet: Connect / Disconnect only flips a local demo state.
 * TODO(backend): replace with the real connection flow; nothing is called or stored here.
 */
export function DemoIntegration({ brand, description }: { brand: Brand; description: string }) {
  const connected = useDemoStore((s) => Boolean(s.connected[brand]));
  const setConnected = useDemoStore((s) => s.setConnected);
  const name = brandName(brand);
  return (
    <IntegrationRow
      brand={brand}
      description={description}
      action={
        connected ? (
          <div className="flex items-center gap-3">
            <ConnectedDot />
            <DemoTag />
            <Button variant="outline" size="sm" aria-label={`Disconnect ${name}`} onClick={() => setConnected(brand, false)}>
              Disconnect
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setConnected(brand, true)}>
            Connect {name}
          </Button>
        )
      }
    />
  );
}

const FIELD =
  'h-11 w-full border border-border bg-bg px-3 text-base text-fg outline-none transition-colors duration-150 ease-standard placeholder:text-fg-muted focus:border-composer-focus focus:ring-1 focus:ring-composer-ring focus-visible:outline-none sm:text-sm md:h-10';

/**
 * A custom MCP server: name, URL, optional API key. A local demo — saving stores the
 * name and URL in session memory only; the key is cleared on save and never stored, logged or sent.
 */
export function CustomServerSection() {
  const server = useDemoStore((s) => s.customServer);
  const setServer = useDemoStore((s) => s.setCustomServer);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const id = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  // Opening the form brings the start of this section into view (it is the last thing on the page, so the
  // form would otherwise open below the fold). Never on closing; no animation when motion is reduced.
  useEffect(() => {
    if (!editing) return;
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    sectionRef.current?.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    // Focus without the browser's own (instant) scroll, which would cut the smooth one short.
    nameRef.current?.focus({ preventScroll: true });
  }, [editing]);
  const nameError = !name.trim() ? 'Enter a name.' : null;
  const urlError = !url.trim() ? 'Enter the MCP server URL.' : !isHttpsUrl(url.trim()) ? 'Enter a valid https:// URL.' : null;

  const startEditing = () => {
    setName(server?.name ?? '');
    setUrl(server?.url ?? '');
    setKey('');
    setSubmitted(false);
    setEditing(true);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (nameError || urlError) return;
    setServer({ name: name.trim(), url: url.trim(), hasKey: key.length > 0 });
    setKey('');
    setEditing(false);
  };

  return (
    <section ref={sectionRef} aria-labelledby={`${id}-title`} className="scroll-mt-4 rounded-card border border-hairline-strong p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-60 items-start gap-3.5">
          <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-card bg-fg/10 text-fg">
            <Server size={18} strokeWidth={1.6} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id={`${id}-title`} className="text-sm font-bold">
              Custom MCP Server
            </h3>
            <p className="mt-1 max-w-[52ch] text-xs leading-relaxed text-fg-muted">
              Bring your own tool: connect Lam13 to your MCP server and use it alongside the built-in integrations.
            </p>
          </div>
        </div>
        {!editing &&
          (server ? (
            <div className="flex flex-wrap items-center gap-3">
              <ConnectedDot />
              <DemoTag />
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={startEditing}>
              Add custom server
            </Button>
          ))}
      </div>

      {server && !editing && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4 sm:pl-[3.125rem]">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{server.name}</p>
            <p className="truncate text-xs text-fg-muted">
              {server.url}
              {server.hasKey && ' · API key provided'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={startEditing}>
              Edit
            </Button>
            <Button variant="outline" size="sm" aria-label={`Disconnect ${server.name}`} onClick={() => setServer(null)}>
              Disconnect
            </Button>
          </div>
        </div>
      )}

      {editing && (
        <form noValidate onSubmit={onSubmit} className="mt-4 flex max-w-md flex-col gap-4 border-t border-hairline pt-4 sm:ml-[3.125rem]">
          <div>
            <label htmlFor={`${id}-name`} className="mb-1.5 block text-xs font-bold">
              Name
            </label>
            <input
              id={`${id}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Team tools server"
              ref={nameRef}
              autoComplete="off"
              aria-invalid={submitted && Boolean(nameError)}
              aria-describedby={submitted && nameError ? `${id}-name-error` : undefined}
              className={FIELD}
            />
            {submitted && nameError && (
              <p id={`${id}-name-error`} role="alert" className="mt-1.5 text-xs text-danger">
                {nameError}
              </p>
            )}
          </div>
          <div>
            <label htmlFor={`${id}-url`} className="mb-1.5 block text-xs font-bold">
              MCP Server URL
            </label>
            <input
              id={`${id}-url`}
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/mcp"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={submitted && Boolean(urlError)}
              aria-describedby={submitted && urlError ? `${id}-url-error` : undefined}
              className={FIELD}
            />
            {submitted && urlError && (
              <p id={`${id}-url-error`} role="alert" className="mt-1.5 text-xs text-danger">
                {urlError}
              </p>
            )}
          </div>
          <div>
            <label htmlFor={`${id}-key`} className="mb-1.5 block text-xs font-bold">
              API key <span className="font-medium text-fg-muted">(optional)</span>
            </label>
            <input
              id={`${id}-key`}
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Leave empty if the server needs none"
              // Not "off": browsers ignore it on a password field and fill the saved sign-in into this and the URL above.
              autoComplete="new-password"
              spellCheck={false}
              aria-describedby={`${id}-key-help`}
              className={FIELD}
            />
            <p id={`${id}-key-help`} className="mt-1.5 text-2xs leading-relaxed text-fg-muted">
              Demo only: nothing you enter here is stored or sent anywhere, and no server is contacted when you save.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm">
              Save and connect
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
