import { Menu as MenuIcon } from 'lucide-react';
import { ScrollArea } from '@/components/ScrollArea';
import { IconButton, iconProps } from '@/components/ui';
import { GranolaConnectionControl } from '@/features/meetings';
import { useUiStore } from '@/stores/uiStore';
import { IntegrationRow } from './IntegrationRow';
import { WhatsAppIntegration } from './WhatsAppIntegration';

/** `/integrations`: the outside services Lam13 connects to (same page frame as My Contacts and Meetings). */
export function IntegrationsView() {
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  return (
    <section
      aria-labelledby="integrations-heading"
      className="flex h-full min-h-0 flex-col overflow-hidden bg-bg md:rounded-card md:border md:border-frame md:shadow-card"
    >
      <header className="bright-chrome flex h-[var(--header-h)] shrink-0 items-center gap-3 border-b border-hairline px-3 md:px-5">
        <IconButton
          label="Open sidebar"
          size="md"
          icon={<MenuIcon {...iconProps} />}
          onClick={() => setSidebarOpen(true)}
          className="md:hidden"
        />
        <div className="min-w-0 flex-1">
          <h1 id="integrations-heading" className="truncate text-body font-bold leading-5">
            Integrations
          </h1>
          <p className="hidden truncate text-2xs text-fg-muted sm:block">Services Lam13 connects to on your behalf.</p>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1 px-4 py-6 md:px-6 md:py-8">
        <div className="mx-auto w-full max-w-[var(--chat-max-w)]">
          <IntegrationRow
            name="Granola"
            description="Bring your meeting notes into Lam13, so you can ask about decisions and action items."
            action={<GranolaConnectionControl />}
          />
          <WhatsAppIntegration />
        </div>
      </ScrollArea>
    </section>
  );
}
