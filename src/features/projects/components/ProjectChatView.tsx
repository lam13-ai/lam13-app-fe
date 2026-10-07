import { ChevronDown, FolderKanban, PanelRight, SquarePen, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { ScrollArea } from '@/components/ScrollArea';
import { Button, Drawer, IconButton, Popover, Skeleton, iconProps, smallIconProps, usePopover } from '@/components/ui';
import { ChatView } from '@/features/chat';
import type { Conversation, Project } from '@/types/api';
import { useLinkChat } from '../hooks/useProjects';
import { Archives } from './Archives';
import { ProjectChatList, projectChatPath, projectNewChatPath } from './ProjectChatList';
import { Instructions, Tabs, tabPanelProps } from './ProjectSections';

const SECTIONS = ['Instructions', 'Archives'] as const;
type Section = (typeof SECTIONS)[number];

/** The menu under the project's name: this project's chats (the open one marked), a new chat, the workspace. */
function ProjectMenu({ project, conversationId }: { project: Project; conversationId?: string }) {
  const popover = usePopover();
  const navigate = useNavigate();
  const go = (to: string, state?: object) => {
    popover?.close();
    void navigate(to, { state });
  };
  return (
    <div className="flex flex-col gap-1">
      <p className="eyebrow px-2.5 pb-1 pt-1 text-fg-muted">Chats in this project</p>
      <div className="scrollbar-subtle max-h-[min(16rem,40vh)] overflow-y-auto">
        <ProjectChatList
          project={project}
          activeId={conversationId}
          compact
          onNavigate={() => popover?.close()}
          empty={<p className="px-2.5 py-3 text-xs text-fg-muted">No chats in this project yet.</p>}
        />
      </div>
      <div className="mt-1 flex flex-col gap-0.5 border-t border-hairline pt-1.5">
        <Button variant="ghost" size="sm" fullWidth leadingIcon={<SquarePen {...smallIconProps} />} onClick={() => go(projectNewChatPath(project.id), { newChat: true })}>
          New chat in this project
        </Button>
        <Button variant="ghost" size="sm" fullWidth leadingIcon={<FolderKanban {...smallIconProps} />} onClick={() => go(`/projects/${project.id}`, { chatId: conversationId })}>
          Open project
        </Button>
      </div>
    </div>
  );
}

/** Instructions and Archives beside the chat: the same sections as the project page, in a side sheet. */
function ProjectDetails({ project, open, onClose }: { project: Project; open: boolean; onClose: () => void }) {
  const [section, setSection] = useState<Section>('Instructions');
  const id = useId();
  return (
    <Drawer open={open} onClose={onClose} label="Project details" side="right">
      <header className="flex h-[var(--header-h)] shrink-0 items-center gap-3 border-b border-hairline pl-5 pr-3">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Project details</p>
          <h2 className="truncate text-body font-bold">{project.name}</h2>
        </div>
        <IconButton label="Close project details" size="md" icon={<X {...iconProps} />} onClick={onClose} />
      </header>
      <Tabs
        label="Project details"
        id={id}
        tabs={SECTIONS}
        value={section}
        onChange={setSection}
        counts={{ Archives: project.files.length }}
        className="shrink-0 px-3"
      />
      <ScrollArea className="min-h-0 flex-1 px-5 py-5">
        <div {...tabPanelProps(id, SECTIONS, section)}>
          {section === 'Instructions' && <Instructions project={project} />}
          {section === 'Archives' && <Archives files={project.files} compact />}
        </div>
      </ScrollArea>
    </Drawer>
  );
}

/**
 * A chat inside a project (`/projects/:projectId/new`, `/projects/:projectId/c/:conversationId`): the
 * ordinary chat view, with the project in its header and the project's details one click away.
 */
export function ProjectChatView({
  project,
  conversationId,
  conversation,
  viewKey,
}: {
  /** Undefined while the project loads. */
  project: Project | undefined;
  conversationId?: string;
  conversation?: Conversation;
  viewKey?: string;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const link = useLinkChat();
  const projectId = project?.id;
  const title = conversation?.title;
  // Whatever conversation is open here belongs to this project (a new one, or one opened by link).
  const linked = Boolean(project?.chats.some((c) => c.id === conversationId));
  const { mutate: linkChat } = link;
  useEffect(() => {
    if (projectId && conversationId && title && !linked) linkChat({ projectId, chat: { id: conversationId, title } });
  }, [projectId, conversationId, title, linked, linkChat]);

  return (
    <>
      <ChatView
        viewKey={viewKey}
        conversationId={conversationId}
        conversation={conversation}
        scope={{
          path: (id) => (project ? projectChatPath(project.id, id) : `/c/${id}`),
          newTitle: 'New chat',
          context: project ? (
            // The popover's own wrapper is shrink-to-fit: cap it so a long project name truncates instead of widening the header.
            <div className="flex [&>div]:min-w-0 [&>div]:max-w-full">
            <Popover
              placement="bottom-start"
              className="w-[min(20rem,calc(100vw-8.5rem))]"
              trigger={(props) => (
                <button
                  {...props}
                  type="button"
                  aria-label={`Project: ${project.name}`}
                  className="group -ml-1 flex min-w-0 max-w-full items-center gap-1 rounded-full px-1 text-2xs text-fg-muted transition-colors hover:text-fg aria-expanded:text-fg"
                >
                  <FolderKanban size={12} strokeWidth={1.8} aria-hidden className="shrink-0" />
                  <span className="truncate">{project.name}</span>
                  <ChevronDown size={12} strokeWidth={1.8} aria-hidden className="shrink-0 transition-transform duration-200 group-aria-expanded:rotate-180" />
                </button>
              )}
            >
              <ProjectMenu project={project} conversationId={conversationId} />
            </Popover>
            </div>
          ) : (
            <Skeleton className="mt-1 h-3 w-32" />
          ),
          actions: project && (
            <Button variant="outline" size="sm" aria-label="Project details" leadingIcon={<PanelRight {...smallIconProps} />} onClick={() => setDetailsOpen(true)} className="max-sm:w-11 max-sm:px-0">
              <span className="max-sm:sr-only">Project details</span>
            </Button>
          ),
        }}
      />
      {project && <ProjectDetails project={project} open={detailsOpen} onClose={() => setDetailsOpen(false)} />}
    </>
  );
}
