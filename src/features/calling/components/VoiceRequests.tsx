import { useState } from 'react';
import { useCall } from '../CallingProvider';
import { manageRtcAction } from '../rtc';

/** Compact, persistent requests from calls, shown above the normal conversation. */
export function VoiceRequests() {
  const { actions, summaries, state, refreshActions } = useCall();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  if (!actions.length && !summaries.length) return null;
  const perform = async (id: string, operation: 'start' | 'cancel') => {
    setBusy(id);
    setError('');
    try {
      const result = await manageRtcAction(id, operation);
      if (result.missing?.length) setError('This request needs more context. Continue the conversation before starting it.');
      refreshActions();
    } catch {
      setError('The request could not be updated. Please try again.');
    } finally { setBusy(''); }
  };
  const labels: Record<string, string> = { needs_details: 'Needs more context', recorded: 'Recorded', queued: 'Waiting to start', running: 'Preparing in chat', completed: 'Completed', cancelled: 'Cancelled', failed: 'Could not finish' };
  return <details className="shrink-0 border-b border-hairline bg-elevated px-5 py-2 text-xs">
    <summary className="cursor-pointer">Voice conversations{actions.length > 0 ? ` · ${actions.length} requests` : ''}</summary>
    {summaries.slice(0, 3).map((summary, i) => <p key={i} className="py-2 text-fg-muted">{summary}</p>)}
    <ul className="max-h-48 overflow-auto py-2">
      {actions.map((action) => <li key={action.id} className="mb-2 flex items-center gap-2">
        <span className="flex-1">{action.title} · {labels[action.status] ?? action.status}{action.error && <span className="block text-danger">{action.error}</span>}</span>
        {state.status === 'idle' && ['recorded', 'needs_details', 'queued'].includes(action.status) && <>
          {action.status !== 'queued' && <button className="text-accent underline" disabled={Boolean(busy)} onClick={() => void perform(action.id, 'start')}>Start in chat</button>}
          <button className="text-fg-muted underline" disabled={Boolean(busy)} onClick={() => void perform(action.id, 'cancel')}>Cancel</button>
        </>}
      </li>)}
    </ul>
    {error && <p role="alert" className="text-danger">{error}</p>}
  </details>;
}
