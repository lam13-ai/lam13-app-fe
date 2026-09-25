import { vi } from 'vitest';

/**
 * Test doubles for getUserMedia / MediaRecorder / AudioContext. They model the lifecycle the
 * recorder depends on (tracks that can be stopped, dataavailable → stop events) without audio.
 */

export class FakeTrack extends EventTarget {
  readonly kind = 'audio';
  stopped = false;
  stop = vi.fn(() => {
    this.stopped = true;
  });
}

export class FakeStream {
  readonly tracks = [new FakeTrack()];
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks;
  }
}

type RecorderState = 'inactive' | 'recording' | 'paused';

export class FakeMediaRecorder {
  static supported = new Set(['audio/webm;codecs=opus', 'audio/webm']);
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported(type: string) {
    return FakeMediaRecorder.supported.has(type);
  }
  /** Bytes produced when stopped (0 simulates an empty capture). */
  static payload = 'fake-audio-bytes';

  state: RecorderState = 'inactive';
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readonly stream: FakeStream;
  readonly options?: MediaRecorderOptions;

  constructor(stream: FakeStream, options?: MediaRecorderOptions) {
    this.stream = stream;
    this.options = options;
    this.mimeType = options?.mimeType ?? 'audio/webm';
    FakeMediaRecorder.instances.push(this);
  }
  start() {
    this.state = 'recording';
  }
  pause() {
    this.state = 'paused';
  }
  resume() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob([FakeMediaRecorder.payload], { type: this.mimeType }) });
      this.onstop?.(new Event('stop'));
    });
  }
  /** Simulates an unexpected recorder failure. */
  fail() {
    this.onerror?.(new Event('error'));
  }
}

export class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: 'running' | 'closed' = 'running';
  level = 0.5;
  readonly source = { connect: vi.fn(), disconnect: vi.fn() };
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createMediaStreamSource() {
    return this.source;
  }
  createAnalyser() {
    const level = () => this.level;
    return {
      fftSize: 512,
      getByteTimeDomainData(samples: Uint8Array) {
        const amplitude = Math.round(level() * 40);
        samples.forEach((_, i) => {
          samples[i] = i % 2 === 0 ? 128 + amplitude : 128 - amplitude;
        });
      },
    };
  }
}

export interface FakeMediaOptions {
  /** 'granted' (default), or the DOMException name to reject getUserMedia with. */
  permission?: 'granted' | 'NotAllowedError' | 'NotFoundError' | 'NotReadableError';
  withMediaRecorder?: boolean;
  withAudioContext?: boolean;
}

/** Installs fakes on the jsdom globals and returns handles plus an uninstall function. */
export function installFakeMedia({ permission = 'granted', withMediaRecorder = true, withAudioContext = true }: FakeMediaOptions = {}) {
  FakeMediaRecorder.instances = [];
  FakeAudioContext.instances = [];
  FakeMediaRecorder.payload = 'fake-audio-bytes';
  const streams: FakeStream[] = [];
  const getUserMedia = vi.fn(async () => {
    if (permission !== 'granted') throw new DOMException('denied', permission);
    const stream = new FakeStream();
    streams.push(stream);
    return stream;
  });

  const g = globalThis as Record<string, unknown>;
  const previous = { mediaDevices: navigator.mediaDevices, MediaRecorder: g.MediaRecorder, AudioContext: g.AudioContext };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  g.MediaRecorder = withMediaRecorder ? FakeMediaRecorder : undefined;
  g.AudioContext = withAudioContext ? FakeAudioContext : undefined;

  return {
    getUserMedia,
    streams,
    /** True when every track ever handed out has been stopped. */
    allTracksStopped: () => streams.every((s) => s.tracks.every((t) => t.stopped)),
    uninstall() {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: previous.mediaDevices });
      g.MediaRecorder = previous.MediaRecorder;
      g.AudioContext = previous.AudioContext;
    },
  };
}
