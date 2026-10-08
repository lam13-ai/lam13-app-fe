import { Cloud, FolderOpen, HardDrive, Menu as MenuIcon, Video } from 'lucide-react';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { ScrollArea } from '@/components/ScrollArea';
import { IconButton, iconProps, useToast } from '@/components/ui';
import { GranolaConnectionControl } from '@/features/meetings';
import { useUiStore } from '@/stores/uiStore';
import { IntegrationRow } from './IntegrationRow';
import { McpServerSection } from './McpServerSection';
import { ProviderConnection, StatusNote, useConnectionResult } from './ProviderConnection';
import { WhatsAppIntegration } from './WhatsAppIntegration';

const ICON = { size: 18, strokeWidth: 1.6 };
/** A service Lam13 has no integration for yet: listed, with nothing to press. */
const notAvailable = <StatusNote>Not available yet</StatusNote>;

/**
 * `/integrations`: the outside services Lam13 connects to (same page frame as My Contacts and Meetings).
 * Every state shown is the backend's: Granola's connection, each account provider's (`GET /integrations`),
 * and the saved MCP server. Nothing becomes "Connected" by being clicked.
 */
export function IntegrationsView() {
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  // The Granola callback page returns here with ?granola=connected|cancelled|error.
  useEffect(() => {
    if (!params.has('granola')) return;
    if (params.get('granola') === 'error') toast.show("Couldn't connect Granola. Please try again.", { tone: 'danger' });
    setParams({}, { replace: true });
  }, [params, setParams, toast]);
  // Every other provider's callback returns with ?connection=…&provider=….
  useConnectionResult();
  return (
    <section
      aria-labelledby="integrations-heading"
      className="soft-ink flex h-full min-h-0 flex-col overflow-hidden bg-bg md:rounded-card md:border md:border-frame md:shadow-card"
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
          <h2 className="eyebrow mb-4">Meeting note takers</h2>
          <IntegrationRow
            brand="granola"
            description="Bring your meeting notes into Lam13, so you can ask about decisions and action items."
            action={<GranolaConnectionControl />}
          />
          <IntegrationRow brand="otter" description="Otter transcripts and summaries as meeting context." action={notAvailable} />
          <IntegrationRow brand="fireflies" description="Fireflies notes, action items and transcripts from your recorded calls." action={notAvailable} />

          <h2 className="eyebrow mb-4 mt-10">Communication</h2>
          <WhatsAppIntegration />
          <IntegrationRow
            brand="teams"
            title="Microsoft Teams chat"
            description="Chat with Lam13 inside Microsoft Teams: ask the AI assistant a question in a chat or channel and get the answer there. (Teams meetings are under Video conferencing.)"
            action={notAvailable}
          />
          <IntegrationRow brand="slack" description="Ask Lam13 from Slack and share answers back to a channel." action={notAvailable} />

          <h2 className="eyebrow mb-2 mt-10">Video conferencing</h2>
          <p className="mb-4 max-w-[64ch] text-xs leading-relaxed text-fg-muted">
            Calendar already shows where each meeting happens, read from its join link. Connecting an account gives Lam13 read-only access to your meetings on
            that platform; bringing them in from the account is not switched on yet.
          </p>
          <IntegrationRow brand="meet" description="Meetings held on Google Meet, through your Google account." action={<ProviderConnection provider="google_meet" />} />
          <IntegrationRow brand="zoom" description="Meetings held on Zoom, through your Zoom account." action={<ProviderConnection provider="zoom" />} />
          <IntegrationRow title="Webex" icon={<Video {...ICON} />} description="Meetings held on Webex, through your Webex account." action={<ProviderConnection provider="webex" />} />
          <IntegrationRow brand="teams" description="Meetings held on Microsoft Teams, through your Microsoft account." action={<ProviderConnection provider="teams" />} />

          <h2 className="eyebrow mb-2 mt-10">Storage</h2>
          <p className="mb-4 max-w-[64ch] text-xs leading-relaxed text-fg-muted">
            Connect a storage account with read-only access. Bringing its files into a project&apos;s Archives is not switched on yet; files are added to
            Archives by uploading them.
          </p>
          <IntegrationRow title="SharePoint" icon={<FolderOpen {...ICON} />} description="Your organisation's SharePoint sites and document libraries." action={<ProviderConnection provider="sharepoint" />} />
          <IntegrationRow title="OneDrive" icon={<Cloud {...ICON} />} description="The files in your OneDrive." action={<ProviderConnection provider="onedrive" />} />
          <IntegrationRow title="Google Drive" icon={<HardDrive {...ICON} />} description="The files in your Google Drive." action={<ProviderConnection provider="google_drive" />} />

          <h2 className="eyebrow mb-4 mt-10">Custom</h2>
          <McpServerSection />
          <p className="mt-6 text-2xs leading-relaxed text-fg-muted">
            Connecting an account opens that provider&apos;s own sign-in, and Lam13 asks for read-only access. &ldquo;Not set up on this server&rdquo; means
            your administrator has not added that provider&apos;s credentials yet; &ldquo;Not available yet&rdquo; means Lam13 has no integration for it.
          </p>
        </div>
      </ScrollArea>
    </section>
  );
}
