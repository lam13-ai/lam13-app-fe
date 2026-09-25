import { abortError } from '@/api';
import { rmsLevel, toPeaks } from './levels';
import { pickAudioMimeType } from './mime';
import { VoiceRecorderError, type Recording, type VoiceErrorCode } from './types';

/**
 * Browser capabilities the recorder needs. Injected so the engine is testable without a browser;
 * `browserMediaDeps()` reads the real ones at call time.
 */
export interface MediaDeps {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  MediaRecorder?: typeof MediaRecorder;
  AudioContext?: typeof AudioContext;
  isSecureContext: boolean;
}

export function browserMediaDeps(): MediaDeps {
  const mediaDevices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  const scope = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  return {
    getUserMedia: mediaDevices?.getUserMedia ? (constraints) => mediaDevices.getUserMedia(constraints) : undefined,
    MediaRecorder: typeof MediaRecorder === 'undefined' ? undefined : MediaRecorder,
    AudioContext: typeof scope.AudioContext === 'undefined' ? scope.webkitAudioContext : scope.AudioContext,
    isSecureContext: scope.isSecureContext !== false,
  };
}

export interface RecorderOptions {
  maxDurationMs: number;
  peakCount: number;
  /** Called every `tickMs` while capturing, with the elapsed (unpaused) time. */
  onTick?: (elapsedMs: number) => void;
  /** Called once when the maximum duration is reached (the owner should stop). */
  onLimitReached?: () => void;
  /** Unexpected failure while recording (device lost, recorder error). Resources are already released. */
  onFailure?: (error: VoiceRecorderError) => void;
  deps?: MediaDeps;
  now?: () => number;
  tickMs?: number;
}

export interface AudioRecorder {
  readonly canPause: boolean;
  /** Requests the microphone and starts recording. Rejects with VoiceRecorderError (or AbortError if cancelled). */
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  /** Stops and resolves with the recording. Microphone and audio graph are released. */
  stop(): Promise<Recording>;
  /** Discards everything and releases the microphone. Safe to call at any time, repeatedly. */
  cancel(): void;
  /** Current input level 0..1 (0 when not recording) — polled by the waveform, no React state. */
  getLevel(): number;
  getElapsedMs(): number;
}

function mapMediaError(error: unknown): Exclude<VoiceErrorCode, 'upload-failed'> {
  const name = typeof error === 'object' && error !== null ? (error as { name?: string }).name : undefined;
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return 'permission-denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'no-device';
    case 'TypeError':
      return 'unsupported';
    default:
      return 'recorder-failed';
  }
}

/** Native MediaRecorder + Web Audio level meter. One instance records once. */
export function createAudioRecorder(options: RecorderOptions): AudioRecorder {
  const deps = options.deps ?? browserMediaDeps();
  const now = options.now ?? (() => performance.now());
  const tickMs = options.tickMs ?? 100;

  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let audioContext: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let samples: Uint8Array<ArrayBuffer> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let chunks: Blob[] = [];
  let levels: number[] = [];
  let accumulatedMs = 0;
  let segmentStart: number | null = null;
  let closed = false;
  let limitNotified = false;
  let pendingStop: { resolve: (recording: Recording) => void; reject: (error: unknown) => void } | null = null;

  const elapsed = () => accumulatedMs + (segmentStart === null ? 0 : now() - segmentStart);

  const readLevel = () => {
    if (!analyser || !samples) return 0;
    analyser.getByteTimeDomainData(samples);
    return rmsLevel(samples);
  };

  const onTrackEnded = () => fail('recording-failed');

  /** Stops every track and tears down the audio graph. Never leaves the microphone on. */
  function release() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    stream?.getTracks().forEach((track) => {
      track.removeEventListener('ended', onTrackEnded);
      track.stop();
    });
    stream = null;
    try {
      source?.disconnect();
    } catch {
      // already disconnected
    }
    source = null;
    analyser = null;
    samples = null;
    if (audioContext && audioContext.state !== 'closed') void audioContext.close().catch(() => {});
    audioContext = null;
  }

  function detachRecorder() {
    if (!recorder) return;
    recorder.ondataavailable = null;
    recorder.onstop = null;
    recorder.onerror = null;
    if (recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // ignore
      }
    }
  }

  function fail(code: Exclude<VoiceErrorCode, 'upload-failed'>) {
    if (closed) return;
    closed = true;
    detachRecorder();
    release();
    chunks = [];
    const error = new VoiceRecorderError(code);
    if (pendingStop) {
      pendingStop.reject(error);
      pendingStop = null;
    } else {
      options.onFailure?.(error);
    }
  }

  return {
    get canPause() {
      return typeof deps.MediaRecorder?.prototype?.pause === 'function';
    },

    async start() {
      if (!deps.isSecureContext) throw new VoiceRecorderError('insecure-context');
      if (!deps.getUserMedia || !deps.MediaRecorder) throw new VoiceRecorderError('unsupported');

      let media: MediaStream;
      try {
        media = await deps.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (error) {
        throw new VoiceRecorderError(mapMediaError(error));
      }
      // Cancelled while the permission prompt was open: release immediately.
      if (closed) {
        media.getTracks().forEach((track) => track.stop());
        throw abortError();
      }
      stream = media;

      const Recorder = deps.MediaRecorder;
      const mimeType = pickAudioMimeType(Recorder.isTypeSupported?.bind(Recorder));
      try {
        recorder = new Recorder(media, mimeType ? { mimeType, audioBitsPerSecond: 64_000 } : undefined);
      } catch {
        closed = true;
        release();
        throw new VoiceRecorderError('recorder-failed');
      }

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => fail('recording-failed');
      media.getTracks().forEach((track) => track.addEventListener('ended', onTrackEnded));

      // Level meter (optional — recording works without it).
      if (deps.AudioContext) {
        try {
          audioContext = new deps.AudioContext();
          source = audioContext.createMediaStreamSource(media);
          analyser = audioContext.createAnalyser();
          analyser.fftSize = 512;
          samples = new Uint8Array(new ArrayBuffer(analyser.fftSize));
          source.connect(analyser);
        } catch {
          analyser = null;
        }
      }

      try {
        recorder.start(250);
      } catch {
        closed = true;
        detachRecorder();
        release();
        throw new VoiceRecorderError('recorder-failed');
      }

      segmentStart = now();
      timer = setInterval(() => {
        if (closed) return;
        if (recorder?.state === 'recording') levels.push(readLevel());
        const ms = elapsed();
        options.onTick?.(ms);
        if (ms >= options.maxDurationMs && !limitNotified) {
          limitNotified = true;
          options.onLimitReached?.();
        }
      }, tickMs);
    },

    pause() {
      if (closed || recorder?.state !== 'recording' || typeof recorder.pause !== 'function') return;
      recorder.pause();
      if (segmentStart !== null) accumulatedMs += now() - segmentStart;
      segmentStart = null;
    },

    resume() {
      if (closed || recorder?.state !== 'paused') return;
      recorder.resume();
      segmentStart = now();
    },

    stop() {
      return new Promise<Recording>((resolve, reject) => {
        const active = recorder;
        if (closed || !active) {
          reject(new VoiceRecorderError('recording-failed'));
          return;
        }
        const durationMs = Math.min(elapsed(), options.maxDurationMs);
        if (segmentStart !== null) accumulatedMs += now() - segmentStart;
        segmentStart = null;
        pendingStop = { resolve, reject };

        active.onstop = () => {
          const pending = pendingStop;
          if (!pending) return;
          pendingStop = null;
          closed = true;
          const type = active.mimeType || chunks[0]?.type || 'audio/webm';
          const blob = new Blob(chunks, { type });
          chunks = [];
          release();
          if (blob.size === 0) pending.reject(new VoiceRecorderError('empty-recording'));
          else pending.resolve({ blob, mimeType: type, durationMs, peaks: toPeaks(levels, options.peakCount) });
        };

        try {
          if (active.state === 'inactive') active.onstop(new Event('stop'));
          else active.stop();
        } catch {
          fail('recording-failed');
        }
      });
    },

    cancel() {
      if (closed) return;
      closed = true;
      detachRecorder();
      release();
      chunks = [];
      levels = [];
      if (pendingStop) {
        pendingStop.reject(abortError());
        pendingStop = null;
      }
    },

    getLevel() {
      return closed || recorder?.state !== 'recording' ? 0 : readLevel();
    },

    getElapsedMs: elapsed,
  };
}
