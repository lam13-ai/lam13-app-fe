import { ArrowLeft, MoreHorizontal, Pencil, SquarePen, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { isApiError } from '@/api';
import { ErrorState } from '@/components/ErrorState';
import { PageFrame } from '@/components/PageFrame';
import { Button, IconButton, Menu, MenuItem, Popover, Skeleton, iconProps, smallIconProps } from '@/components/ui';
import type { Project } from '@/types/api';
import { useDeleteProject, useProject, useProjectAction } from '../hooks/useProjects';
import { Archives } from './Archives';
import { TeamAndContacts } from './TeamAndContacts';
import { ProjectChatList, projectNewChatPath } from './ProjectChatList';
import { ConfirmPanel, NameForm } from './ProjectForms';
import { Instructions, Tabs, tabPanelProps } from './ProjectSections';

const TABS = ['Chats', 'Instructions', 'Archives', 'Teams & Contacts', 'Summary'] as const;
type Tab = (typeof TABS)[number];

/** The owner's menu on the project page: rename it, or delete it (confirmed, naming what goes with it). */
function ProjectMenu({ project }: { project: Project }) {
  const [view, setView] = useState<'menu' | 'rename' | 'delete'>('menu');
  const action = useProjectAction(project.id);
  const remove = useDeleteProject();
  const navigate = useNavigate();
  return (
    <Popover
      placement="bottom-end"
      kind="dialog"
      className={view === 'menu' ? 'w-56' : 'w-[min(20rem,calc(100vw-1.5rem))]'}
      onOpenChange={(open) => {
        if (!open) setView('menu');
      }}
      trigger={(props) => <IconButton {...props} label="Project options" size="md" icon={<MoreHorizontal {...iconProps} />} />}
    >
      {view === 'menu' ? (
        <Menu label="Project options">
          <MenuItem onSelect={() => setView('rename')} leading={<Pencil {...smallIconProps} />} keepOpen>
            Rename project
          </MenuItem>
          <MenuItem onSelect={() => setView('delete')} leading={<Trash2 {...smallIconProps} />} tone="danger" keepOpen>
            Delete project
          </MenuItem>
        </Menu>
      ) : view === 'rename' ? (
        <NameForm
          title="Rename project"
          label="Project name"
          initial={project.name}
          submitLabel="Save"
          onSubmit={(name) => action.mutateAsync((projects) => projects.rename(project.id, name))}
        />
      ) : (
        <ConfirmPanel title={`Delete ${project.name}?`} confirmLabel="Delete project" onConfirm={() => remove.mutateAsync(project.id).then(() => void navigate('/projects'))}>
          Its chats, files and folders are deleted with it, for everyone in the project. This cannot be undone.
        </ConfirmPanel>
      )}
    </Popover>
  );
}

/** `/projects/:projectId`: the project's workspace — its chats, instructions, archive, and its team and contacts. */
export function ProjectDetailView({ projectId }: { projectId: string }) {
  const project = useProject(projectId);
  const navigate = useNavigate();
  // Coming back from one of the project's chats: that chat is marked in the list.
  const lastChatId = (useLocation().state as { chatId?: string } | null)?.chatId;
  const [tab, setTab] = useState<Tab>('Chats');
  const tabsId = useId();
  const back = (
    <Link
      to="/projects"
      aria-label="All projects"
      className="hit-area relative inline-flex size-9 shrink-0 items-center justify-center rounded-full text-icon transition-colors hover:bg-accent-wash hover:text-fg max-md:hidden"
    >
      <ArrowLeft {...iconProps} />
    </Link>
  );

  if (project.isPending) {
    return (
      <PageFrame title="Project" leading={back} wide>
        <div role="status" aria-label="Loading project" className="flex flex-col gap-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      </PageFrame>
    );
  }
  if (project.isError) {
    const missing = isApiError(project.error) && project.error.status === 404;
    return (
      <PageFrame title="Project" leading={back} wide>
        <ErrorState
          title={missing ? 'This project does not exist.' : "Couldn't load this project."}
          description={missing ? 'It may have been removed.' : 'Check your connection and try again.'}
          action={missing ? { label: 'All projects', onClick: () => void navigate('/projects') } : { label: 'Try again', onClick: () => void project.refetch() }}
          className="py-16"
        />
      </PageFrame>
    );
  }

  const data = project.data;
  const newChat = () => void navigate(projectNewChatPath(data.id), { state: { newChat: true } });
  const newChatButton = (label: string) => (
    <Button variant="primary" size="sm" leadingIcon={<SquarePen {...smallIconProps} />} onClick={newChat}>
      {label}
    </Button>
  );

  return (
    <PageFrame
      title={data.name}
      // A project with more than its owner is shared: say so, quietly, where the title is.
      subtitle={data.members.length > 1 ? `Shared project · ${data.members.length} people` : 'Project'}
      subtitleOnMobile
      leading={back}
      wide
      actions={
        <div className="flex items-center gap-1">
          {/* Renaming and deleting are the owner's. */}
          {data.role !== 'member' && <ProjectMenu project={data} />}
          <Button variant="primary" size="sm" aria-label="New chat" leadingIcon={<SquarePen {...smallIconProps} />} onClick={newChat}>
            <span className="max-sm:sr-only">New chat</span>
          </Button>
        </div>
      }
    >
      <Link to="/projects" className="mb-3 inline-flex min-h-11 items-center gap-2 text-xs font-bold text-fg-muted hover:text-fg md:hidden">
        <ArrowLeft {...smallIconProps} /> All projects
      </Link>

      <Tabs
        label="Project sections"
        id={tabsId}
        tabs={TABS}
        value={tab}
        onChange={setTab}
        counts={{ Chats: data.chats.length, Archives: data.files.length, 'Teams & Contacts': data.members.length }}
        className="mb-6 mt-5"
      />

      <div {...tabPanelProps(tabsId, TABS, tab)}>
        {tab === 'Chats' && (
          <ProjectChatList
            project={data}
            activeId={lastChatId}
            empty={
              <div className="flex flex-col items-center gap-4 rounded-card border border-dashed border-hairline-strong px-6 py-16 text-center">
                <p className="eyebrow">Chats</p>
                <h2 className="text-base font-bold">No chats in this project yet.</h2>
                <p className="max-w-[46ch] text-sm leading-relaxed text-fg-muted">
                  Start a chat here and it stays with this project, alongside its instructions and files.
                </p>
                {newChatButton('Start a chat')}
              </div>
            }
          />
        )}
        {tab === 'Instructions' && <Instructions project={data} />}
        {tab === 'Archives' && <Archives project={data} />}
        {tab === 'Teams & Contacts' && <TeamAndContacts project={data} />}
        {/* The project's summary as the backend holds it: plain text, shown as written. */}
        {tab === 'Summary' &&
          (data.description ? (
            <p className="max-w-[70ch] whitespace-pre-wrap text-sm leading-relaxed">{data.description}</p>
          ) : (
            <p className="text-sm text-fg-muted">This project has no summary yet.</p>
          ))}
      </div>
    </PageFrame>
  );
}
