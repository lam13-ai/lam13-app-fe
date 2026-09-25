import { ArrowLeft, Database, KeyRound } from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { ErrorState } from '@/components/ErrorState';
import { Spinner, iconProps } from '@/components/ui';
import { useAuth } from '@/features/auth';
import { cn } from '@/lib/cn';
import { useIsAdmin } from './access';

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn('inline-flex items-center gap-2 px-3 py-2 text-nav', isActive ? 'bg-fg text-bg' : 'text-fg-muted hover:bg-fg/5 hover:text-fg');

/** `/admin/*` — nav + access check. Only emails in the backend's ADMIN_PANEL_EMAILS get in. */
export function AdminLayout() {
  const { user } = useAuth();
  const access = useIsAdmin();
  const navigate = useNavigate();

  if (access.isPending) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg-subtle">
        <Spinner size={24} state="active" label="Checking access" />
      </main>
    );
  }
  if (access.isError) {
    return (
      <main className="flex min-h-dvh bg-bg-subtle">
        <ErrorState
          className="flex-1"
          eyebrow="Admin"
          title="Not authorized."
          description="Your account does not have access to the admin panel."
          action={{ label: 'Back to chat', onClick: () => navigate('/') }}
        />
      </main>
    );
  }

  return (
    <div className="min-h-dvh bg-bg-subtle">
      <header className="border-b border-hairline bg-bg">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/" className="inline-flex items-center gap-1.5 text-nav text-fg-muted hover:text-fg">
            <ArrowLeft {...iconProps} /> Chat
          </Link>
          <span className="font-bold">Admin</span>
          <nav className="flex items-center gap-1">
            <NavLink to="/admin" end className={navClass}>
              <Database {...iconProps} /> Knowledge base
            </NavLink>
            <NavLink to="/admin/api-keys" className={navClass}>
              <KeyRound {...iconProps} /> API keys
            </NavLink>
          </nav>
          <span className="ml-auto hidden text-2xs text-fg-muted sm:inline">{user?.email}</span>
        </div>
      </header>
      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
