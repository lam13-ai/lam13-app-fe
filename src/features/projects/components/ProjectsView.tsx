import { FolderKanban, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { ErrorState } from '@/components/ErrorState';
import { PageFrame } from '@/components/PageFrame';
import { Button, Skeleton, smallIconProps, useToast } from '@/components/ui';
import { formatRelativeTime } from '@/lib/format';
import type { ProjectSummary } from '@/types/api';
import { useProjects } from '../hooks/useProjects';

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
          {plural(project.chat_count, 'chat')} · {plural(project.file_count, 'file')}
        </span>
        <span className="shrink-0 tabular-nums">Updated {formatRelativeTime(project.updated_at)}</span>
      </span>
    </Link>
  );
}

/** `/projects`: the user's projects — each keeps its chats, context and archived files together. */
export function ProjectsView() {
  const projects = useProjects();
  const toast = useToast();
  // TODO(backend): creating a project needs an endpoint; the button only says so for now.
  const create = () => toast.show('Creating projects is coming soon.');

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
        <Button variant="primary" leadingIcon={<Plus {...smallIconProps} />} onClick={create}>
          New project
        </Button>
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
      actions={
        <Button variant="primary" size="sm" leadingIcon={<Plus {...smallIconProps} />} onClick={create}>
          <span className="max-sm:sr-only">New project</span>
        </Button>
      }
    >
      {body}
    </PageFrame>
  );
}
