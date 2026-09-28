import { ArrowUp, RotateCcw, Square, Trash2, X } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Waveform } from '@/components/Waveform';
import { Button, IconButton, Spinner, Tooltip, iconProps } from '@/components/ui';
import { cn } from '@/lib/cn';
import { describeDuration, formatDuration } from '@/lib/format';
import { VOICE_CONFIG } from '../config';
import { useObjectUrl } from '../hooks/useObjectUrl';
import { useTranscript, type TranscribeRecording } from '../hooks/useTranscript';
import type { SendRecording, VoiceRecorderApi } from '../hooks/useVoiceRecorder';
import type { RecorderState, UploadIntent } from '../lib/recorderMachine';
import type { Recording } from '../lib/types';
import { VoicePlayer } from './VoicePlayer';

/**
 * Two modes. Voice notes (no `onReview`): the recording is the message — Stop previews it, Send sends it.
 * Transcription (`onReview` given, backends without voice messages): Stop transcribes it into the message
 * box to edit (`review`), Send transcribes it and sends the text at once (`send`).
 */
type Mode = 'voiceNote' | 'transcription';

const VOICE_NOTE = { send: 'Send voice message', busy: 'Sending voice message', retry: 'Retry sending' };
const LABELS: Record<Mode, Record<UploadIntent, { send: string; busy: string; retry: string }>> = {
  voiceNote: { send: VOICE_NOTE, review: VOICE_NOTE },
  transcription: {
    send: { send: 'Send recording', busy: 'Transcribing and sending', retry: 'Retry sending' },
    review: { send: 'Transcribe recording', busy: 'Transcribing recording', retry: 'Retry transcription' },
  },
};

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

function announcement(state: RecorderState, mode: Mode): string {
  switch (state.status) {
    case 'requesting':
      return 'Requesting microphone access.';
    case 'recording':
      return 'Recording.';
    case 'stopping':
      return state.intent === 'preview' || mode === 'voiceNote' ? 'Finishing recording.' : `${LABELS[mode][state.intent].busy}.`;
    case 'preview':
      return `Recording ready to review, ${describeDuration(state.recording.durationMs)}.${state.limitReached ? ' Maximum length reached.' : ''}`;
    case 'uploading':
      return `${LABELS[mode][state.intent].busy}.`;
    default:
      return '';
  }
}

function RecordingBar({
  recorder,
  onSend,
  onReview,
}: {
  recorder: VoiceRecorderApi;
  onSend: SendRecording;
  onReview: SendRecording | undefined;
}) {
  const mode: Mode = onReview ? 'transcription' : 'voiceNote';
  const { state, maxDurationMs } = recorder;
  const elapsed = 'elapsedMs' in state ? state.elapsedMs : 0;
  const remaining = Math.max(0, maxDurationMs - elapsed);
  const warn = remaining <= VOICE_CONFIG.warnRemainingMs;
  const stopping = state.status === 'stopping';

  return (
    <div className="flex h-12 items-center gap-1 px-2">
      <Tooltip content="Delete recording">
        <IconButton label="Delete recording" size="md" icon={<Trash2 {...iconProps} />} onClick={recorder.discard} />
      </Tooltip>

      <div className="flex shrink-0 items-center gap-2 pl-1 text-xs tabular-nums" aria-hidden="true">
        <span className={cn('size-2 bg-danger', !stopping && 'motion-safe:animate-pulse')} />
        {warn ? (
          <span className="text-danger">{formatDuration(remaining)} left</span>
        ) : (
          <span>
            {formatDuration(elapsed)}
            <span className="text-fg-muted max-sm:hidden"> / {formatDuration(maxDurationMs)}</span>
          </span>
        )}
      </div>

      <Waveform
        mode="live"
        getLevel={recorder.getLevel}
        active={state.status === 'recording'}
        className="mx-2 min-w-0 flex-1 text-fg/70"
      />

      <Tooltip content={onReview ? 'Stop and transcribe' : 'Stop and review'} align="end">
        <IconButton
          label="Stop recording"
          size="md"
          disabled={stopping}
          icon={<Square {...iconProps} size={14} />}
          onClick={() => void (onReview ? recorder.stopAndSend(onReview, 'review') : recorder.stop())}
          autoFocus
        />
      </Tooltip>
      {VOICE_CONFIG.directSend && (
        <PrimaryRound
          label={LABELS[mode].send.send}
          disabled={stopping}
          onClick={() => void recorder.stopAndSend(onSend, 'send')}
        >
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
  onReview,
  transcribe,
}: {
  recorder: VoiceRecorderApi;
  onSend: SendRecording;
  onReview: SendRecording | undefined;
  transcribe: TranscribeRecording | undefined;
}) {
  const mode: Mode = onReview ? 'transcription' : 'voiceNote';
  // A preview on the transcription backend (the length limit stopped it) is transcribed for review.
  const intent: UploadIntent = onReview ? 'review' : 'send';
  const { state } = recorder;
  const recording = state.status === 'preview' || state.status === 'uploading' ? state.recording : null;
  const uploading = state.status === 'uploading';
  const url = useObjectUrl(recording?.blob);
  if (!recording) return null;

  return (
    <div>
      <div className="flex h-12 items-center gap-1 px-2">
        <Tooltip content={uploading ? 'Cancel' : 'Delete recording'}>
          <IconButton
            label={uploading ? (onReview ? 'Cancel transcription' : 'Cancel sending') : 'Delete recording'}
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
          label={uploading ? LABELS[mode][intent].busy : LABELS[mode][intent].send}
          disabled={uploading}
          busy={uploading}
          autoFocus={!uploading}
          onClick={() => void recorder.send(onReview ?? onSend, intent)}
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

/**
 * Transcribing after Stop (for review) or Send: the recording is finished; the row says what is happening
 * until the text lands in the message box, or is sent. Cancel discards the recording.
 */
function TranscribingBar({ recorder, intent }: { recorder: VoiceRecorderApi; intent: UploadIntent }) {
  const { state } = recorder;
  const durationMs = state.status === 'uploading' ? state.recording.durationMs : 'elapsedMs' in state ? state.elapsedMs : 0;
  return (
    // Cancel sits on the left like Delete on the other bars — never under the Stop / Send just clicked,
    // so a double click can't cancel.
    <div className="flex h-12 animate-fade select-none items-center gap-1 px-2 text-xs text-fg-muted">
      <Tooltip content="Cancel">
        <IconButton label="Cancel transcription" size="md" icon={<X {...iconProps} />} onClick={recorder.discard} />
      </Tooltip>
      <span className="flex min-w-0 flex-1 items-center gap-2 pl-1">
        <Spinner size={16} state="active" />
        <span className="truncate">{intent === 'send' ? 'Transcribing and sending…' : 'Transcribing recording…'}</span>
      </span>
      <span className="shrink-0 pr-3 tabular-nums max-sm:hidden" aria-hidden="true">
        {formatDuration(durationMs)}
      </span>
    </div>
  );
}

function ErrorBar({
  recorder,
  onSend,
  onReview,
}: {
  recorder: VoiceRecorderApi;
  onSend: SendRecording;
  onReview: SendRecording | undefined;
}) {
  const { state } = recorder;
  if (state.status !== 'error') return null;
  const mode: Mode = onReview ? 'transcription' : 'voiceNote';
  // Retry repeats the failed step: a failed review is transcribed for review again, a failed send is sent.
  const retry = state.intent === 'review' && onReview ? onReview : onSend;
  const canRetryUpload = state.recording !== null;
  const canRetryRecording = !['unsupported', 'insecure-context'].includes(state.error.code);

  return (
    <div role="alert" className="flex min-h-12 flex-wrap items-center gap-x-2 gap-y-1 py-1.5 pl-4 pr-2">
      <p className="min-w-0 flex-1 text-xs text-danger">{state.error.message}</p>
      <div className="flex items-center gap-1">
        {canRetryUpload ? (
          <Button variant="ghost" size="sm" onClick={() => void recorder.send(retry)}>
            {LABELS[mode][state.intent].retry}
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
 * error. With `onReview`, Stop and Send transcribe instead (a transcribing row, no preview). Media access
 * stays in the hook.
 */
export function VoiceComposer({
  recorder,
  onSend,
  onReview,
  transcribe,
}: {
  recorder: VoiceRecorderApi;
  /** Send: sends the recording (voice note), or transcribes it and sends the text. */
  onSend: SendRecording;
  /** Stop: transcribes the recording into the message box for editing. Omit for voice notes (Stop previews). */
  onReview?: SendRecording;
  /** Omitted when the backend can't transcribe: the preview then shows no transcript section. */
  transcribe?: TranscribeRecording;
}) {
  const { state } = recorder;
  const mode: Mode = onReview ? 'transcription' : 'voiceNote';
  const transcribing =
    mode === 'transcription' && (state.status === 'uploading' || (state.status === 'stopping' && state.intent !== 'preview'))
      ? (state.intent as UploadIntent)
      : null;
  return (
    <div className="animate-fade">
      <p role="status" className="sr-only">
        {announcement(state, mode)}
      </p>
      {state.status === 'requesting' && (
        <div className="flex h-12 items-center gap-3 pl-4 pr-2 text-xs text-fg-muted">
          <Spinner size={16} state="active" />
          <span className="min-w-0 flex-1 truncate">Allow microphone access to record…</span>
          <IconButton label="Cancel recording" size="md" icon={<X {...iconProps} />} onClick={recorder.discard} />
        </div>
      )}
      {transcribing && <TranscribingBar recorder={recorder} intent={transcribing} />}
      {(state.status === 'recording' || state.status === 'stopping') && !transcribing && (
        <RecordingBar recorder={recorder} onSend={onSend} onReview={onReview} />
      )}
      {(state.status === 'preview' || state.status === 'uploading') && !transcribing && (
        <PreviewBar recorder={recorder} onSend={onSend} onReview={onReview} transcribe={transcribe} />
      )}
      {state.status === 'error' && <ErrorBar recorder={recorder} onSend={onSend} onReview={onReview} />}
    </div>
  );
}
