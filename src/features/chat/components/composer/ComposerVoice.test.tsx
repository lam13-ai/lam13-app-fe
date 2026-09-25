import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, ApiProvider, createMockAdapter, INSTANT_TIMING } from '@/api';
import type { SendRecording } from '@/features/voice';
import { installFakeMedia, type FakeMediaOptions } from '@/test/fakeMedia';
import { Composer } from './Composer';

let media: ReturnType<typeof installFakeMedia>;

function setup(onSendVoice: SendRecording = vi.fn(async () => {}), options: FakeMediaOptions = {}) {
  media = installFakeMedia(options);
  const client = new QueryClient();
  const utils = render(
    <ApiProvider adapter={createMockAdapter({ timing: INSTANT_TIMING })}>
      <QueryClientProvider client={client}>
        <Composer draftKey="voice-test" streaming={false} onSend={vi.fn()} onStop={vi.fn()} onAttach={vi.fn()} onSendVoice={onSendVoice} />
      </QueryClientProvider>
    </ApiProvider>,
  );
  return { onSendVoice, ...utils };
}

const mic = () => screen.getByRole('button', { name: 'Record voice message' });
const startRecording = async () => {
  await act(async () => fireEvent.click(mic()));
  return screen.findByRole('button', { name: 'Stop recording' });
};

let revoke: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  revoke = vi.spyOn(URL, 'revokeObjectURL');
});
afterEach(() => {
  media?.uninstall();
  revoke.mockRestore();
});

describe('Composer voice recording', () => {
  it('mic → recording controls with time, pause/resume, and a live status', async () => {
    setup();
    await startRecording();
    expect(media.getUserMedia).toHaveBeenCalledOnce();
    expect(screen.getByRole('status', { name: '' }).textContent).toBe('Recording.');
    expect(screen.getByText('0:00')).toBeTruthy();
    expect(screen.getByText('/ 5:00')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete recording' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Pause recording' }));
    expect(screen.getByText('Recording paused.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Resume recording' }));
    expect(screen.getByText('Recording.')).toBeTruthy();
  });

  it('stop → preview with playback, re-record and send; the microphone is released', async () => {
    setup();
    await startRecording();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop recording' })));

    expect(await screen.findByRole('button', { name: 'Send voice message' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play recording' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Re-record' })).toBeTruthy();
    expect(media.allTracksStopped()).toBe(true);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Re-record' })));
    expect(await screen.findByRole('button', { name: 'Stop recording' })).toBeTruthy();
    expect(media.getUserMedia).toHaveBeenCalledTimes(2);
    expect(revoke).toHaveBeenCalled(); // previous preview URL released
  });

  it('delete discards the recording, revokes its URL, and returns to the text composer', async () => {
    setup();
    await startRecording();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop recording' })));
    await screen.findByRole('button', { name: 'Send voice message' });

    fireEvent.click(screen.getByRole('button', { name: 'Delete recording' }));
    expect(mic()).toBeTruthy();
    expect(revoke).toHaveBeenCalled();
    expect(media.allTracksStopped()).toBe(true);
  });

  it('sends only on explicit Send, blocks duplicate sends while uploading, then resets', async () => {
    let finish!: () => void;
    const onSendVoice = vi.fn<SendRecording>(() => new Promise<void>((resolve) => (finish = resolve)));
    setup(onSendVoice);
    await startRecording();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop recording' })));
    await screen.findByRole('button', { name: 'Send voice message' });
    expect(onSendVoice).not.toHaveBeenCalled(); // nothing leaves the device before Send

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send voice message' })));
    const sending = screen.getByRole('button', { name: 'Sending voice message' }) as HTMLButtonElement;
    expect(sending.disabled).toBe(true);
    expect(screen.getByText('Sending voice message.')).toBeTruthy();
    fireEvent.click(sending);
    expect(onSendVoice).toHaveBeenCalledOnce();

    const [recording, signal] = onSendVoice.mock.calls[0]!;
    expect(recording.blob.size).toBeGreaterThan(0);
    expect(recording.mimeType).toBe('audio/webm;codecs=opus');
    expect(signal.aborted).toBe(false);

    await act(async () => finish());
    expect(mic()).toBeTruthy();
  });

  it('direct send stops and sends in one step', async () => {
    const { onSendVoice } = setup();
    await startRecording();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send voice message' })));
    await waitFor(() => expect(onSendVoice).toHaveBeenCalledOnce());
    expect(media.allTracksStopped()).toBe(true);
  });

  it('upload failure keeps the recording and offers Retry sending', async () => {
    const onSendVoice = vi
      .fn<SendRecording>()
      .mockRejectedValueOnce(new ApiError(503, 'upload_failed', "The recording couldn't be uploaded."))
      .mockResolvedValueOnce(undefined);
    setup(onSendVoice);
    await startRecording();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop recording' })));
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Send voice message' })));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText("The recording couldn't be uploaded.")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry sending' })));
    expect(onSendVoice).toHaveBeenCalledTimes(2);
    expect(onSendVoice.mock.calls[1]![0]).toBe(onSendVoice.mock.calls[0]![0]); // same recording, no re-record
    await waitFor(() => expect(mic()).toBeTruthy());
  });

  it('cancelling while sending aborts the upload', async () => {
    const onSendVoice = vi.fn<SendRecording>((_, signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')))));
    setup(onSendVoice);
    await startRecording();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop recording' })));
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Send voice message' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel sending' })));
    expect(onSendVoice.mock.calls[0]![1].aborted).toBe(true);
    expect(mic()).toBeTruthy();
  });

  it('explains a blocked microphone and an unsupported browser', async () => {
    const first = setup(vi.fn(), { permission: 'NotAllowedError' });
    await act(async () => fireEvent.click(mic()));
    expect((await screen.findByRole('alert')).textContent).toContain('Microphone access was blocked');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(mic()).toBeTruthy();
    first.unmount();
    media.uninstall();

    setup(vi.fn(), { withMediaRecorder: false });
    await act(async () => fireEvent.click(mic()));
    expect((await screen.findByRole('alert')).textContent).toContain("isn't supported in this browser");
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('leaving the conversation (unmount) releases the microphone', async () => {
    const { unmount } = setup();
    await startRecording();
    expect(media.allTracksStopped()).toBe(false);
    unmount();
    expect(media.allTracksStopped()).toBe(true);
  });
});
