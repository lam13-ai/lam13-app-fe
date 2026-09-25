/**
 * Provider-neutral calling contract. UI and hooks depend only on these types; Vapi specifics live in
 * `providers/vapiProvider.ts`.
 */

export type CallStatus = 'idle' | 'connecting' | 'active' | 'ending' | 'error';

export type CallErrorCode =
  | 'not-configured'
  | 'unsupported'
  | 'permission-denied'
  | 'connection-failed'
  | 'call-failed'
  /** The calling SDK failed to load/initialise (a client runtime fault, not the network or the account). */
  | 'provider-error'
  | 'ended-unexpectedly'
  | 'busy';

export interface CallError {
  code: CallErrorCode;
  /** Display-safe message (never raw provider output). */
  message: string;
}

export const CALL_ERROR_MESSAGES: Record<CallErrorCode, string> = {
  'not-configured': "Voice calling isn't configured for this environment.",
  unsupported: "Voice calling isn't supported in this browser.",
  'permission-denied': 'Microphone access was blocked. Allow it in your browser settings to call.',
  'connection-failed': "Couldn't connect the call. Check your connection and try again.",
  'call-failed': 'The call ran into a problem and ended.',
  'provider-error': "Voice calling couldn't start. Refresh the page and try again.",
  'ended-unexpectedly': 'The call ended unexpectedly.',
  busy: 'Finish or delete your voice recording before starting a call.',
};

export function callError(code: CallErrorCode): CallError {
  return { code, message: CALL_ERROR_MESSAGES[code] };
}

export type CallRole = 'user' | 'assistant';

export interface TranscriptUpdate {
  role: CallRole;
  text: string;
  /** false while the speaker is still talking (interim); true once the utterance is final. */
  final: boolean;
}

/**
 * Lifecycle notifications from a provider. `completed`: the remote side (e.g. the assistant) finished
 * the call normally. `ended`: the call went away — expected after our own hang-up, otherwise abrupt.
 */
export type ProviderState = 'connecting' | 'active' | 'completed' | 'ended';

export type Unsubscribe = () => void;

export interface CallProvider {
  /** Starts a call. Rejects with a CallError when the call cannot start. */
  start(): Promise<void>;
  /** Ends the call (idempotent) and releases microphone/audio resources. */
  end(): Promise<void>;
  isActive(): boolean;
  onStateChange(listener: (state: ProviderState) => void): Unsubscribe;
  onTranscript(listener: (update: TranscriptUpdate) => void): Unsubscribe;
  onError(listener: (error: CallError) => void): Unsubscribe;
  /** Optional remote (assistant) output level 0..1 for a level meter. */
  onVolume?(listener: (level: number) => void): Unsubscribe;
  /** Drops listeners and any remaining resources. */
  dispose(): void;
}

export interface CallingConfig {
  publicKey: string;
  assistantId: string;
}

export type CreateCallProvider = (config: CallingConfig) => CallProvider;
