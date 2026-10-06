import { MessageSquare } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { isDemoConversation } from '@/api';
import { smallIconProps } from '@/components/ui';
import { useConversations } from '@/features/conversations';
import { cn } from '@/lib/cn';
import { formatRelativeTime } from '@/lib/format';
import type { Project, ProjectChat } from '@/types/api';

export const projectChatPath = (projectId: string, conversationId: string) => `/projects/${projectId}/c/${conversationId}`;
export const projectNewChatPath = (projectId: string) => `/projects/${projectId}/new`;

/**
 * A project's conversations, newest first. They are ordinary conversations, so their current title and
 * time come from the conversation list when it has them; one that was deleted there is left out. The
 * sample projects' demo conversations are not in that list and always show.
 */
export function useProjectChats(project: Project): ProjectChat[] {
  const all = useConversations();
  return useMemo(() => {
    const byId = new Map(all.conversations.map((c) => [c.id, c]));
    // Only trust "not in the list" once the whole list has loaded.
    const complete = all.isSuccess && !all.hasNextPage;
    return project.chats
      .filter((chat) => byId.has(chat.id) || !complete || isDemoConversation(chat.id))
      .map((chat) => {
        const live = byId.get(chat.id);
        return live ? { ...chat, title: live.title, updated_at: live.updated_at, preview: live.last_message_preview ?? chat.preview } : chat;
      })
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }, [project.chats, all.conversations, all.isSuccess, all.hasNextPage]);
}

/** The project's conversations as links; `activeId` marks the one that is open. */
export function ProjectChatList({
  project,
  activeId,
  compact = false,
  empty,
  onNavigate,
}: {
  project: Project;
  activeId?: string;
  /** Title and time only (inside a menu). */
  compact?: boolean;
  empty: ReactNode;
  onNavigate?: () => void;
}) {
  const chats = useProjectChats(project);
  if (chats.length === 0) return <>{empty}</>;
  return (
    <ul aria-label="Project chats" className="flex flex-col">
      {chats.map((chat) => {
        const active = chat.id === activeId;
        return (
          <li key={chat.id}>
            <Link
              to={projectChatPath(project.id, chat.id)}
              aria-current={active ? 'page' : undefined}
              onClick={onNavigate}
              className={cn(
                'flex min-h-11 items-start gap-3 outline-offset-[-2px] transition-colors duration-150 ease-standard',
                compact ? 'rounded-card px-2.5 py-2' : 'border-b border-hairline px-2 py-3.5',
                active ? 'bg-accent-wash' : 'hover:bg-fg/[0.035]',
              )}
            >
              {!compact && <MessageSquare {...smallIconProps} className={cn('mt-0.5 shrink-0', active ? 'text-accent' : 'text-fg-muted')} />}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-4">
                  <span className={cn('min-w-0 truncate font-bold', compact ? 'text-xs' : 'text-sm')}>{chat.title}</span>
                  <span className={cn('shrink-0 tabular-nums text-fg-muted', compact ? 'text-2xs' : 'text-xs')}>{formatRelativeTime(chat.updated_at)}</span>
                </span>
                {!compact && chat.preview && <span className="mt-1 block truncate text-xs text-fg-muted">{chat.preview}</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
