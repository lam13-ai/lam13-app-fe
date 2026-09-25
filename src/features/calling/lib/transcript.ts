import type { CallRole, TranscriptUpdate } from '../types';

export interface TranscriptEntry {
  id: number;
  role: CallRole;
  text: string;
  final: boolean;
}

export type TranscriptAction = { type: 'update'; update: TranscriptUpdate } | { type: 'clear' };

/**
 * Merges streaming transcript updates into utterances: interim text for the same speaker replaces
 * the open (non-final) line; a final update closes it; a new speaker or a new utterance starts a line.
 * In-memory only — call transcripts are never persisted or added to chat history.
 */
export function transcriptReducer(entries: TranscriptEntry[], action: TranscriptAction): TranscriptEntry[] {
  if (action.type === 'clear') return [];
  const { role, text, final } = action.update;
  const clean = text.trim();
  if (!clean) return entries;

  const last = entries.at(-1);
  if (last && last.role === role && !last.final) {
    return [...entries.slice(0, -1), { ...last, text: clean, final }];
  }
  return [...entries, { id: (last?.id ?? 0) + 1, role, text: clean, final }];
}
