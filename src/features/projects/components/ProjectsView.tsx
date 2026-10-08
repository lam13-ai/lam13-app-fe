import { FolderKanban, Plus } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router';
import { toErrorInfo } from '@/api';
import { ErrorState } from '@/components/ErrorState';
import { PageFrame } from '@/components/PageFrame';
import { Button, Skeleton, Spinner, smallIconProps, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatRelativeTime } from '@/lib/format';
import type { ProjectSummary } from '@/types/api';
import { useCreateProject, useProjects } from '../hooks/useProjects';
import { ACCEPT } from './Archives';
import { FIELD } from './ProjectForms';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <Link
      to={`/projects/${project.id}`}
      className="group flex h-full flex-col gap-3 rounded-card border border-border bg-bg p-4 outline-offset-2 transition-[border-color,box-shadow] duration-150 ease-standard hover:border-fg/30 hover:shadow-card"
    >
      <span className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-card bg-accent-wash text-accent">
          <FolderKanban size={18} strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{project.name}</span>
          <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-muted">{project.description}</span>
        </span>
      </span>
      <span className="mt-auto flex items-center justify-between gap-3 border-t border-hairline pt-3 text-2xs text-fg-muted">
        <span>
          {/* Counts when the service gives them; otherwise whose project it is. */}
          {project.chat_count !== undefined && project.file_count !== undefined
            ? `${plural(project.chat_count, 'chat')} · ${plural(project.file_count, 'file')}`
            : project.role === 'member'
              ? 'Shared with you'
              : 'Your project'}
        </span>
        <span className="shrink-0 tabular-nums">Updated {formatRelativeTime(project.updated_at)}</span>
      </span>
    </Link>
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LABEL = 'mb-1.5 block text-xs font-bold';
const OPTIONAL = <span className="font-medium text-fg-muted">(optional)</span>;

/**
 * The new project's name, and optionally its instructions, files and people. Creating it opens it; a file
 * or a person the backend refuses is named in a message, and the project is still created.
 */
function NewProjectForm({ onClose }: { onClose: () => void }) {
  const create = useCreateProject();
  const navigate = useNavigate();
  const toast = useToast();
  const id = useId();
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [people, setPeople] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const emails = [...new Set(people.split(/[\s,;]+/).filter(Boolean))];
  const badEmail = emails.find((email) => !EMAIL.test(email));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!name.trim() || badEmail || create.isPending) return;
    create.mutate(
      { name: name.trim(), instructions: instructions.trim(), files, emails },
      {
        onSuccess: ({ project, failed }) => {
          if (failed.length > 0) toast.show(`The project was created, but not everything was added. ${failed.join(' · ')}`, { tone: 'danger' });
          onClose();
          void navigate(`/projects/${project.id}`);
        },
      },
    );
  };
  return (
    <form noValidate onSubmit={submit} aria-labelledby={`${id}-title`} className="flex flex-col gap-5 p-5 text-left sm:p-7">
      <div>
        <h2 id={`${id}-title`} className="text-base font-bold">
          New project
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">Name it, then add what Lam should know. Everything but the name can also be added later.</p>
      </div>
      <div>
        <label htmlFor={`${id}-name`} className={LABEL}>
          Project name
        </label>
        <input
          id={`${id}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. National Water Security Strategy"
          maxLength={200}
          autoComplete="off"
          autoFocus
          className={FIELD}
        />
      </div>
      <div>
        <label htmlFor={`${id}-instructions`} className={LABEL}>
          Instructions {OPTIONAL}
        </label>
        <textarea
          id={`${id}-instructions`}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="How Lam should work in this project"
          className={cn(FIELD, 'h-44! resize-y py-2.5 leading-relaxed md:h-44!')}
        />
      </div>
      <div className="border-t border-hairline pt-5">
        <label htmlFor={`${id}-files`} className={LABEL}>
          Archives {OPTIONAL}
        </label>
        <input
          id={`${id}-files`}
          type="file"
          multiple
          accept={ACCEPT}
          onChange={(e) => setFiles([...(e.target.files ?? [])])}
          aria-describedby={`${id}-files-hint`}
          className="block w-full text-xs text-fg-muted file:mr-3 file:h-9 file:cursor-pointer file:rounded-card file:border file:border-solid file:border-border file:bg-bg file:px-3 file:text-xs file:font-bold file:text-fg"
        />
        <p id={`${id}-files-hint`} className="mt-1.5 text-2xs leading-relaxed text-fg-muted">
          {files.length > 0 ? `${files.length} file${files.length === 1 ? '' : 's'} will be added to Archives.` : 'PDF, DOCX, PPTX or images, up to 50 MB each.'}
        </p>
      </div>
      <div className="border-t border-hairline pt-5">
        <label htmlFor={`${id}-people`} className={LABEL}>
          Team &amp; Contacts {OPTIONAL}
        </label>
        <input
          id={`${id}-people`}
          value={people}
          onChange={(e) => setPeople(e.target.value)}
          placeholder="name@company.com, name@company.com"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={submitted && Boolean(badEmail)}
          aria-describedby={`${id}-people-hint`}
          className={FIELD}
        />
        <p id={`${id}-people-hint`} role={submitted && badEmail ? 'alert' : undefined} className={cn('mt-1.5 text-2xs leading-relaxed', submitted && badEmail ? 'text-danger' : 'text-fg-muted')}>
          {submitted && badEmail ? `"${badEmail}" is not a valid email address.` : 'Emails of people who already have a Lam13 account, separated by commas.'}
        </p>
      </div>
      {create.isError && (
        <p role="alert" className="text-xs text-danger">
          {toErrorInfo(create.error).message}
        </p>
      )}
      <div className="flex flex-wrap gap-2 border-t border-hairline pt-5">
        <Button type="submit" variant="primary" disabled={!name.trim() || create.isPending} leadingIcon={create.isPending ? <Spinner size={14} state="active" /> : undefined}>
          {create.isPending ? 'Creating…' : 'Create project'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/**
 * The form as a wide, centred dialog over the page (the whole viewport on a phone, with a margin). Escape
 * or a click on the dimmed page closes it; Tab stays inside it; the page behind scrolls it when it is taller
 * than the window.
 */
function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const keepFocusInside = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const stops = [...(panel.current?.querySelectorAll<HTMLElement>('input, textarea, button:not(:disabled)') ?? [])];
    const first = stops[0];
    const last = stops.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex overflow-y-auto bg-scrim p-3 sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="New project"
        onKeyDown={keepFocusInside}
        className="soft-ink m-auto w-full max-w-3xl rounded-card border border-border bg-bg shadow-popover"
      >
        <NewProjectForm onClose={onClose} />
      </div>
    </div>,
    document.body,
  );
}

/** "New project": name, instructions, files and people; creates it (the user becomes its owner) and opens it. */
function NewProjectButton({ compact = false }: { compact?: boolean }) {
  // The form is mounted only while its dialog is open: each "New project" starts empty.
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    button.current?.focus(); // back to where the dialog was opened from
  };
  return (
    <>
      <Button
        ref={button}
        variant="primary"
        size={compact ? 'sm' : undefined}
        aria-label="New project"
        aria-haspopup="dialog"
        leadingIcon={<Plus {...smallIconProps} />}
        onClick={() => setOpen(true)}
      >
        <span className={compact ? 'max-sm:sr-only' : undefined}>New project</span>
      </Button>
      {open && <NewProjectDialog onClose={close} />}
    </>
  );
}

/** `/projects`: the user's projects — each keeps its chats, context and archived files together. */
export function ProjectsView() {
  const projects = useProjects();

  let body;
  if (projects.isPending) {
    body = (
      <div role="status" aria-label="Loading projects" className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36" />
        ))}
      </div>
    );
  } else if (projects.isError) {
    body = (
      <ErrorState
        title="Couldn't load your projects."
        description="Check your connection and try again."
        action={{ label: 'Try again', onClick: () => void projects.refetch() }}
        className="py-16"
      />
    );
  } else if (projects.data.length === 0) {
    body = (
      <div className="flex flex-col items-center gap-4 px-6 py-20 text-center">
        <p className="eyebrow">Projects</p>
        <h2 className="text-base font-bold">No projects yet.</h2>
        <p className="max-w-[44ch] text-sm leading-relaxed text-fg-muted">
          A project keeps related chats, instructions and files together, so Lam always has the right context.
        </p>
        <NewProjectButton />
      </div>
    );
  } else {
    body = (
      <ul aria-label="Projects" className="grid gap-3 sm:grid-cols-2">
        {projects.data.map((p) => (
          <li key={p.id}>
            <ProjectCard project={p} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <PageFrame
      title="Projects"
      subtitle="Chats, context and files for each piece of work, in one place."
      wide
      actions={<NewProjectButton compact />}
    >
      {body}
    </PageFrame>
  );
}
