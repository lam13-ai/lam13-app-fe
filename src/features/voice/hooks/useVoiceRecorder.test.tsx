import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { installFakeMedia } from '@/test/fakeMedia';
import { audioFocus } from '../lib/audioFocus';
import { useVoiceRecorder } from './useVoiceRecorder';

let media: ReturnType<typeof installFakeMedia>;
afterEach(() => media?.uninstall());

describe('useVoiceRecorder', () => {
  it('stops automatically at the maximum duration and marks the preview', async () => {
    media = installFakeMedia();
    const { result } = renderHook(() => useVoiceRecorder({ maxDurationMs: 300 }));
    await act(() => result.current.start());
    expect(result.current.state.status).toBe('recording');

    await waitFor(() => expect(result.current.state.status).toBe('preview'), { timeout: 2000 });
    expect(result.current.state).toMatchObject({ limitReached: true, recording: { durationMs: 300 } });
    expect(media.allTracksStopped()).toBe(true);
  });

  it('holds audio focus while capturing (pausing players) and ignores a second start', async () => {
    media = installFakeMedia();
    const { result } = renderHook(() => useVoiceRecorder());
    await act(() => result.current.start());
    expect(audioFocus.active).toBe('recording');
    await act(() => result.current.start());
    expect(media.getUserMedia).toHaveBeenCalledOnce();

    act(() => result.current.discard());
    expect(audioFocus.active).toBeNull();
    expect(result.current.state.status).toBe('idle');
    expect(media.allTracksStopped()).toBe(true);
  });
});
