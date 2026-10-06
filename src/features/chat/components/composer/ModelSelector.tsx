import { Check, ChevronDown, Search } from 'lucide-react';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { SparkleGlyph } from '@/components/AgentMark';
import { BrandLogo } from '@/components/BrandLogo';
import { Menu, Popover, smallIconProps, usePopover } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/stores/uiStore';
import { MODEL_PROVIDERS, findModel, type ModelProvider } from '../../models';

function ProviderMark({ provider, size }: { provider: ModelProvider; size: number }) {
  if (provider.brand) return <BrandLogo brand={provider.brand} size={size} />;
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-[5px] text-white [background:var(--gradient-accent)]"
      style={{ width: size, height: size }}
    >
      <SparkleGlyph size={Math.round(size * 0.55)} />
    </span>
  );
}

function ModelList({
  selectedId,
  onSelect,
  query,
  setQuery,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  query: string;
  setQuery: (query: string) => void;
}) {
  const popover = usePopover();
  const searchRef = useRef<HTMLInputElement>(null);
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MODEL_PROVIDERS;
    // A provider's name matches all of its models; otherwise only the models that match.
    return MODEL_PROVIDERS.map((p) => (p.name.toLowerCase().includes(q) ? p : { ...p, models: p.models.filter((m) => m.name.toLowerCase().includes(q)) })).filter(
      (p) => p.models.length > 0,
    );
  }, [query]);

  // Typing anywhere in the list goes to the search field; ArrowDown from the field enters the list.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const input = searchRef.current;
    if (!input) return;
    if (e.target === input) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.currentTarget.querySelector<HTMLElement>('[role="menuitemradio"]')?.focus();
      }
      return;
    }
    if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) input.focus();
  };

  return (
    <div onKeyDown={onKeyDown}>
      <label className="relative mb-1 flex items-center">
        <span className="sr-only">Search models</span>
        <Search {...smallIconProps} className="pointer-events-none absolute left-2.5 text-fg-muted" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search models"
          className="h-10 w-full rounded-card bg-muted pl-8 pr-2.5 text-base text-fg outline-none placeholder:text-fg-muted focus-visible:outline-none focus:ring-1 focus:ring-composer-ring sm:text-xs md:h-8"
        />
      </label>
      <Menu label="Model" className="scrollbar-subtle max-h-[min(21rem,52vh)] gap-0 overflow-y-auto overscroll-contain pr-0.5">
        {groups.length === 0 && <p className="px-2.5 py-6 text-center text-xs text-fg-muted">No models match “{query.trim()}”.</p>}
        {groups.map((provider) => (
          <div key={provider.id} role="group" aria-label={provider.name} className="pt-1.5">
            <p aria-hidden="true" className="flex items-center gap-2 px-2.5 pb-1 text-2xs font-bold text-fg-muted">
              <ProviderMark provider={provider} size={16} />
              {provider.name}
            </p>
            {provider.models.map((model) => {
              const selected = model.id === selectedId;
              return (
                <button
                  key={model.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  tabIndex={-1}
                  onClick={() => {
                    onSelect(model.id);
                    popover?.close();
                  }}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-2 rounded-card py-1.5 pl-[2.125rem] pr-2.5 text-left outline-none transition-colors duration-150 ease-standard md:min-h-8',
                    'hover:bg-muted focus-visible:bg-muted active:scale-[0.99]',
                    selected && 'bg-accent-wash',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-xs text-fg', selected ? 'font-bold' : 'font-medium')}>{model.name}</span>
                    {model.note && <span className="block truncate text-2xs text-fg-muted">{model.note}</span>}
                  </span>
                  {selected && <Check {...smallIconProps} className="shrink-0 text-accent" />}
                </button>
              );
            })}
          </div>
        ))}
      </Menu>
      {/* The choice is not sent to the backend yet: say so, rather than imply these models answer. */}
      <p className="mt-1.5 border-t border-hairline px-2.5 pt-2 text-2xs leading-snug text-fg-muted">
        Preview: Lam answers every message for now. Other models are not connected yet.
      </p>
    </div>
  );
}

/** The composer's model choice: a quiet pill that opens a searchable list of models, grouped by provider. */
export function ModelSelector() {
  const { provider, model } = findModel(useUiStore((s) => s.model));
  const setModel = useUiStore((s) => s.setModel);
  // The search starts empty every time the list opens.
  const [query, setQuery] = useState('');
  return (
    <Popover
      placement="top-end"
      anchor="container"
      onOpenChange={(open) => {
        if (!open) setQuery('');
      }}
      className="w-[min(19rem,calc(100vw-2rem))]"
      trigger={(props) => (
        <button
          {...props}
          type="button"
          aria-label={`Model: ${model.name}`}
          className={cn(
            'group hit-area relative inline-flex h-9 min-w-0 shrink select-none items-center gap-1.5 rounded-full pl-2 pr-2 text-xs font-bold text-icon',
            'transition-colors duration-200 ease-standard hover:bg-accent-wash hover:text-fg aria-expanded:bg-accent-wash aria-expanded:text-fg',
          )}
        >
          <ProviderMark provider={provider} size={18} />
          <span key={model.id} className="max-w-[4.5rem] animate-enter-sm truncate sm:max-w-[11rem]">
            {model.name}
          </span>
          <ChevronDown {...smallIconProps} size={14} className="shrink-0 transition-transform duration-200 group-aria-expanded:rotate-180" />
        </button>
      )}
    >
      <ModelList selectedId={model.id} onSelect={setModel} query={query} setQuery={setQuery} />
    </Popover>
  );
}
