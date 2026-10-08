import { FolderKanban, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { ErrorState } from '@/components/ErrorState';
import { PageFrame } from '@/components/PageFrame';
import { Button, Popover, Skeleton, smallIconProps } from '@/components/ui';
import { formatRelativeTime } from '@/lib/format';
import type { ProjectSummary } from '@/types/api';
import { useCreateProject, useProjects } from '../hooks/useProjects';
import { NameForm } from './ProjectForms';

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

/** "New project": asks for its name, creates it (the user becomes its owner) and opens it. */
function NewProjectButton({ compact = false }: { compact?: boolean }) {
  const create = useCreateProject();
  const navigate = useNavigate();
  return (
    <Popover
      placement={compact ? 'bottom-end' : 'bottom-start'}
      kind="dialog"
      className="w-[min(20rem,calc(100vw-1.5rem))]"
      trigger={(props) => (
        <Button {...props} variant="primary" size={compact ? 'sm' : undefined} aria-label="New project" leadingIcon={<Plus {...smallIconProps} />}>
          <span className={compact ? 'max-sm:sr-only' : undefined}>New project</span>
        </Button>
      )}
    >
      <NameForm
        title="New project"
        label="Project name"
        placeholder="e.g. National Water Security Strategy"
        submitLabel="Create project"
        hint="You can add instructions, files and your team once it is created."
        onSubmit={(name) => create.mutateAsync({ name }).then((project) => void navigate(`/projects/${project.id}`))}
      />
    </Popover>
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
