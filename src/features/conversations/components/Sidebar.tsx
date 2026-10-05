import { Link, NavLink, useNavigate } from 'react-router';
import { CalendarDays, LogOut, Plug, PanelLeftClose, PanelLeftOpen, Shield, SquarePen, Users, X } from 'lucide-react';
import { Wordmark } from '@/components/AgentMark';
import { LegalLinks } from '@/components/LegalLinks';
import { ThemeMenu } from '@/components/ThemeMenu';
import { UserAvatar } from '@/components/UserAvatar';
import { Button, IconButton, Tooltip, iconProps } from '@/components/ui';
import { useIsAdmin } from '@/features/admin';
import { PLACEHOLDER_NAME } from '@/features/auth';
import { cn } from '@/lib/cn';
import { ConversationList } from './ConversationList';

/** Workspace pages below New chat (the chat history follows). */
const NAV = [
  { to: '/contacts', label: 'My Contacts', Icon: Users },
  { to: '/meetings', label: 'Meetings', Icon: CalendarDays },
  { to: '/integrations', label: 'Integrations', Icon: Plug },
] as const;

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

/** The account's avatar; the placeholder label is not a name, so it gets the generic icon, not "A". */
function Avatar({ user }: { user: SidebarUser }) {
  return <UserAvatar name={user.name === PLACEHOLDER_NAME ? null : user.name} src={user.avatarUrl} />;
}

/** Shown only to accounts the backend allows into the admin panel. */
function AdminButton({ align }: { align: 'start' | 'end' }) {
  const navigate = useNavigate();
  const { data: isAdmin } = useIsAdmin();
  if (!isAdmin) return null;
  return (
    <Tooltip content="Admin panel" align={align}>
      <IconButton label="Admin panel" size="md" icon={<Shield {...iconProps} />} onClick={() => navigate('/admin')} />
    </Tooltip>
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
      <div className="bright-chrome flex h-full flex-col items-center">
        <div className="flex h-[var(--header-h)] items-center">
          <Tooltip content="Expand sidebar" side="bottom" align="start">
            <IconButton label="Expand sidebar" size="md" icon={<PanelLeftOpen {...iconProps} />} onClick={onToggleCollapsed} />
          </Tooltip>
        </div>
        <Tooltip content="New chat" side="bottom" align="start">
          <IconButton label="New chat" size="md" icon={<SquarePen {...iconProps} />} onClick={startNewChat} />
        </Tooltip>
        <div className="mt-2 flex flex-col items-center gap-2">
          {NAV.map(({ to, label, Icon }) => (
            <Tooltip key={to} content={label} side="bottom" align="start">
              <NavLink
                to={to}
                aria-label={label}
                className={({ isActive }) =>
                  cn(
                    'hit-area relative inline-flex size-8 items-center justify-center rounded-full transition-all duration-200 ease-standard',
                    isActive ? 'bg-accent-wash text-fg' : 'text-fg-muted hover:bg-accent-wash hover:text-fg',
                  )
                }
              >
                <Icon {...iconProps} />
              </NavLink>
            </Tooltip>
          ))}
        </div>
        <div className="mt-auto flex flex-col items-center gap-3 pb-4">
          <ThemeMenu align="start" />
          <AdminButton align="start" />
          <SignOutButton onSignOut={onSignOut} align="start" />
          <span title={user.name}>
            <Avatar user={user} />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bright-chrome flex h-full min-h-0 flex-col">
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
        {/* Same row language as the history below: tinted when active, lighter tint on hover. The pages'
            labels and icons are at full strength (the history rows stay one step quieter). */}
        {NAV.map(({ to, label, Icon }, i) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                // The transparent border matches the New chat button's, so the icons share one column.
                'flex h-11 items-center gap-2.5 border border-transparent px-3 text-nav transition-colors duration-150 ease-standard md:h-9',
                i === 0 ? 'mt-2' : 'mt-0.5',
                isActive ? 'bg-accent-wash font-bold text-fg' : 'text-fg hover:bg-fg/[0.045]',
              )
            }
          >
            <Icon {...iconProps} />
            {label}
          </NavLink>
        ))}
      </div>

      {/* The only scrolling part of the sidebar; a thin visible bar shows there's more history. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-subtle">
        <ConversationList onNavigate={onNavigate} />
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-hairline py-3 pl-4 pr-3">
        <Avatar user={user} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-nav font-bold leading-5">{user.name}</p>
          {user.email && <p className="truncate text-2xs text-fg-muted">{user.email}</p>}
        </div>
        <ThemeMenu />
        <AdminButton align="end" />
        <SignOutButton onSignOut={onSignOut} align="end" />
      </div>
      <LegalLinks className="shrink-0 px-4 pb-3 md:-mt-1" />
    </div>
  );
}
