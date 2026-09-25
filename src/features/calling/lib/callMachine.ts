import type { CallError } from '../types';
import { callError } from '../types';

/**
 * Call lifecycle:
 *
 *   idle → connecting → active → ending → idle
 *            ↘ error      ↘ error          error → connecting (retry) | idle (dismiss)
 *
 * Pure: invalid events leave the state unchanged. Any provider "ended" report is terminal, so the UI
 * can never stay in connecting/active after the provider has gone away.
 */
export type CallState =
  | { status: 'idle' }
  | { status: 'connecting' }
  | { status: 'active'; startedAt: number }
  | { status: 'ending'; startedAt: number | null }
  | { status: 'error'; error: CallError };

export type CallEvent =
  | { type: 'START' }
  | { type: 'CONNECTED'; at: number }
  | { type: 'END_REQUESTED' }
  /** `completed`: the remote side ended a live call normally (e.g. the assistant said goodbye). */
  | { type: 'ENDED'; completed?: boolean }
  | { type: 'FAIL'; error: CallError }
  | { type: 'RESET' };

export const initialCallState: CallState = { status: 'idle' };

export function callReducer(state: CallState, event: CallEvent): CallState {
  switch (event.type) {
    case 'START':
      return state.status === 'idle' || state.status === 'error' ? { status: 'connecting' } : state;

    case 'CONNECTED':
      return state.status === 'connecting' ? { status: 'active', startedAt: event.at } : state;

    case 'END_REQUESTED':
      if (state.status === 'connecting') return { status: 'ending', startedAt: null };
      if (state.status === 'active') return { status: 'ending', startedAt: state.startedAt };
      return state;

    case 'ENDED':
      // Expected after a hang-up; otherwise the provider went away on its own.
      if (state.status === 'ending') return initialCallState;
      if (state.status === 'connecting') return { status: 'error', error: callError('connection-failed') };
      if (state.status === 'active') return event.completed ? initialCallState : { status: 'error', error: callError('ended-unexpectedly') };
      return state;

    case 'FAIL':
      // A failure while hanging up still ends the call.
      if (state.status === 'ending') return initialCallState;
      if (state.status === 'connecting' || state.status === 'active' || state.status === 'idle') {
        return { status: 'error', error: event.error };
      }
      return state;

    case 'RESET':
      return initialCallState;
  }
}

/** True while a call may hold the microphone. */
export function isInCall(state: CallState): boolean {
  return state.status === 'connecting' || state.status === 'active' || state.status === 'ending';
}
