import { useCallback } from 'react';
import { Outlet } from 'react-router';
import { Drawer } from '@/components/ui';
import { useAuth } from '@/features/auth';
import { CallingProvider, CallPanel } from '@/features/calling';
import { Sidebar } from '@/features/conversations';
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/stores/uiStore';
import { useSignOut } from '../session';

/**
 * Sidebar + main workspace.
 * ≥768px: persistent 260px sidebar (collapsible to a 56px rail) beside an inset chat card.
 * <768px: off-canvas drawer and a full-bleed chat.
 */
export function AppShell() {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const toggleSidebarCollapsed = useUiStore((s) => s.toggleSidebarCollapsed);
  const closeDrawer = useCallback(() => setSidebarOpen(false), [setSidebarOpen]);
  const { user } = useAuth();
  const signOut = useSignOut();
  // RequireAuth guarantees a user here; the fallback only guards against provider edge cases.
  const account = user ?? { name: 'Account', email: null, avatarUrl: null };
  const onSignOut = () => void signOut();

  return (
    // Calls live with the signed-in workspace: signing out unmounts this and ends any call.
    <CallingProvider>
      <div className="flex h-dvh overflow-hidden bg-bg-subtle">
        {isDesktop ? (
          <aside
            aria-label="Sidebar"
            className={cn(
              'shrink-0 overflow-hidden transition-[width] duration-300 ease-standard',
              sidebarCollapsed ? 'w-[var(--rail-w)]' : 'w-[var(--sidebar-w)]',
            )}
          >
            {/* Vertical padding matches <main> so the sidebar header lines up with the chat header. */}
            <div className={cn('h-full py-2 lg:py-3', sidebarCollapsed ? 'w-[var(--rail-w)]' : 'w-[var(--sidebar-w)]')}>
              <Sidebar
                user={account}
                onSignOut={onSignOut}
                collapsed={sidebarCollapsed}
                onToggleCollapsed={toggleSidebarCollapsed}
              />
            </div>
          </aside>
        ) : (
          <Drawer open={sidebarOpen} onClose={closeDrawer} label="Sidebar">
            <Sidebar user={account} onSignOut={onSignOut} onClose={closeDrawer} onNavigate={closeDrawer} />
          </Drawer>
        )}

        <main className="relative flex min-w-0 flex-1 flex-col md:py-2 md:pr-2 lg:py-3 lg:pr-3">
          <Outlet />
          <CallPanel />
        </main>
      </div>
    </CallingProvider>
  );
}
