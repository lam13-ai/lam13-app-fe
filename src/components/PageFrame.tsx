import { Menu as MenuIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { ScrollArea } from '@/components/ScrollArea';
import { IconButton, iconProps } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/stores/uiStore';

/** The workspace card every page shares: header (title, one-line purpose, actions), then a scrolling body. */
export function PageFrame({
  title,
  subtitle,
  subtitleOnMobile = false,
  leading,
  actions,
  wide = false,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Keep the subtitle on phones too (it is hidden there by default, to give the title room). */
  subtitleOnMobile?: boolean;
  /** Before the title, e.g. a back button. */
  leading?: ReactNode;
  actions?: ReactNode;
  /** A wider body than the chat column (grids, calendars). */
  wide?: boolean;
  children: ReactNode;
}) {
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="soft-ink flex h-full min-h-0 flex-col overflow-hidden bg-bg md:rounded-card md:border md:border-frame md:shadow-card"
    >
      <header className="bright-chrome flex h-[var(--header-h)] shrink-0 items-center gap-3 border-b border-hairline px-3 md:px-5">
        <IconButton label="Open sidebar" size="md" icon={<MenuIcon {...iconProps} />} onClick={() => setSidebarOpen(true)} className="md:hidden" />
        {leading}
        <div className="min-w-0 flex-1">
          <h1 id={id} className="truncate text-body font-bold leading-5">
            {title}
          </h1>
          {subtitle && <p className={cn('truncate text-2xs text-fg-muted', !subtitleOnMobile && 'hidden sm:block')}>{subtitle}</p>}
        </div>
        {actions}
      </header>
      <ScrollArea className="min-h-0 flex-1 px-3 py-4 md:px-6 md:py-6">
        <div className={cn('mx-auto w-full', wide ? 'max-w-5xl' : 'max-w-[var(--chat-max-w)]')}>{children}</div>
      </ScrollArea>
    </section>
  );
}
