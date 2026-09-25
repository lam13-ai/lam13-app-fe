import { describe, expect, it, vi } from 'vitest';
import { describeDuration, formatDuration } from '@/lib/format';
import { audioFocus } from './audioFocus';
import { rmsLevel, toPeaks } from './levels';
import { baseMimeType, pickAudioMimeType } from './mime';
import { initialRecorderState, isCapturing, recorderReducer, type RecorderEvent, type RecorderState } from './recorderMachine';
import type { Recording } from './types';

const recording: Recording = { blob: new Blob(['x'], { type: 'audio/webm' }), mimeType: 'audio/webm', durationMs: 4200, peaks: [0.5] };
const run = (events: RecorderEvent[], from: RecorderState = initialRecorderState) => events.reduce(recorderReducer, from);

describe('pickAudioMimeType', () => {
  it('prefers Opus/WebM, then MP4 (Safari), then Ogg, else the browser default', () => {
    expect(pickAudioMimeType((t) => t.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
    expect(pickAudioMimeType((t) => t === 'audio/mp4')).toBe('audio/mp4');
    expect(pickAudioMimeType((t) => t === 'audio/ogg;codecs=opus')).toBe('audio/ogg;codecs=opus');
    expect(pickAudioMimeType(() => false)).toBe('');
    expect(pickAudioMimeType(undefined)).toBe('');
    expect(
      pickAudioMimeType(() => {
        throw new Error('boom');
      }),
    ).toBe('');
    expect(baseMimeType('audio/webm;codecs=opus')).toBe('audio/webm');
  });
});

describe('recorderReducer', () => {
  it('walks the happy path: idle → requesting → recording ⇄ paused → stopping → preview → uploading → sent', () => {
    let state = run([{ type: 'REQUEST' }]);
    expect(state.status).toBe('requesting');
    state = run([{ type: 'STARTED' }, { type: 'TICK', elapsedMs: 2000 }], state);
    expect(state).toEqual({ status: 'recording', elapsedMs: 2000 });
    state = run([{ type: 'PAUSE' }, { type: 'TICK', elapsedMs: 9999 }], state);
    expect(state).toEqual({ status: 'paused', elapsedMs: 2000 });
    state = run([{ type: 'RESUME' }, { type: 'STOP' }], state);
    expect(state).toEqual({ status: 'stopping', elapsedMs: 2000 });
    state = run([{ type: 'STOPPED', recording }], state);
    expect(state).toEqual({ status: 'preview', recording, limitReached: false });
    state = run([{ type: 'UPLOAD' }], state);
    expect(state).toEqual({ status: 'uploading', recording });
    expect(run([{ type: 'UPLOADED' }], state)).toEqual({ status: 'sent' });
  });

  it('models failures: permission/recording errors drop audio, upload errors keep it for retry', () => {
    expect(run([{ type: 'REQUEST' }, { type: 'FAIL', error: { code: 'permission-denied', message: 'x' } }])).toMatchObject({
      status: 'error',
      recording: null,
    });
    expect(
      run([{ type: 'REQUEST' }, { type: 'STARTED' }, { type: 'FAIL', error: { code: 'recording-failed', message: 'x' } }]),
    ).toMatchObject({ status: 'error', recording: null });

    const failed = run([{ type: 'UPLOAD_FAILED', error: { code: 'upload-failed', message: 'x' } }], { status: 'uploading', recording });
    expect(failed).toMatchObject({ status: 'error', recording });
    expect(run([{ type: 'UPLOAD' }], failed)).toEqual({ status: 'uploading', recording });
  });

  it('ignores invalid events and always resets', () => {
    expect(run([{ type: 'PAUSE' }, { type: 'UPLOAD' }, { type: 'STOPPED', recording }])).toEqual(initialRecorderState);
    const uploading: RecorderState = { status: 'uploading', recording };
    expect(run([{ type: 'REQUEST' }, { type: 'UPLOAD' }], uploading)).toBe(uploading); // no double send / re-record mid-upload
    expect(run([{ type: 'RESET' }], uploading)).toEqual(initialRecorderState);
    expect(run([{ type: 'STOPPED', recording, limitReached: true }], { status: 'recording', elapsedMs: 1 })).toMatchObject({
      limitReached: true,
    });
  });

  it('reports when the microphone may be in use', () => {
    expect(['requesting', 'recording', 'paused', 'stopping'].every((s) => isCapturing(s as never))).toBe(true);
    expect(['idle', 'preview', 'uploading', 'sent', 'error'].some((s) => isCapturing(s as never))).toBe(false);
  });
});

describe('levels', () => {
  it('computes RMS from 8-bit samples and normalised peaks', () => {
    expect(rmsLevel(new Uint8Array([128, 128, 128]))).toBe(0);
    expect(rmsLevel(new Uint8Array([255, 0, 255, 0]))).toBe(1);
    expect(toPeaks([0.1, 0.2, 0.4, 0.8], 2)).toEqual([0.25, 1]);
    expect(toPeaks([], 3)).toEqual([0.12, 0.12, 0.12]);
  });
});

describe('audioFocus', () => {
  it('lets playback replace playback, recording interrupt playback, and blocks playback while recording', () => {
    const a = vi.fn();
    const b = vi.fn();
    expect(audioFocus.request({ id: 'a', kind: 'playback', interrupt: a })).toBe(true);
    expect(audioFocus.request({ id: 'b', kind: 'playback', interrupt: b })).toBe(true);
    expect(a).toHaveBeenCalledOnce();

    const rec = vi.fn();
    expect(audioFocus.request({ id: 'rec', kind: 'recording', interrupt: rec })).toBe(true);
    expect(b).toHaveBeenCalledOnce();
    expect(audioFocus.request({ id: 'c', kind: 'playback', interrupt: vi.fn() })).toBe(false);
    expect(audioFocus.request({ id: 'rec2', kind: 'recording', interrupt: vi.fn() })).toBe(false);
    expect(audioFocus.active).toBe('recording');

    audioFocus.release('rec');
    expect(audioFocus.active).toBeNull();
  });
});

describe('duration formatting', () => {
  it('formats m:ss and spoken durations', () => {
    expect(formatDuration(75_400)).toBe('1:15');
    expect(formatDuration(-5)).toBe('0:00');
    expect(formatDuration(5 * 60_000)).toBe('5:00');
    expect(describeDuration(75_400)).toBe('1 minute 15 seconds');
    expect(describeDuration(1000)).toBe('1 second');
  });
});
