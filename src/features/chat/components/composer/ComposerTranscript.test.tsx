import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider, createMockAdapter, INSTANT_TIMING } from '@/api';
import type { SendRecording, TranscribeRecording } from '@/features/voice';
import { installFakeMedia } from '@/test/fakeMedia';
import { Composer } from './Composer';

/** The detected-transcript preview shown after Stop, before sending. */

let media: ReturnType<typeof installFakeMedia>;
afterEach(() => media?.uninstall());

/** A transcription the test resolves/rejects by hand; records every call and its abort signal. */
function controllableTranscribe() {
  const calls: { signal: AbortSignal; resolve: (text: string) => void; reject: (e: unknown) => void }[] = [];
  const transcribe = vi.fn<TranscribeRecording>(
    (_recording, signal) =>
      new Promise<string>((resolve, reject) => {
        calls.push({ signal, resolve, reject });
      }),
  );
  return { transcribe, calls };
}

function setup(transcribe?: TranscribeRecording, onSendVoice: SendRecording = vi.fn(async () => {})) {
  media = installFakeMedia();
  const utils = render(
    <ApiProvider adapter={createMockAdapter({ timing: INSTANT_TIMING })}>
      <QueryClientProvider client={new QueryClient()}>
        <Composer
          draftKey="transcript-test"
          streaming={false}
          onSend={vi.fn()}
          onStop={vi.fn()}
          onAttach={vi.fn()}
          onSendVoice={onSendVoice}
          onTranscribeVoice={transcribe}
        />
      </QueryClientProvider>
    </ApiProvider>,
  );
  return { onSendVoice, ...utils };
}

async function recordAndStop() {
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record voice message' })));
  await screen.findByRole('button', { name: 'Stop recording' });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop recording' })));
  await screen.findByRole('button', { name: 'Send voice message' });
}

describe('Composer voice preview — detected transcript', () => {
  it('shows no transcript section when the backend cannot transcribe', async () => {
    setup(undefined);
    await recordAndStop();
    expect(screen.queryByText('Detected transcript')).toBeNull();
    expect(screen.getByRole('button', { name: 'Play recording' })).toBeTruthy();
  });

  it('shows Transcribing…, then the transcript; sending does not wait for it', async () => {
    const { transcribe, calls } = controllableTranscribe();
    const { onSendVoice } = setup(transcribe);
    await recordAndStop();

    expect(transcribe).toHaveBeenCalledOnce();
    expect(screen.getByText('Detected transcript')).toBeTruthy();
    expect(screen.getByText('Transcribing…')).toBeTruthy();
    // Review isn't forced: Send works while the transcript is still loading.
    expect((screen.getByRole('button', { name: 'Send voice message' }) as HTMLButtonElement).disabled).toBe(false);

    await act(async () => calls[0]!.resolve('  Please draft the water KPIs for Q3.  '));
    const text = screen.getByText('Please draft the water KPIs for Q3.');
    expect(text.getAttribute('tabindex')).toBe('0'); // scrollable when long → keyboard reachable
    expect(text.getAttribute('aria-labelledby')).toBe(screen.getByText('Detected transcript').id);
    expect(screen.queryByText('Transcribing…')).toBeNull();
    expect(onSendVoice).not.toHaveBeenCalled(); // reviewing never sends
  });

  it('says so when no speech was detected, without inventing text', async () => {
    const { transcribe, calls } = controllableTranscribe();
    setup(transcribe);
    await recordAndStop();
    await act(async () => calls[0]!.resolve('   '));
    expect(screen.getByText('No speech detected.')).toBeTruthy();
  });

  it('explains a transcription failure without API details, offers Try again, and still allows sending', async () => {
    const { transcribe, calls } = controllableTranscribe();
    setup(transcribe);
    await recordAndStop();

    await act(async () => calls[0]!.reject(new Error('503 upstream internal detail')));
    expect(screen.getByText(/Couldn.t transcribe this recording\. You can still send it\./)).toBeTruthy();
    expect(screen.queryByText(/upstream internal detail/)).toBeNull();
    expect((screen.getByRole('button', { name: 'Send voice message' }) as HTMLButtonElement).disabled).toBe(false);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Try again' })));
    expect(transcribe).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Transcribing…')).toBeTruthy();
    await act(async () => calls[1]!.resolve('Second attempt worked.'));
    expect(screen.getByText('Second attempt worked.')).toBeTruthy();
  });

  it('cancels the transcription on delete, on re-record, and on unmount', async () => {
    const { transcribe, calls } = controllableTranscribe();
    const { unmount } = setup(transcribe);

    await recordAndStop();
    fireEvent.click(screen.getByRole('button', { name: 'Delete recording' }));
    expect(calls[0]!.signal.aborted).toBe(true);
    expect(screen.getByRole('button', { name: 'Record voice message' })).toBeTruthy();

    await recordAndStop();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Re-record' })));
    expect(calls[1]!.signal.aborted).toBe(true);
    // A late answer for an abandoned recording is ignored.
    await act(async () => calls[1]!.resolve('stale'));
    expect(screen.queryByText('stale')).toBeNull();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop recording' })));
    await screen.findByRole('button', { name: 'Send voice message' });
    unmount();
    expect(calls[2]!.signal.aborted).toBe(true);
    expect(media.allTracksStopped()).toBe(true);
  });
});
