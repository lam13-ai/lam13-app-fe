import { Menu } from 'lucide-react';
import { ErrorState, type ErrorStateProps } from '@/components/ErrorState';
import { IconButton, iconProps } from '@/components/ui';
import { useUiStore } from '@/stores/uiStore';

/** Full workspace card for route-level states (not found, failed load). */
export function RoutePanel(props: Omit<ErrorStateProps, 'level' | 'children' | 'className'>) {
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  return (
    <section className="relative flex h-full flex-col bg-bg md:rounded-card md:border md:border-frame md:shadow-card">
      <div className="absolute left-3 top-4 md:hidden">
        <IconButton label="Open sidebar" size="md" icon={<Menu {...iconProps} />} onClick={() => setSidebarOpen(true)} />
      </div>
      <ErrorState {...props} level={1} className="h-full" />
    </section>
  );
}
