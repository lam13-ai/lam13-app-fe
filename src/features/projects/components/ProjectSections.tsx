import { Pencil } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { toErrorInfo } from '@/api';
import { Button, Spinner, smallIconProps } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { Project } from '@/types/api';
import { useProjectAction, useSaveInstructions } from '../hooks/useProjects';

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
        <p className="mt-2 text-2xs text-fg-muted">Instructions describe how Lam should work. The files Lam works from live under Archives.</p>
      </div>
    </form>
  );
}

/**
 * The project's summary: plain text written by its people (the backend's `summary`, here `description`).
 * Shown as written; "Edit summary" turns it into a text box, saved explicitly like the instructions.
 */
export function Summary({ project }: { project: Project }) {
  const action = useProjectAction(project.id);
  // null = reading; a string = the text being edited.
  const [draft, setDraft] = useState<string | null>(null);
  const id = useId();

  if (draft === null) {
    return (
      <div className="flex flex-col items-start gap-4">
        {project.description ? (
          <p className="max-w-[70ch] whitespace-pre-wrap text-sm leading-relaxed">{project.description}</p>
        ) : (
          <p className="text-sm text-fg-muted">This project has no summary yet.</p>
        )}
        <Button
          variant="outline"
          size="sm"
          leadingIcon={<Pencil {...smallIconProps} />}
          onClick={() => {
            action.reset();
            setDraft(project.description);
          }}
        >
          Edit summary
        </Button>
      </div>
    );
  }

  const dirty = draft.trim() !== project.description;
  return (
    <form
      className="flex max-w-[46rem] flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && !action.isPending) action.mutate((projects) => projects.saveSummary(project.id, draft.trim()), { onSuccess: () => setDraft(null) });
      }}
    >
      <label htmlFor={id} className="sr-only">
        Project summary
      </label>
      <textarea
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={8}
        maxLength={20000}
        autoFocus
        placeholder="What this project is about, in plain text…"
        className="scrollbar-subtle min-h-40 w-full resize-y rounded-card border border-border bg-bg p-3.5 text-base leading-relaxed text-fg outline-none transition-colors duration-150 ease-standard placeholder:text-fg-muted focus:border-composer-focus focus:ring-1 focus:ring-composer-ring focus-visible:outline-none sm:text-sm"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" size="sm" disabled={!dirty || action.isPending} leadingIcon={action.isPending ? <Spinner size={14} state="active" /> : undefined}>
          Save summary
        </Button>
        <Button variant="ghost" size="sm" disabled={action.isPending} onClick={() => setDraft(null)}>
          Cancel
        </Button>
        {(action.isPending || action.isError) && (
          <p role="status" className={cn('text-xs', action.isError ? 'text-danger' : 'text-fg-muted')}>
            {action.isPending ? 'Saving…' : `Couldn't save. ${toErrorInfo(action.error).message}`}
          </p>
        )}
      </div>
    </form>
  );
}
