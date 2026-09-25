import { Menu } from 'lucide-react';
import { AgentMark } from '@/components/AgentMark';
import { StatusIndicator } from '@/components/StatusIndicator';
import { IconButton, Skeleton, iconProps } from '@/components/ui';
import { CallButton } from '@/features/calling';
import type { AgentStatus } from '@/types/chat';

export interface ChatHeaderProps {
  /** Undefined while the conversation is loading (renders a skeleton). */
  title: string | undefined;
  subtitle: string;
  status: AgentStatus;
  onOpenSidebar: () => void;
}

/** 70px header row: agent mark, title/subtitle, status, call action (reference §3). */
export function ChatHeader({ title, subtitle, status, onOpenSidebar }: ChatHeaderProps) {
  return (
    <header className="flex h-[var(--header-h)] shrink-0 items-center gap-3 border-b border-hairline px-3 md:px-5">
      <IconButton
        label="Open sidebar"
        size="md"
        icon={<Menu {...iconProps} />}
        onClick={onOpenSidebar}
        className="md:hidden"
      />
      <AgentMark size={36} />
      <div className="min-w-0 flex-1">
        {title === undefined ? (
          <Skeleton className="h-3.5 w-40 max-w-full" />
        ) : (
          <h1 className="truncate text-body font-bold leading-5">{title}</h1>
        )}
        <p className="hidden truncate text-2xs text-fg-muted sm:block">{subtitle}</p>
      </div>
      <StatusIndicator status={status} />
      <CallButton />
    </header>
  );
}
