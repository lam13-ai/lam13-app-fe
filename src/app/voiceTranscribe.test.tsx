import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpAdapter } from '@/api';
import { installFakeMedia } from '@/test/fakeMedia';
import { renderApp } from './testUtils';

/**
 * Voice on the FastAPI backend (the production adapter): no voice-message endpoint, so a recording is
 * transcribed (POST /voice/transcribe) into the message box, edited, and sent as an ordinary text message.
 */

const TOKEN = 'test-token-not-real';
let media: ReturnType<typeof installFakeMedia>;
afterEach(() => {
  media?.uninstall();
  vi.unstubAllGlobals();
});

const frame = (event: string, data: object) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
/** Real time must pass while "recording". */
const speak = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));

function backend(transcribe: () => Response | Promise<Response>) {
  const calls: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ url, method, headers: (init.headers ?? {}) as Record<string, string>, body: init.body });
    if (url === '/voice/transcribe') return transcribe();
    if (url === '/chat/stream' && method === 'POST') {
      const body = JSON.parse(init.body as string) as { session_id: string; message_id: string };
      const sse = [
        frame('start', { content: '', session_id: body.session_id, message_id: body.message_id, assistantMessageId: 'a1' }),
        frame('token', { content: 'Here is the plan.', source: 'chatbot' }),
        frame('response_completed', {}),
        frame('done', { session_id: body.session_id, assistantMessageId: 'a1', title: 'Plan' }),
      ].join('');
      return new Response(sse, { headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (url === '/chat/sessions') return Response.json([]);
    return Response.json({ detail: 'Not Found' }, { status: 404 });
  });
  return calls;
}

async function recordAndStop({ pause = false } = {}) {
  const mic = await screen.findByRole('button', { name: 'Record voice message' }, { timeout: 8000 });
  await act(async () => fireEvent.click(mic));
  await screen.findByRole('button', { name: 'Stop recording' });
  await speak(300);
  if (pause) {
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Pause recording' })));
    expect(await screen.findByRole('button', { name: 'Resume recording' })).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Resume recording' })));
    await speak(300);
  }
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop recording' })));
  return screen.findByRole('button', { name: 'Transcribe recording' });
}

const box = () => screen.getByLabelText('Message Lam13') as HTMLTextAreaElement;

describe('voice → transcription → text message (production adapter)', () => {
  it('shows the voice UI, transcribes the recording once, and sends the edited text through chat', async () => {
    media = installFakeMedia();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const calls = backend(async () => {
      await held;
      return Response.json({ text: 'Draft the Q4 plan for the board' });
    });
    renderApp('/', { api: createHttpAdapter(), auth: { accessToken: TOKEN } });

    const transcribe = await recordAndStop({ pause: true });
    // The recording is kept for review: a preview player, nothing uploaded yet.
    expect(screen.getByRole('button', { name: /play recording/i })).toBeTruthy();
    expect(calls.some((c) => c.url === '/voice/transcribe')).toBe(false);

    await act(async () => fireEvent.click(transcribe));
    const busy = await screen.findByRole('button', { name: 'Transcribing recording' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(busy); // no duplicate while in flight
    await act(async () => release());

    // The text lands in the message box, editable; the voice UI has closed.
    await waitFor(() => expect(box().value).toBe('Draft the Q4 plan for the board'));
    const posts = calls.filter((c) => c.url === '/voice/transcribe');
    expect(posts).toHaveLength(1);
    expect(posts[0]!.method).toBe('POST');
    expect(posts[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    const file = (posts[0]!.body as FormData).get('file') as File;
    expect(file.name).toBe('recording.webm');
    expect(file.type).toBe('audio/webm;codecs=opus'); // what Chrome records; the backend goes by the extension
    expect(file.size).toBeGreaterThan(0);
    expect(media.allTracksStopped()).toBe(true);

    fireEvent.change(box(), { target: { value: 'Draft the Q4 plan for the board, with risks' } });
    fireEvent.keyDown(box(), { key: 'Enter' });
    await waitFor(() => expect(calls.some((c) => c.url === '/chat/stream')).toBe(true));
    const sent = JSON.parse(calls.find((c) => c.url === '/chat/stream')!.body as string);
    expect(sent.user_message).toBe('Draft the Q4 plan for the board, with risks');
    expect(await screen.findByText('Draft the Q4 plan for the board, with risks')).toBeTruthy();
  });

  it('a failed transcription keeps the recording and offers Retry, which needs no new recording', async () => {
    media = installFakeMedia();
    const responses = [
      Response.json({ detail: 'Supported audio formats: mp3, mp4, mpeg, mpga, m4a, wav, webm.' }, { status: 415 }),
      Response.json({ text: 'Second time lucky' }),
    ];
    const calls = backend(() => responses.shift()!);
    renderApp('/', { api: createHttpAdapter(), auth: { accessToken: TOKEN } });

    const transcribe = await recordAndStop();
    await act(async () => fireEvent.click(transcribe));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Supported audio formats: mp3, mp4, mpeg, mpga, m4a, wav, webm.');
    const recordings = media.getUserMedia.mock.calls.length;

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry transcription' })));
    await waitFor(() => expect(box().value).toBe('Second time lucky'));
    expect(calls.filter((c) => c.url === '/voice/transcribe')).toHaveLength(2);
    // The same recording was re-sent: the microphone was not opened again.
    expect(media.getUserMedia.mock.calls.length).toBe(recordings);
  });

  it('no speech detected is a recoverable error, not an empty message', async () => {
    media = installFakeMedia();
    backend(() => Response.json({ text: '   ' }));
    renderApp('/', { api: createHttpAdapter(), auth: { accessToken: TOKEN } });
    const transcribe = await recordAndStop();
    await act(async () => fireEvent.click(transcribe));
    expect((await screen.findByRole('alert')).textContent).toContain('No speech was detected. Try recording again.');
    expect(screen.getByRole('button', { name: 'Retry transcription' })).toBeTruthy();
  });
});
