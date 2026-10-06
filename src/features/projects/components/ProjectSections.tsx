import { ArrowLeft, CalendarDays, ChevronRight, FileText, Link2, StickyNote, User, X } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { Button, Drawer, IconButton, Spinner, iconProps, smallIconProps } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { Project, ProjectContextSource } from '@/types/api';
import { useSaveInstructions } from '../hooks/useProjects';

/** A tab strip with arrow-key movement (roving tabindex). The caller renders the panel with `panelProps`. */
export function Tabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
  counts = {},
  id,
  className,
}: {
  label: string;
  tabs: readonly T[];
  value: T;
  onChange: (tab: T) => void;
  counts?: Partial<Record<T, number>>;
  /** Prefix shared with the panel: tab ids are `${id}-${index}`, the panel is `${id}-panel`. */
  id: string;
  className?: string;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (tabs.indexOf(value) + step + tabs.length) % tabs.length;
    onChange(tabs[next]!);
    document.getElementById(`${id}-${next}`)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={cn('scrollbar-subtle flex gap-1 overflow-x-auto border-b border-hairline', className)}>
      {tabs.map((t, i) => (
        <button
          key={t}
          id={`${id}-${i}`}
          type="button"
          role="tab"
          aria-selected={value === t}
          aria-controls={`${id}-panel`}
          tabIndex={value === t ? 0 : -1}
          onClick={() => onChange(t)}
          className={cn(
            '-mb-px flex h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-nav outline-offset-[-2px] transition-colors duration-150 ease-standard md:h-10',
            value === t ? 'border-fg font-bold text-fg' : 'border-transparent text-fg-muted hover:text-fg',
          )}
        >
          {t}
          {counts[t] !== undefined && <span className="text-2xs tabular-nums text-fg-muted">{counts[t]}</span>}
        </button>
      ))}
    </div>
  );
}

/** ARIA for the panel that belongs to a `Tabs` strip with the same `id`. */
export const tabPanelProps = <T extends string>(id: string, tabs: readonly T[], value: T) =>
  ({ id: `${id}-panel`, role: 'tabpanel', 'aria-labelledby': `${id}-${tabs.indexOf(value)}` }) as const;

const SOURCE_TYPES: Record<ProjectContextSource['type'], { label: string; group: string; Icon: typeof User }> = {
  file: { label: 'File', group: 'Files', Icon: FileText },
  meeting: { label: 'Meeting notes', group: 'Meeting notes', Icon: CalendarDays },
  contact: { label: 'Contact', group: 'Contacts', Icon: User },
  note: { label: 'Note', group: 'Notes and links', Icon: StickyNote },
  link: { label: 'Link', group: 'Notes and links', Icon: Link2 },
};
const GROUP_ORDER = ['Files', 'Meeting notes', 'Contacts', 'Notes and links'];

const EXAMPLE = 'Use the attached strategy documents as the primary source. Answer in structured sections and flag unsupported assumptions.';

/** How Lam should work in this project: an editable text, saved explicitly. */
export function Instructions({ project }: { project: Project }) {
  const save = useSaveInstructions(project.id);
  const [draft, setDraft] = useState(project.instructions);
  const id = useId();
  const dirty = draft !== project.instructions;
  const status = save.isPending ? 'Saving…' : save.isError ? "Couldn't save. Try again." : dirty ? 'Unsaved changes' : 'Saved';
  return (
    <form
      className="flex max-w-[46rem] flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty) save.mutate(draft);
      }}
    >
      <p id={`${id}-help`} className="text-sm leading-relaxed text-fg-muted">
        Instructions tell Lam how to work within this project. They apply whenever you chat in this project.
      </p>
      <label htmlFor={id} className="sr-only">
        Project instructions
      </label>
      <textarea
        id={id}
        aria-describedby={`${id}-help`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={8}
        placeholder="Describe how Lam should work in this project…"
        className="scrollbar-subtle min-h-40 w-full resize-y rounded-card border border-border bg-bg p-3.5 text-base leading-relaxed text-fg outline-none transition-colors duration-150 ease-standard placeholder:text-fg-muted focus:border-composer-focus focus:ring-1 focus:ring-composer-ring focus-visible:outline-none sm:text-sm"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" size="sm" disabled={!dirty || save.isPending} leadingIcon={save.isPending ? <Spinner size={14} state="active" /> : undefined}>
          Save instructions
        </Button>
        {dirty && !save.isPending && (
          <Button variant="ghost" size="sm" onClick={() => setDraft(project.instructions)}>
            Discard
          </Button>
        )}
        <p role="status" className={cn('flex items-center gap-2 text-xs', save.isError ? 'text-danger' : 'text-fg-muted')}>
          <span aria-hidden="true" className={cn('size-1.5 rounded-full', dirty || save.isError ? 'bg-fg-muted' : 'bg-accent')} />
          {status}
        </p>
      </div>
      <div className="rounded-card border border-hairline bg-bg-subtle p-3.5">
        <p className="eyebrow">Example</p>
        <p className="mt-1.5 text-sm leading-relaxed">“{EXAMPLE}”</p>
        <p className="mt-2 text-2xs text-fg-muted">
          Instructions describe how Lam should work. The material Lam works from — files, meeting notes, contacts — lives under Context and Archives.
        </p>
      </div>
    </form>
  );
}

function SourcePreview({ source }: { source: ProjectContextSource }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-fg-muted">{source.detail}</p>
      <div>
        <p className="eyebrow mb-1.5">What Lam reads</p>
        <p className="text-sm leading-relaxed">{source.summary}</p>
      </div>
      <p className="border-t border-hairline pt-4 text-2xs leading-relaxed text-fg-muted">
        Sample data: this preview shows a summary only. Opening the original is not connected yet.
      </p>
    </div>
  );
}

/**
 * The information Lam draws on in this project; picking a source opens its preview — in a side sheet on
 * the project page, or in place (`inline`) when this already sits inside a panel.
 */
export function Context({ project, inline = false }: { project: Project; inline?: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = project.sources.find((s) => s.id === openId);
  const groups = GROUP_ORDER.map((group) => ({ group, sources: project.sources.filter((s) => SOURCE_TYPES[s.type].group === group) })).filter(
    (g) => g.sources.length > 0,
  );

  if (inline && open) {
    return (
      <section aria-label={`${open.title} preview`} className="flex flex-col gap-4">
        <div>
          <Button variant="ghost" size="sm" leadingIcon={<ArrowLeft {...smallIconProps} />} onClick={() => setOpenId(null)} autoFocus>
            All context
          </Button>
        </div>
        <div>
          <p className="eyebrow">{SOURCE_TYPES[open.type].label}</p>
          <h3 className="mt-1 text-sm font-bold">{open.title}</h3>
        </div>
        <SourcePreview source={open} />
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-[46rem] text-sm leading-relaxed text-fg-muted">
        Context is the information Lam can draw on in this project: files, meeting notes, contacts and other sources. Instructions tell Lam how to use
        that information.
      </p>
      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-hairline-strong px-6 py-14 text-center">
          <h2 className="text-base font-bold">No context yet.</h2>
          <p className="max-w-[44ch] text-sm leading-relaxed text-fg-muted">Files, meeting notes and contacts linked to this project will appear here.</p>
        </div>
      ) : (
        groups.map(({ group, sources }) => (
          <section key={group} aria-label={group}>
            <h2 className="eyebrow mb-1 px-2">{group}</h2>
            <ul>
              {sources.map((source) => {
                const { Icon } = SOURCE_TYPES[source.type];
                return (
                  <li key={source.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(source.id)}
                      className="flex min-h-11 w-full items-center gap-3 border-b border-hairline px-2 py-3 text-left outline-offset-[-2px] transition-colors duration-150 ease-standard hover:bg-fg/[0.035]"
                    >
                      <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-card bg-muted text-fg">
                        <Icon {...smallIconProps} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{source.title}</span>
                        <span className="block truncate text-xs text-fg-muted">{source.detail}</span>
                      </span>
                      <ChevronRight {...smallIconProps} className="shrink-0 text-fg-muted" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {!inline && (
        <Drawer open={Boolean(open)} onClose={() => setOpenId(null)} label={open ? `${open.title} preview` : 'Preview'} side="right">
          {open && (
            <div className="flex h-full w-full flex-col">
              <header className="flex h-[var(--header-h)] shrink-0 items-center gap-3 border-b border-hairline pl-5 pr-3">
                <div className="min-w-0 flex-1">
                  <p className="eyebrow">{SOURCE_TYPES[open.type].label}</p>
                  <h2 className="truncate text-body font-bold">{open.title}</h2>
                </div>
                <IconButton label="Close preview" size="md" icon={<X {...iconProps} />} onClick={() => setOpenId(null)} />
              </header>
              <div className="p-5">
                <SourcePreview source={open} />
              </div>
            </div>
          )}
        </Drawer>
      )}
    </div>
  );
}
