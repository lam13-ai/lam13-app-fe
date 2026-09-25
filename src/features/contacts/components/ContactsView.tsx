import { ArrowDownUp, Menu as MenuIcon, Plus, Search } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { ErrorState } from '@/components/ErrorState';
import { ScrollArea } from '@/components/ScrollArea';
import { Button, IconButton, Menu, MenuItem, Popover, Skeleton, VisuallyHidden, iconProps, smallIconProps } from '@/components/ui';
import { useUiStore } from '@/stores/uiStore';
import type { ProfileUpdateSuggestion } from '@/types/api';
import { usePendingSuggestions, useProfiles } from '../hooks/useContacts';
import { filterContacts, type ContactSort } from '../lib/contacts';
import { ContactCard } from './ContactCard';
import { ContactSheet, type SheetState } from './ContactSheet';

const SORTS: { value: ContactSort; label: string }[] = [
  { value: 'all', label: 'All contacts' },
  { value: 'recent', label: 'Recently updated' },
];

const NO_SUGGESTIONS: ProfileUpdateSuggestion[] = [];

function SortMenu({ sort, onChange }: { sort: ContactSort; onChange: (sort: ContactSort) => void }) {
  const current = SORTS.find((s) => s.value === sort)!;
  return (
    <Popover
      placement="bottom-end"
      trigger={(props) => (
        <Button {...props} variant="outline" size="sm" leadingIcon={<ArrowDownUp {...smallIconProps} />} aria-label={`Sort: ${current.label}`}>
          <span className="max-sm:sr-only">{current.label}</span>
        </Button>
      )}
    >
      <Menu label="Sort contacts">
        {SORTS.map((s) => (
          <MenuItem key={s.value} checked={s.value === sort} onSelect={() => onChange(s.value)}>
            {s.label}
          </MenuItem>
        ))}
      </Menu>
    </Popover>
  );
}

function GridSkeleton() {
  return (
    <div role="status" aria-label="Loading contacts" className="grid grid-cols-1 gap-3 @lg:grid-cols-2 @4xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 border border-hairline p-4">
          <div className="flex gap-3">
            <Skeleton className="size-10" />
            <div className="flex flex-1 flex-col gap-2 pt-0.5">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

/** `/contacts`: header, search + sort, the contact grid, and the contact sheet. */
export function ContactsView() {
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const profiles = useProfiles();
  const pending = usePendingSuggestions();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ContactSort>('all');
  const [sheet, setSheet] = useState<SheetState>({ open: false, mode: 'view', profileId: null, seq: 0 });

  const pendingByProfile = useMemo(() => {
    const map = new Map<string, ProfileUpdateSuggestion[]>();
    for (const s of pending.data ?? []) map.set(s.profile_id, [...(map.get(s.profile_id) ?? []), s]);
    return map;
  }, [pending.data]);
  const all = profiles.data;
  const visible = useMemo(() => filterContacts(all ?? [], query, sort), [all, query, sort]);

  const open = (patch: Pick<SheetState, 'mode' | 'profileId'>) => setSheet((s) => ({ ...patch, open: true, seq: s.seq + 1 }));
  const openCreate = () => open({ mode: 'create', profileId: null });
  // Stable: the sheet's focus handling re-runs when onClose changes.
  const close = useCallback(() => setSheet((s) => ({ ...s, open: false, focusEdit: false })), []);

  let body;
  if (profiles.isPending) {
    body = <GridSkeleton />;
  } else if (profiles.isError) {
    body = (
      <ErrorState
        title="Couldn't load your contacts."
        description="Check your connection and try again."
        action={{ label: 'Try again', onClick: () => void profiles.refetch() }}
        className="py-16"
      />
    );
  } else if (all?.length === 0) {
    body = (
      <div className="flex flex-col items-center gap-4 px-6 py-20 text-center">
        <p className="eyebrow">My Contacts</p>
        <h2 className="text-base font-bold">No contacts yet.</h2>
        <p className="max-w-[40ch] text-sm leading-relaxed text-fg-muted">
          Add people you work with and keep approved notes about them in one place.
        </p>
        <Button variant="primary" size="md" leadingIcon={<Plus {...iconProps} />} onClick={openCreate} className="mt-1">
          Add contact
        </Button>
      </div>
    );
  } else {
    body = (
      <>
        <div className="mb-4 flex items-center gap-2">
          <label className="relative flex min-w-0 flex-1 items-center">
            <VisuallyHidden>Search contacts</VisuallyHidden>
            <Search {...iconProps} className="pointer-events-none absolute left-3 text-fg-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search contacts"
              className="h-11 w-full border border-border bg-bg pl-9 pr-3 text-base text-fg outline-none transition-colors duration-150 ease-standard placeholder:text-fg-muted focus-visible:outline-none focus:border-composer-focus focus:ring-1 focus:ring-composer-ring sm:text-sm md:h-10"
            />
          </label>
          <SortMenu sort={sort} onChange={setSort} />
        </div>
        <p aria-live="polite" className="sr-only">
          {query.trim() ? `${visible.length} of ${all?.length ?? 0} contacts` : ''}
        </p>
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="text-sm">No contacts match “{query.trim()}”.</p>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="min-h-11 text-xs font-bold underline-offset-4 hover:underline md:min-h-0"
            >
              Clear search
            </button>
          </div>
        ) : (
          <ul aria-label="Contacts" className="grid grid-cols-1 gap-3 @lg:grid-cols-2 @4xl:grid-cols-3">
            {visible.map((p) => (
              <li key={p.id} className="flex">
                <ContactCard
                  profile={p}
                  pendingCount={pendingByProfile.get(p.id)?.length ?? 0}
                  onOpen={() => open({ mode: 'view', profileId: p.id })}
                />
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <section
      aria-labelledby="contacts-heading"
      className="flex h-full min-h-0 flex-col overflow-hidden bg-bg md:rounded-card md:border md:border-frame md:shadow-card"
    >
      <header className="bright-chrome flex h-[var(--header-h)] shrink-0 items-center gap-3 border-b border-hairline px-3 md:px-5">
        <IconButton
          label="Open sidebar"
          size="md"
          icon={<MenuIcon {...iconProps} />}
          onClick={() => setSidebarOpen(true)}
          className="md:hidden"
        />
        <div className="min-w-0 flex-1">
          <h1 id="contacts-heading" className="truncate text-body font-bold leading-5">
            My Contacts
          </h1>
          <p className="hidden truncate text-2xs text-fg-muted sm:block">People you work with and insights you&apos;ve approved.</p>
        </div>
        {/* The empty state has its own primary Add contact. */}
        {all?.length !== 0 && (
          <Button variant="primary" size="sm" leadingIcon={<Plus {...smallIconProps} />} onClick={openCreate}>
            Add contact
          </Button>
        )}
      </header>

      <ScrollArea className="@container min-h-0 flex-1 px-3 py-4 md:px-6 md:py-6">
        <div className="mx-auto w-full max-w-[1120px]">{body}</div>
      </ScrollArea>

      <ContactSheet
        state={sheet}
        profile={all?.find((p) => p.id === sheet.profileId)}
        suggestions={(sheet.profileId && pendingByProfile.get(sheet.profileId)) || NO_SUGGESTIONS}
        onChange={(patch) => setSheet((s) => ({ ...s, ...patch }))}
        onClose={close}
      />
    </section>
  );
}
