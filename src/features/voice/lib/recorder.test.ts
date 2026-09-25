import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, FakeMediaRecorder, FakeStream } from '@/test/fakeMedia';
import { createAudioRecorder, type MediaDeps, type RecorderOptions } from './recorder';
import { VoiceRecorderError } from './types';

let clock = 0;
let streams: FakeStream[];

function deps(overrides: Partial<MediaDeps> = {}): MediaDeps {
  return {
    getUserMedia: vi.fn(async () => {
      const stream = new FakeStream();
      streams.push(stream);
      return stream as unknown as MediaStream;
    }),
    MediaRecorder: FakeMediaRecorder as unknown as typeof MediaRecorder,
    AudioContext: FakeAudioContext as unknown as typeof AudioContext,
    isSecureContext: true,
    ...overrides,
  };
}

function recorder(options: Partial<RecorderOptions> = {}, mediaDeps = deps()) {
  return createAudioRecorder({ maxDurationMs: 5 * 60_000, peakCount: 8, now: () => clock, tickMs: 100, deps: mediaDeps, ...options });
}

const tracksStopped = () => streams.every((s) => s.tracks.every((t) => t.stopped));

beforeEach(() => {
  vi.useFakeTimers();
  clock = 0;
  streams = [];
  FakeMediaRecorder.instances = [];
  FakeAudioContext.instances = [];
  FakeMediaRecorder.payload = 'fake-audio-bytes';
});
afterEach(() => vi.useRealTimers());

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(VoiceRecorderError);
  await promise.catch((e: VoiceRecorderError) => expect(e.code).toBe(code));
}

describe('createAudioRecorder', () => {
  it('rejects clearly when unsupported, insecure, denied or without a device', async () => {
    await expectCode(recorder({}, deps({ MediaRecorder: undefined })).start(), 'unsupported');
    await expectCode(recorder({}, deps({ getUserMedia: undefined })).start(), 'unsupported');
    await expectCode(recorder({}, deps({ isSecureContext: false })).start(), 'insecure-context');
    const denied = deps({ getUserMedia: vi.fn(async () => Promise.reject(new DOMException('no', 'NotAllowedError'))) });
    await expectCode(recorder({}, denied).start(), 'permission-denied');
    const missing = deps({ getUserMedia: vi.fn(async () => Promise.reject(new DOMException('no', 'NotFoundError'))) });
    await expectCode(recorder({}, missing).start(), 'no-device');
  });

  it('releases the microphone when the recorder cannot be created', async () => {
    class Broken {
      static isTypeSupported = () => true;
      constructor() {
        throw new Error('nope');
      }
    }
    await expectCode(recorder({}, deps({ MediaRecorder: Broken as unknown as typeof MediaRecorder })).start(), 'recorder-failed');
    expect(tracksStopped()).toBe(true);
  });

  it('records with a supported MIME type, pauses/resumes, and stops into a playable Blob', async () => {
    const onTick = vi.fn();
    const rec = recorder({ onTick });
    await rec.start();
    const media = FakeMediaRecorder.instances[0]!;
    expect(media.options?.mimeType).toBe('audio/webm;codecs=opus');
    expect(media.state).toBe('recording');

    clock = 2000;
    vi.advanceTimersByTime(200);
    expect(onTick).toHaveBeenLastCalledWith(2000);
    expect(rec.getLevel()).toBeGreaterThan(0);

    rec.pause();
    expect(media.state).toBe('paused');
    clock = 10_000; // paused time is excluded
    rec.resume();
    clock = 11_000;

    const result = await rec.stop();
    expect(result.durationMs).toBe(3000);
    expect(result.blob.size).toBeGreaterThan(0);
    expect(result.blob.type).toBe('audio/webm;codecs=opus');
    expect(result.peaks).toHaveLength(8);

    // Microphone, audio graph and timer are released.
    expect(tracksStopped()).toBe(true);
    expect(FakeAudioContext.instances[0]!.close).toHaveBeenCalled();
    expect(FakeAudioContext.instances[0]!.source.disconnect).toHaveBeenCalled();
    onTick.mockClear();
    vi.advanceTimersByTime(1000);
    expect(onTick).not.toHaveBeenCalled();
  });

  it('signals the maximum duration once', async () => {
    const onLimitReached = vi.fn();
    const rec = recorder({ maxDurationMs: 1000, onLimitReached });
    await rec.start();
    clock = 1000;
    vi.advanceTimersByTime(300);
    expect(onLimitReached).toHaveBeenCalledOnce();
    const result = await rec.stop();
    expect(result.durationMs).toBe(1000);
  });

  it('cancel discards audio and releases everything, even mid-permission', async () => {
    const rec = recorder();
    await rec.start();
    rec.cancel();
    expect(tracksStopped()).toBe(true);
    expect(FakeMediaRecorder.instances[0]!.state).toBe('inactive');

    let resolvePermission!: (s: MediaStream) => void;
    const slow = deps({ getUserMedia: vi.fn(() => new Promise<MediaStream>((r) => (resolvePermission = r))) });
    const pending = recorder({}, slow);
    const started = pending.start();
    pending.cancel();
    const late = new FakeStream();
    streams.push(late);
    resolvePermission(late as unknown as MediaStream);
    await expect(started).rejects.toMatchObject({ name: 'AbortError' });
    expect(late.tracks[0]!.stopped).toBe(true);
  });

  it('reports unexpected failures (recorder error, device unplugged) and releases the mic', async () => {
    const onFailure = vi.fn();
    const rec = recorder({ onFailure });
    await rec.start();
    FakeMediaRecorder.instances[0]!.fail();
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ code: 'recording-failed' }));
    expect(tracksStopped()).toBe(true);

    const onFailure2 = vi.fn();
    const rec2 = recorder({ onFailure: onFailure2 });
    await rec2.start();
    streams.at(-1)!.tracks[0]!.dispatchEvent(new Event('ended'));
    expect(onFailure2).toHaveBeenCalledOnce();
  });

  it('rejects an empty capture', async () => {
    FakeMediaRecorder.payload = '';
    const rec = recorder();
    await rec.start();
    await expectCode(rec.stop(), 'empty-recording');
    expect(tracksStopped()).toBe(true);
  });

  it('works without Web Audio (level stays 0)', async () => {
    const rec = recorder({}, deps({ AudioContext: undefined }));
    await rec.start();
    expect(rec.getLevel()).toBe(0);
    const result = await rec.stop();
    expect(result.blob.size).toBeGreaterThan(0);
  });
});
