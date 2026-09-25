import { Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { AgentStatus } from '@/types/chat';

const labels: Record<AgentStatus, string> = {
  online: 'Online',
  transcribing: 'Transcribing…',
  thinking: 'Thinking…',
  solving: 'Solving…',
  answering: 'Answering…',
};

/** Dot-ring + label in the chat header (reference §3). */
export function StatusIndicator({ status, className }: { status: AgentStatus; className?: string }) {
  return (
    <span role="status" className={cn('flex items-center gap-2 text-2xs text-fg-muted', className)}>
      <Spinner size={20} state={status === 'online' ? 'idle' : 'active'} />
      {/* Label is visually hidden on narrow screens to leave room for the title. */}
      <span className="max-sm:sr-only">{labels[status]}</span>
    </span>
  );
}
