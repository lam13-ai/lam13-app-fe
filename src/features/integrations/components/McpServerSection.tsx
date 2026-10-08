import { Server } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { toErrorInfo } from '@/api';
import { Button, Skeleton, Spinner } from '@/components/ui';
import { isHttpsUrl } from '@/lib/url';
import { useMcpServer } from '../hooks/useIntegrations';

const FIELD =
  'h-11 w-full border border-border bg-bg px-3 text-base text-fg outline-none transition-colors duration-150 ease-standard placeholder:text-fg-muted focus:border-composer-focus focus:ring-1 focus:ring-composer-ring focus-visible:outline-none sm:text-sm md:h-10';

/**
 * A custom MCP server: name, URL, optional API key, saved to the user's account (PUT /integrations/custom-mcp;
 * the key is stored encrypted and never returned). The state shown is "Saved", not "Connected": the backend
 * keeps the configuration and does not call the server yet.
 */
export function McpServerSection() {
  const { server: query, save, remove } = useMcpServer();
  const server = query.data ?? null;
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
  const failure = save.error ?? remove.error;

  const startEditing = () => {
    setName(server?.name ?? '');
    setUrl(server?.url ?? '');
    setKey('');
    setSubmitted(false);
    save.reset();
    remove.reset();
    setEditing(true);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (nameError || urlError || save.isPending) return;
    // An empty key field keeps the key already stored; a typed one replaces it.
    save.mutate(
      { name: name.trim(), url: url.trim(), ...(key ? { api_key: key } : {}) },
      {
        onSuccess: () => {
          setKey('');
          setEditing(false);
        },
      },
    );
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
              An MCP (Model Context Protocol) server gives Lam13 access to your own tools and data, such as an internal system or a service that has no
              built-in integration. Add its URL and, if it needs one, an API key.
            </p>
          </div>
        </div>
        {!editing &&
          (query.isPending ? (
            <Skeleton className="h-9 w-36" />
          ) : query.isError ? (
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              Try again
            </Button>
          ) : server ? (
            <p className="flex items-center gap-2 text-xs text-fg">
              <span aria-hidden className="size-1.5 rounded-full bg-accent" />
              Saved
            </p>
          ) : (
            <Button variant="outline" size="sm" onClick={startEditing}>
              Add custom server
            </Button>
          ))}
      </div>

      {query.isError && !editing && (
        <p role="alert" className="mt-4 text-xs text-danger sm:pl-[3.125rem]">
          Couldn&apos;t load your custom server.
        </p>
      )}

      {server && !editing && (
        <div className="mt-4 border-t border-hairline pt-4 sm:pl-[3.125rem]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{server.name}</p>
              <p className="truncate text-xs text-fg-muted">
                {server.url}
                {server.has_api_key && ' · API key saved'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={startEditing}>
                Edit
              </Button>
              <Button variant="outline" size="sm" aria-label={`Remove ${server.name}`} disabled={remove.isPending} onClick={() => remove.mutate()}>
                Remove
              </Button>
            </div>
          </div>
          <p className="mt-3 text-2xs leading-relaxed text-fg-muted">Saved to your account. Lam13 does not use this server&apos;s tools in chats yet.</p>
          {remove.isError && (
            <p role="alert" className="mt-2 text-xs text-danger">
              Couldn&apos;t remove the server. {toErrorInfo(remove.error).message}
            </p>
          )}
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
              maxLength={200}
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
              placeholder={server?.has_api_key ? 'Leave empty to keep the saved key' : 'Leave empty if the server needs none'}
              // Not "off": browsers ignore it on a password field and fill the saved sign-in into this and the URL above.
              autoComplete="new-password"
              spellCheck={false}
              aria-describedby={`${id}-key-help`}
              className={FIELD}
            />
            <p id={`${id}-key-help`} className="mt-1.5 text-2xs leading-relaxed text-fg-muted">
              The key is stored encrypted with your account and is never shown again.
            </p>
          </div>
          {failure && (
            <p role="alert" className="text-xs text-danger">
              Couldn&apos;t save the server. {toErrorInfo(failure).message}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={save.isPending} leadingIcon={save.isPending ? <Spinner size={14} state="active" /> : undefined}>
              Save server
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
