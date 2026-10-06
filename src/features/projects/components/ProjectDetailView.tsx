import { ArrowLeft, SquarePen } from 'lucide-react';
import { useId, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { isApiError } from '@/api';
import { ErrorState } from '@/components/ErrorState';
import { PageFrame } from '@/components/PageFrame';
import { Button, Skeleton, iconProps, smallIconProps } from '@/components/ui';
import { useProject } from '../hooks/useProjects';
import { Archives } from './Archives';
import { ProjectChatList, projectNewChatPath } from './ProjectChatList';
import { Context, Instructions, Tabs, tabPanelProps } from './ProjectSections';

const TABS = ['Chats', 'Instructions', 'Context', 'Archives'] as const;
type Tab = (typeof TABS)[number];

/** `/projects/:projectId`: the project's workspace — its chats, and its instructions, context and archive. */
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
      subtitle="Project"
      leading={back}
      wide
      actions={
        <Button variant="primary" size="sm" aria-label="New chat" leadingIcon={<SquarePen {...smallIconProps} />} onClick={newChat}>
          <span className="max-sm:sr-only">New chat</span>
        </Button>
      }
    >
      <Link to="/projects" className="mb-3 inline-flex min-h-11 items-center gap-2 text-xs font-bold text-fg-muted hover:text-fg md:hidden">
        <ArrowLeft {...smallIconProps} /> All projects
      </Link>
      <p className="max-w-[70ch] text-sm leading-relaxed text-fg-muted">{data.description}</p>

      <Tabs
        label="Project sections"
        id={tabsId}
        tabs={TABS}
        value={tab}
        onChange={setTab}
        counts={{ Chats: data.chats.length, Context: data.sources.length, Archives: data.files.length }}
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
                  Start a chat here and it stays with this project, alongside its instructions, context and files.
                </p>
                {newChatButton('Start a chat')}
              </div>
            }
          />
        )}
        {tab === 'Instructions' && <Instructions project={data} />}
        {tab === 'Context' && <Context project={data} />}
        {tab === 'Archives' && <Archives files={data.files} />}
      </div>
    </PageFrame>
  );
}
