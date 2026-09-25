/**
 * App-wide audio arbitration so audio activities never overlap:
 * - one playback at a time (a new player pauses the previous one);
 * - recording stops playback, and playback cannot start while recording;
 * - a live call (Phase 5) will take precedence over both.
 */
export type AudioActivity = 'playback' | 'recording' | 'call';

interface Owner {
  id: string;
  kind: AudioActivity;
  /** Called when another activity takes over. */
  interrupt: () => void;
}

const PRIORITY: Record<AudioActivity, number> = { playback: 0, recording: 1, call: 2 };

let current: Owner | null = null;

export const audioFocus = {
  /** Claims audio. Returns false when a higher- or equal-priority capture activity owns it. */
  request(owner: Owner): boolean {
    if (current && current.id !== owner.id) {
      const blocked = current.kind !== 'playback' && PRIORITY[owner.kind] <= PRIORITY[current.kind];
      if (blocked) return false;
      const previous = current;
      current = null;
      previous.interrupt();
    }
    current = owner;
    return true;
  },
  release(id: string): void {
    if (current?.id === id) current = null;
  },
  get active(): AudioActivity | null {
    return current?.kind ?? null;
  },
  /** Test helper: forget any owner. */
  reset(): void {
    current = null;
  },
};
