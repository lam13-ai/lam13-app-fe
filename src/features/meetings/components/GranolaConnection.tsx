import { toErrorInfo } from '@/api';
import { Button, Menu, MenuItem, Popover, Spinner, useToast } from '@/components/ui';
import { useMeetingSource, useSetMeetingSourceConnected } from '../hooks/useMeetings';

/**
 * Granola connection controls. UI only for now: they flip the adapter's connection flag — no OAuth,
 * tokens or Granola calls until the backend integration replaces `MeetingsService.setConnected`.
 */
export function ConnectGranolaButton({ variant = 'outline', size = 'sm' }: { variant?: 'primary' | 'outline'; size?: 'sm' | 'md' }) {
  const toast = useToast();
  const connect = useSetMeetingSourceConnected();
  return (
    <Button
      variant={variant}
      size={size}
      disabled={connect.isPending}
      aria-busy={connect.isPending || undefined}
      leadingIcon={connect.isPending ? <Spinner size={14} state="active" /> : undefined}
      onClick={() =>
        connect.mutate(true, {
          onError: (error) => toast.show(`Couldn't connect Granola. ${toErrorInfo(error).message}`, { tone: 'danger' }),
        })
      }
    >
      Connect Granola
    </Button>
  );
}

/** "Granola connected", with Disconnect behind it. */
export function GranolaStatus() {
  const toast = useToast();
  const disconnect = useSetMeetingSourceConnected();
  return (
    <Popover
      placement="bottom-end"
      className="w-56"
      trigger={(props) => (
        <Button
          {...props}
          variant="ghost"
          size="sm"
          aria-label="Granola connected. Connection options"
          leadingIcon={<span aria-hidden className="size-1.5 rounded-full bg-accent" />}
        >
          {/* Short on phones so the header keeps its title; the button's label says the full state. */}
          <span className="sm:hidden">Granola</span>
          <span className="max-sm:hidden">Granola connected</span>
        </Button>
      )}
    >
      <Menu label="Granola connection">
        <MenuItem
          tone="danger"
          onSelect={() =>
            disconnect.mutate(false, {
              onError: (error) => toast.show(`Couldn't disconnect Granola. ${toErrorInfo(error).message}`, { tone: 'danger' }),
            })
          }
        >
          Disconnect Granola
        </MenuItem>
      </Menu>
    </Popover>
  );
}

/** Granola's connect / connected control for wherever integrations are listed. */
export function GranolaConnectionControl() {
  const source = useMeetingSource();
  if (source.isPending) return <Spinner size={16} state="active" label="Loading Granola status" />;
  return source.data?.status === 'connected' ? <GranolaStatus /> : <ConnectGranolaButton />;
}
