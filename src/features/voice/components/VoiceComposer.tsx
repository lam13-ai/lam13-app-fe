import { ArrowUp, Mic, Pause, RotateCcw, Square, Trash2, X } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Waveform } from '@/components/Waveform';
import { Button, IconButton, Spinner, Tooltip, iconProps } from '@/components/ui';
import { cn } from '@/lib/cn';
import { describeDuration, formatDuration } from '@/lib/format';
import { VOICE_CONFIG } from '../config';
import { useObjectUrl } from '../hooks/useObjectUrl';
import { useTranscript, type TranscribeRecording } from '../hooks/useTranscript';
import type { SendRecording, VoiceRecorderApi } from '../hooks/useVoiceRecorder';
import type { RecorderState } from '../lib/recorderMachine';
import type { Recording } from '../lib/types';
import { VoicePlayer } from './VoicePlayer';

/** Black round primary action — same treatment as the composer's send button. */
function PrimaryRound({
  label,
  onClick,
  disabled,
  busy,
  autoFocus,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  autoFocus?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-busy={busy || undefined}
      disabled={disabled}
      onClick={onClick}
      autoFocus={autoFocus}
      className="hit-area relative flex size-8 shrink-0 items-center justify-center rounded-full bg-fg text-bg transition-opacity duration-200 ease-standard hover:opacity-90 disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function announcement(state: RecorderState): string {
  switch (state.status) {
    case 'requesting':
      return 'Requesting microphone access.';
    case 'recording':
      return 'Recording.';
    case 'paused':
      return 'Recording paused.';
    case 'stopping':
      return 'Finishing recording.';
    case 'preview':
      return `Recording ready to review, ${describeDuration(state.recording.durationMs)}.${state.limitReached ? ' Maximum length reached.' : ''}`;
    case 'uploading':
      return 'Sending voice message.';
    default:
      return '';
  }
}

function RecordingBar({ recorder, onSend }: { recorder: VoiceRecorderApi; onSend: SendRecording }) {
  const { state, maxDurationMs } = recorder;
  const elapsed = 'elapsedMs' in state ? state.elapsedMs : 0;
  const remaining = Math.max(0, maxDurationMs - elapsed);
  const warn = remaining <= VOICE_CONFIG.warnRemainingMs;
  const paused = state.status === 'paused';
  const stopping = state.status === 'stopping';

  return (
    <div className="flex h-12 items-center gap-1 px-2">
      <Tooltip content="Delete recording">
        <IconButton label="Delete recording" size="md" icon={<Trash2 {...iconProps} />} onClick={recorder.discard} />
      </Tooltip>

      <div className="flex shrink-0 items-center gap-2 pl-1 text-xs tabular-nums" aria-hidden="true">
        <span className={cn('size-2 bg-danger', !paused && 'motion-safe:animate-pulse', paused && 'opacity-40')} />
        {warn ? (
          <span className="text-danger">{formatDuration(remaining)} left</span>
        ) : (
          <span>
            {formatDuration(elapsed)}
            <span className="text-fg-muted max-sm:hidden"> / {formatDuration(maxDurationMs)}</span>
          </span>
        )}
        {paused && <span className="text-fg-muted max-sm:hidden">Paused</span>}
      </div>

      <Waveform
        mode="live"
        getLevel={recorder.getLevel}
        active={state.status === 'recording'}
        className={cn('mx-2 min-w-0 flex-1', paused ? 'text-fg/30' : 'text-fg/70')}
      />

      {recorder.canPause && (
        <Tooltip content={paused ? 'Resume' : 'Pause'}>
          <IconButton
            label={paused ? 'Resume recording' : 'Pause recording'}
            size="md"
            disabled={stopping}
            icon={paused ? <Mic {...iconProps} /> : <Pause {...iconProps} />}
            onClick={paused ? recorder.resume : recorder.pause}
          />
        </Tooltip>
      )}
      <Tooltip content="Stop and review" align="end">
        <IconButton
          label="Stop recording"
          size="md"
          disabled={stopping}
          icon={<Square {...iconProps} size={14} />}
          onClick={() => void recorder.stop()}
          autoFocus
        />
      </Tooltip>
      {VOICE_CONFIG.directSend && (
        <PrimaryRound label="Send voice message" disabled={stopping} onClick={() => void recorder.stopAndSend(onSend)}>
          <ArrowUp size={14} strokeWidth={1.75} aria-hidden />
        </PrimaryRound>
      )}
    </div>
  );
}

/**
 * The detected transcript under the preview, for review before sending. Sending never waits for it:
 * the recording is the message, the transcript only a preview.
 */
function TranscriptPreview({ recording, transcribe }: { recording: Recording; transcribe: TranscribeRecording | undefined }) {
  const { state, retry } = useTranscript(recording, transcribe);
  const labelId = useId();
  if (!state) return null;
  return (
    <div className="animate-fade border-t border-hairline px-4 pb-2.5 pt-2">
      <p id={labelId} className="text-2xs font-bold uppercase tracking-eyebrow text-fg-muted">
        Detected transcript
      </p>
      <div aria-live="polite">
        {state.status === 'loading' && (
          <p className="mt-1 flex items-center gap-2 text-xs text-fg-muted">
            <Spinner size={14} state="active" />
            Transcribing…
          </p>
        )}
        {state.status === 'ready' &&
          (state.text ? (
            <p
              // Scrollable when long: focusable so keyboard users can scroll it.
              tabIndex={0}
              aria-labelledby={labelId}
              className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-fg"
            >
              {state.text}
            </p>
          ) : (
            <p className="mt-1 text-xs text-fg-muted">No speech detected.</p>
          ))}
        {state.status === 'error' && (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-danger">
            Couldn&apos;t transcribe this recording. You can still send it.
            <button
              type="button"
              onClick={retry}
              className="min-h-11 font-bold text-fg underline-offset-4 hover:underline md:min-h-0"
            >
              Try again
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

function PreviewBar({
  recorder,
  onSend,
  transcribe,
}: {
  recorder: VoiceRecorderApi;
  onSend: SendRecording;
  transcribe: TranscribeRecording | undefined;
}) {
  const { state } = recorder;
  const recording = state.status === 'preview' || state.status === 'uploading' ? state.recording : null;
  const uploading = state.status === 'uploading';
  const url = useObjectUrl(recording?.blob);
  if (!recording) return null;

  return (
    <div>
      <div className="flex h-12 items-center gap-1 px-2">
        <Tooltip content={uploading ? 'Cancel sending' : 'Delete recording'}>
          <IconButton
            label={uploading ? 'Cancel sending' : 'Delete recording'}
            size="md"
            icon={uploading ? <X {...iconProps} /> : <Trash2 {...iconProps} />}
            onClick={recorder.discard}
          />
        </Tooltip>
        <div className="min-w-0 flex-1 px-2">
          <VoicePlayer src={url} durationMs={recording.durationMs} peaks={recording.peaks} label="recording" />
        </div>
        <Tooltip content="Re-record" align="end">
          <IconButton
            label="Re-record"
            size="md"
            disabled={uploading}
            icon={<RotateCcw {...iconProps} />}
            onClick={() => void recorder.start()}
          />
        </Tooltip>
        <PrimaryRound
          label={uploading ? 'Sending voice message' : 'Send voice message'}
          disabled={uploading}
          busy={uploading}
          autoFocus={!uploading}
          onClick={() => void recorder.send(onSend)}
        >
          {uploading ? <Spinner size={16} state="active" /> : <ArrowUp size={14} strokeWidth={1.75} aria-hidden />}
        </PrimaryRound>
      </div>
      {state.status === 'preview' && state.limitReached && (
        <p className="px-4 pb-2 text-2xs text-fg-muted">
          Maximum length reached ({formatDuration(recorder.maxDurationMs)}).
        </p>
      )}
      <TranscriptPreview recording={recording} transcribe={transcribe} />
    </div>
  );
}

function ErrorBar({ recorder, onSend }: { recorder: VoiceRecorderApi; onSend: SendRecording }) {
  const { state } = recorder;
  if (state.status !== 'error') return null;
  const canRetryUpload = state.recording !== null;
  const canRetryRecording = !['unsupported', 'insecure-context'].includes(state.error.code);

  return (
    <div role="alert" className="flex min-h-12 flex-wrap items-center gap-x-2 gap-y-1 py-1.5 pl-4 pr-2">
      <p className="min-w-0 flex-1 text-xs text-danger">{state.error.message}</p>
      <div className="flex items-center gap-1">
        {canRetryUpload ? (
          <Button variant="ghost" size="sm" onClick={() => void recorder.send(onSend)}>
            Retry sending
          </Button>
        ) : (
          canRetryRecording && (
            <Button variant="ghost" size="sm" onClick={() => void recorder.start()}>
              Try again
            </Button>
          )
        )}
        <IconButton
          label={canRetryUpload ? 'Delete recording' : 'Dismiss'}
          size="md"
          icon={canRetryUpload ? <Trash2 {...iconProps} /> : <X {...iconProps} />}
          onClick={recorder.discard}
        />
      </div>
    </div>
  );
}

/**
 * The composer's voice mode (reference-styled, inside the same 24px pill):
 * permission prompt → recording bar → preview (+ detected transcript when `transcribe` is given) / send →
 * error. Media access stays in the hook.
 */
export function VoiceComposer({
  recorder,
  onSend,
  transcribe,
}: {
  recorder: VoiceRecorderApi;
  onSend: SendRecording;
  /** Omitted when the backend can't transcribe: the preview then shows no transcript section. */
  transcribe?: TranscribeRecording;
}) {
  const { state } = recorder;
  return (
    <div className="animate-fade">
      <p role="status" className="sr-only">
        {announcement(state)}
      </p>
      {state.status === 'requesting' && (
        <div className="flex h-12 items-center gap-3 pl-4 pr-2 text-xs text-fg-muted">
          <Spinner size={16} state="active" />
          <span className="min-w-0 flex-1 truncate">Allow microphone access to record…</span>
          <IconButton label="Cancel recording" size="md" icon={<X {...iconProps} />} onClick={recorder.discard} />
        </div>
      )}
      {(state.status === 'recording' || state.status === 'paused' || state.status === 'stopping') && (
        <RecordingBar recorder={recorder} onSend={onSend} />
      )}
      {(state.status === 'preview' || state.status === 'uploading') && (
        <PreviewBar recorder={recorder} onSend={onSend} transcribe={transcribe} />
      )}
      {state.status === 'error' && <ErrorBar recorder={recorder} onSend={onSend} />}
    </div>
  );
}
