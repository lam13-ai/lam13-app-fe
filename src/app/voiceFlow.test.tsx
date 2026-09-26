import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { INSTANT_TIMING } from '@/api';
import { installFakeMedia } from '@/test/fakeMedia';
import { renderApp } from './testUtils';

let media: ReturnType<typeof installFakeMedia>;
afterEach(() => media?.uninstall());

/** Real time must pass: the mock rejects recordings shorter than 0.5s, like a real backend would. */
const speak = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));
const log = () => screen.getByRole('log', { name: 'Conversation' });

describe('voice message flow', () => {
  it('record → preview → send: upload, voice message, transcript, then a streamed answer', async () => {
    media = installFakeMedia();
    const { api } = renderApp('/c/water-security-kpis', { timing: { ...INSTANT_TIMING, transcribe: [40, 40] } });
    await screen.findByRole('log', { name: 'Conversation' }, { timeout: 8000 });
    const upload = vi.spyOn(api.audio, 'upload');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record voice message' })));
    await screen.findByRole('button', { name: 'Stop recording' });
    await speak(650);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop recording' })));
    await screen.findByRole('button', { name: 'Send voice message' });
    expect(upload).not.toHaveBeenCalled(); // audio stays local until Send

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send voice message' })));
    await waitFor(() => expect(upload).toHaveBeenCalledOnce());
    expect(upload.mock.calls[0]![0]).toMatchObject({ conversation_id: 'water-security-kpis' });

    // The voice message renders in the user block with its own player.
    const player = await within(log()).findByRole('button', { name: 'Play voice message' });
    expect(player).toBeTruthy();
    // Mock transcript arrives, then the assistant answers through the normal stream.
    expect(await within(log()).findByText(/Transcript:/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Online')).toBeTruthy());
    const answers = within(log()).getAllByRole('article');
    expect(answers.at(-1)!.textContent!.length).toBeGreaterThan(50);

    // Composer is back to the text/mic state; microphone released.
    expect(screen.getByRole('button', { name: 'Record voice message' })).toBeTruthy();
    expect(media.allTracksStopped()).toBe(true);
  });

  it('previews the detected transcript before sending, and the sent message carries that same transcript', async () => {
    media = installFakeMedia();
    const { api } = renderApp('/c/water-security-kpis', { timing: { ...INSTANT_TIMING, transcribe: [40, 40] } });
    await screen.findByRole('log', { name: 'Conversation' }, { timeout: 8000 });
    const before = within(log()).getAllByRole('article').length;
    const upload = vi.spyOn(api.audio, 'upload');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record voice message' })));
    await screen.findByRole('button', { name: 'Stop recording' });
    await speak(650);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop recording' })));

    // Review: the transcript appears in the composer; nothing is added to the conversation yet.
    expect(await screen.findByText('Transcribing…')).toBeTruthy();
    const label = await screen.findByText('Detected transcript');
    const transcript = (await waitFor(() => {
      const el = document.querySelector(`[aria-labelledby="${label.id}"]`);
      expect(el).not.toBeNull();
      return el!;
    })).textContent!;
    expect(transcript.length).toBeGreaterThan(10);
    expect(upload).not.toHaveBeenCalled();
    expect(within(log()).getAllByRole('article')).toHaveLength(before);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send voice message' })));
    await waitFor(() => expect(upload).toHaveBeenCalledOnce());
    expect(await within(log()).findByText(transcript)).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Online')).toBeTruthy());
    expect(media.allTracksStopped()).toBe(true);
  });

  it('keeps the recording sendable when transcription fails', async () => {
    media = installFakeMedia();
    renderApp('/c/water-security-kpis', { mock: { failTranscription: true } });
    await screen.findByRole('log', { name: 'Conversation' }, { timeout: 8000 });

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record voice message' })));
    await screen.findByRole('button', { name: 'Stop recording' });
    await speak(650);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop recording' })));

    expect(await screen.findByText(/Couldn.t transcribe this recording/)).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send voice message' })));
    expect(await within(log()).findByRole('button', { name: 'Play voice message' })).toBeTruthy();
  });

  it('a too-short recording fails to upload and can be deleted without sending anything', async () => {
    media = installFakeMedia();
    renderApp('/c/water-security-kpis');
    await screen.findByRole('log', { name: 'Conversation' }, { timeout: 8000 });
    const before = within(log()).getAllByRole('article').length;

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record voice message' })));
    await screen.findByRole('button', { name: 'Stop recording' });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send voice message' })));

    expect((await screen.findByRole('alert')).textContent).toContain('too short');
    fireEvent.click(screen.getByRole('button', { name: 'Delete recording' }));
    expect(screen.getByRole('button', { name: 'Record voice message' })).toBeTruthy();
    expect(within(log()).getAllByRole('article')).toHaveLength(before);
  });

  it('Stop still works for a voice-triggered answer', async () => {
    media = installFakeMedia();
    renderApp('/c/water-security-kpis', { timing: { ...INSTANT_TIMING, token: [4, 4], chunk: [6, 6] } });
    await screen.findByRole('log', { name: 'Conversation' }, { timeout: 8000 });

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record voice message' })));
    await screen.findByRole('button', { name: 'Stop recording' });
    await speak(650);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send voice message' })));

    const stop = await screen.findByRole('button', { name: 'Stop generating' });
    await waitFor(() => expect(within(log()).getAllByRole('article').at(-1)!.textContent!.length).toBeGreaterThan(20));
    fireEvent.click(stop);
    expect(await screen.findByText('Response stopped.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Record voice message' })).toBeTruthy();
  });
});
