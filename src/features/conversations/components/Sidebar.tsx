import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { LogOut, PanelLeftClose, PanelLeftOpen, SquarePen, X } from 'lucide-react';
import { Wordmark } from '@/components/AgentMark';
import { LegalLinks } from '@/components/LegalLinks';
import { ScrollArea } from '@/components/ScrollArea';
import { Button, IconButton, Tooltip, iconProps } from '@/components/ui';
import { initials } from '@/lib/initials';
import { ConversationList } from './ConversationList';

/** The signed-in account shown in the sidebar (provider-agnostic). */
export interface SidebarUser {
  name: string;
  email: string | null;
  avatarUrl: string | null;
}

export interface SidebarProps {
  user: SidebarUser;
  onSignOut: () => void;
  /** Desktop icon-rail mode. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Present when rendered inside the mobile drawer. */
  onClose?: () => void;
  /** Called after any navigation (closes the mobile drawer). */
  onNavigate?: () => void;
}

/** Square avatar: the profile picture when available, otherwise initials. */
function Avatar({ user }: { user: SidebarUser }) {
  const [failed, setFailed] = useState(false);
  if (user.avatarUrl && !failed) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="size-8 shrink-0 bg-muted object-cover"
      />
    );
  }
  return (
    <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center bg-fg text-2xs font-bold text-bg">
      {initials(user.name)}
    </span>
  );
}

function SignOutButton({ onSignOut, align }: { onSignOut: () => void; align: 'start' | 'end' }) {
  return (
    <Tooltip content="Sign out" align={align}>
      <IconButton label="Sign out" size="md" icon={<LogOut {...iconProps} />} onClick={onSignOut} />
    </Tooltip>
  );
}

export function Sidebar({ user, onSignOut, collapsed = false, onToggleCollapsed, onClose, onNavigate }: SidebarProps) {
  const navigate = useNavigate();

  const startNewChat = () => {
    // View transition: the conversation fades out as the empty state's agent ring settles in.
    navigate('/', { viewTransition: true, state: { newChat: true } });
    onNavigate?.();
  };

  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center">
        <div className="flex h-[var(--header-h)] items-center">
          <Tooltip content="Expand sidebar" side="bottom" align="start">
            <IconButton label="Expand sidebar" size="md" icon={<PanelLeftOpen {...iconProps} />} onClick={onToggleCollapsed} />
          </Tooltip>
        </div>
        <Tooltip content="New chat" side="bottom" align="start">
          <IconButton label="New chat" size="md" icon={<SquarePen {...iconProps} />} onClick={startNewChat} />
        </Tooltip>
        <div className="mt-auto flex flex-col items-center gap-3 pb-4">
          <SignOutButton onSignOut={onSignOut} align="start" />
          <span title={user.name}>
            <Avatar user={user} />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[var(--header-h)] shrink-0 items-center justify-between pl-5 pr-3">
        <Link to="/" onClick={onNavigate} aria-label="Lam13 home" className="outline-offset-4">
          <Wordmark />
        </Link>
        {onClose ? (
          <IconButton label="Close sidebar" size="md" icon={<X {...iconProps} />} onClick={onClose} />
        ) : (
          <Tooltip content="Collapse sidebar" side="bottom" align="end">
            <IconButton label="Collapse sidebar" size="md" icon={<PanelLeftClose {...iconProps} />} onClick={onToggleCollapsed} />
          </Tooltip>
        )}
      </div>

      {/* Hairline keeps the primary action distinct from the history without another container. */}
      <div className="mx-3 shrink-0 border-b border-hairline pb-4">
        <Button
          variant="outline"
          size="sm"
          fullWidth
          leadingIcon={<SquarePen {...iconProps} />}
          onClick={startNewChat}
        >
          New chat
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <ConversationList onNavigate={onNavigate} />
      </ScrollArea>

      <div className="flex shrink-0 items-center gap-3 border-t border-hairline py-3 pl-4 pr-3">
        <Avatar user={user} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-nav font-bold leading-5">{user.name}</p>
          {user.email && <p className="truncate text-2xs text-fg-muted">{user.email}</p>}
        </div>
        <SignOutButton onSignOut={onSignOut} align="end" />
      </div>
      <LegalLinks className="shrink-0 px-4 pb-3 md:-mt-1" />
    </div>
  );
}
