import { Pause, Play } from 'lucide-react';
import { useMemo } from 'react';
import { Waveform } from '@/components/Waveform';
import { cn } from '@/lib/cn';
import { describeDuration, formatDuration } from '@/lib/format';
import { useAudioPlayback } from '../hooks/useAudioPlayback';
import { placeholderPeaks } from '../lib/levels';

export interface VoicePlayerProps {
  /** Playable URL (local blob: URL or server audio URL). Null while unavailable. */
  src: string | null;
  durationMs: number;
  peaks?: number[];
  /** `inverse` sits on the black user-message block; `default` on white surfaces. */
  tone?: 'default' | 'inverse';
  /** Used in accessible labels, e.g. "voice message" or "recording". */
  label?: string;
}

/**
 * Reusable audio clip player: play/pause, waveform progress, seekable position and time.
 * Used for voice-message previews, sent voice messages, and (later) assistant audio.
 */
export function VoicePlayer({ src, durationMs, peaks, tone = 'default', label = 'voice message' }: VoicePlayerProps) {
  const playback = useAudioPlayback(src, durationMs);
  const bars = useMemo(() => (peaks && peaks.length > 0 ? peaks : placeholderPeaks(durationMs)), [peaks, durationMs]);
  const duration = Math.max(1, playback.durationMs);
  const progress = Math.min(1, playback.positionMs / duration);
  const showPosition = playback.playing || playback.positionMs > 0;
  const unavailable = !src || playback.status === 'error';

  return (
    <div className={cn('flex min-w-0 items-center gap-3', tone === 'inverse' ? 'text-bg' : 'text-fg')}>
      <button
        type="button"
        onClick={() => void playback.toggle()}
        disabled={unavailable}
        aria-label={`${playback.playing ? 'Pause' : 'Play'} ${label}`}
        className={cn(
          'hit-area relative flex size-8 shrink-0 items-center justify-center rounded-full transition-colors duration-150 ease-standard',
          'disabled:cursor-default disabled:opacity-40',
          tone === 'inverse'
            ? 'bg-bg text-fg hover:bg-bg/85 focus-visible:outline-bg/70'
            : 'border border-border bg-bg text-fg hover:border-fg/40',
        )}
      >
        {playback.playing ? (
          <Pause size={12} strokeWidth={2} fill="currentColor" aria-hidden />
        ) : (
          <Play size={12} strokeWidth={2} fill="currentColor" aria-hidden className="translate-x-px" />
        )}
      </button>

      <div
        className={cn(
          'relative h-7 min-w-0 flex-1',
          'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
          tone === 'inverse' ? 'has-[:focus-visible]:outline-bg/70' : 'has-[:focus-visible]:outline-fg/40',
        )}
      >
        <Waveform mode="static" peaks={bars} progress={showPosition ? progress : 1} className="h-full" />
        <input
          type="range"
          min={0}
          max={Math.round(duration)}
          step={100}
          value={Math.round(Math.min(playback.positionMs, duration))}
          disabled={unavailable}
          onChange={(e) => playback.seek(Number(e.target.value))}
          aria-label={`Playback position, ${label}`}
          aria-valuetext={`${describeDuration(playback.positionMs)} of ${describeDuration(duration)}`}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-default"
        />
      </div>

      <span className={cn('shrink-0 text-2xs tabular-nums', tone === 'inverse' ? 'text-bg/75' : 'text-fg-muted')}>
        {playback.status === 'error' ? 'Unavailable' : formatDuration(showPosition ? playback.positionMs : duration)}
      </span>
    </div>
  );
}
