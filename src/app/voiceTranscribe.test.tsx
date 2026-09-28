import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpAdapter } from '@/api';
import { FakeMediaRecorder, installFakeMedia } from '@/test/fakeMedia';
import { renderApp } from './testUtils';

/**
 * Voice on the FastAPI backend (the production adapter): no voice-message endpoint, so a recording becomes
 * text via POST /voice/transcribe. Stop = transcribe into the message box to edit (the user sends it);
 * Send = transcribe and send the text at once — one transcription, one chat message, no second click.
 */

const TOKEN = 'test-token-not-real';
let media: ReturnType<typeof installFakeMedia>;
afterEach(() => {
  media?.uninstall();
  FakeMediaRecorder.supported = new Set(['audio/webm;codecs=opus', 'audio/webm']);
  vi.unstubAllGlobals();
});

const frame = (event: string, data: object) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
/** Real time must pass while "recording". */
const speak = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function backend(transcribe: () => Response | Promise<Response>) {
  const calls: Call[] = [];
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
  const transcriptions = () => calls.filter((c) => c.url === '/voice/transcribe');
  const chats = () => calls.filter((c) => c.url === '/chat/stream');
  return { calls, transcriptions, chats };
}

/** A transcription response held until `release()`. */
function held(text: string) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  return { release, respond: async () => (await gate, Response.json({ text })) };
}

async function record() {
  const mic = await screen.findByRole('button', { name: 'Record voice message' }, { timeout: 8000 });
  await act(async () => fireEvent.click(mic));
  await screen.findByRole('button', { name: 'Stop recording' });
  await speak(300);
}

/** Clicks twice before React can re-render — a double click / rapid repeat. */
const doubleClick = (name: string) =>
  act(async () => {
    const button = screen.getByRole('button', { name });
    fireEvent.click(button);
    fireEvent.click(button);
  });

const box = () => screen.getByLabelText('Message Lam13') as HTMLTextAreaElement;
/** User messages shown in the chat (not the sidebar's title). */
const inChat = (text: string) => within(screen.getByRole('region', { name: 'Chat' })).queryAllByText(text, { ignore: 'textarea, script, style' });
const setup = (transcribe: () => Response | Promise<Response>) => {
  media = installFakeMedia();
  const api = backend(transcribe);
  renderApp('/', { api: createHttpAdapter(), auth: { accessToken: TOKEN } });
  return api;
};

describe('voice → Stop: transcribe for review (production adapter)', () => {
  it('records continuously (Delete / Stop / Send only), nothing uploaded while recording', async () => {
    const { transcriptions, chats } = setup(() => Response.json({ text: 'unused' }));
    await record();
    expect(screen.getByRole('button', { name: 'Delete recording' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send recording' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /pause|resume/i })).toBeNull();
    expect(screen.queryByText(/^Paused$|Recording paused/)).toBeNull();
    await speak(300);
    expect(screen.getByText('Recording.')).toBeTruthy(); // still recording: nothing paused it
    expect(transcriptions()).toHaveLength(0);
    expect(chats()).toHaveLength(0);
  });

  it('Delete discards the recording: no transcription, no message, microphone released', async () => {
    const { transcriptions, chats } = setup(() => Response.json({ text: 'unused' }));
    await record();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete recording' })));
    expect(await screen.findByRole('button', { name: 'Record voice message' })).toBeTruthy();
    expect(media.allTracksStopped()).toBe(true);
    await speak(100);
    expect(transcriptions()).toHaveLength(0);
    expect(chats()).toHaveLength(0);
  });

  it('Stop transcribes once into the box, sends nothing; the edited text is sent once', async () => {
    const response = held('Draft the Q4 plan for the board');
    const { transcriptions, chats } = setup(response.respond);

    await record();
    // Vapi calling is untouched by the voice-note UI.
    expect(screen.getByRole('button', { name: 'Start voice call' })).toBeTruthy();

    await doubleClick('Stop recording');
    // A visible loading state while the recording is transcribed; Stop / Send are gone meanwhile.
    expect(await screen.findByText('Transcribing recording…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Stop recording' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send recording' })).toBeNull();
    await act(async () => response.release());

    await waitFor(() => expect(box().value).toBe('Draft the Q4 plan for the board'));
    expect(transcriptions()).toHaveLength(1);
    const post = transcriptions()[0]!;
    expect(post.method).toBe('POST');
    expect(post.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    const file = (post.body as FormData).get('file') as File;
    expect(file.name).toBe('recording.webm');
    expect(file.type).toBe('audio/webm;codecs=opus');
    expect(file.size).toBeGreaterThan(0);
    expect(media.allTracksStopped()).toBe(true);
    // Review only: nothing reached the chat, no user message.
    expect(chats()).toHaveLength(0);
    expect(inChat('Draft the Q4 plan for the board')).toHaveLength(0);

    fireEvent.change(box(), { target: { value: 'Draft the Q4 plan for the board, with risks' } });
    fireEvent.keyDown(box(), { key: 'Enter' });
    await waitFor(() => expect(chats()).toHaveLength(1));
    expect(JSON.parse(chats()[0]!.body as string).user_message).toBe('Draft the Q4 plan for the board, with risks');
    await waitFor(() => expect(inChat('Draft the Q4 plan for the board, with risks')).toHaveLength(1));
    expect(transcriptions()).toHaveLength(1);
  });

  it('a failed transcription keeps the recording and offers Retry (no new recording, nothing sent)', async () => {
    const responses = [
      Response.json({ detail: 'The audio could not be transcribed. Try recording it again.' }, { status: 400 }),
      Response.json({ text: 'Second time lucky' }),
    ];
    const { transcriptions, chats } = setup(() => responses.shift()!);

    await record();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop recording' })));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The audio could not be transcribed. Try recording it again.');
    const recordings = media.getUserMedia.mock.calls.length;

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry transcription' })));
    await waitFor(() => expect(box().value).toBe('Second time lucky'));
    expect(transcriptions()).toHaveLength(2);
    expect(media.getUserMedia.mock.calls.length).toBe(recordings); // the microphone was not opened again
    expect(chats()).toHaveLength(0);
  });

  it('Stop then Send in quick succession: the first action wins — one transcription, into the box, nothing sent', async () => {
    const { transcriptions, chats } = setup(() => Response.json({ text: 'Stop won' }));
    await record();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
      fireEvent.click(screen.getByRole('button', { name: 'Send recording' }));
    });
    await waitFor(() => expect(box().value).toBe('Stop won'));
    await speak(100);
    expect(transcriptions()).toHaveLength(1);
    expect(chats()).toHaveLength(0);
  });

  it('keeps a Safari (MP4) recording as .m4a', async () => {
    FakeMediaRecorder.supported = new Set(['audio/mp4']);
    const { transcriptions } = setup(() => Response.json({ text: 'From Safari' }));
    await record();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop recording' })));
    await waitFor(() => expect(box().value).toBe('From Safari'));
    const file = (transcriptions()[0]!.body as FormData).get('file') as File;
    expect(file.name).toBe('recording.m4a');
    expect(file.type).toBe('audio/mp4');
  });
});

describe('voice → Send: transcribe and send at once (production adapter)', () => {
  it('one click: transcribes once and sends the transcript as exactly one message, even when clicked twice', async () => {
    const response = held('Summarise the board pack');
    const { transcriptions, chats } = setup(response.respond);

    await record();
    await doubleClick('Send recording');
    expect(await screen.findByText('Transcribing and sending…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send recording' })).toBeNull();
    expect(chats()).toHaveLength(0); // nothing is sent before the transcript exists
    await act(async () => response.release());

    // No second click: the transcript goes straight to the chat.
    await waitFor(() => expect(chats()).toHaveLength(1));
    expect(JSON.parse(chats()[0]!.body as string).user_message).toBe('Summarise the board pack');
    await waitFor(() => expect(inChat('Summarise the board pack')).toHaveLength(1));
    expect(await screen.findByText('Here is the plan.')).toBeTruthy();
    expect(transcriptions()).toHaveLength(1);
    expect(((transcriptions()[0]!.body as FormData).get('file') as File).name).toBe('recording.webm');
    // The recording is cleaned up and the message box stays empty.
    expect(screen.queryByText('Transcribing and sending…')).toBeNull();
    expect(screen.getByRole('button', { name: 'Record voice message' })).toBeTruthy();
    expect(media.allTracksStopped()).toBe(true);
    await speak(50);
    expect(chats()).toHaveLength(1);
  });

  it('a failed transcription sends nothing and keeps the recording; Retry sends it once', async () => {
    const responses = [
      Response.json({ detail: 'Supported audio formats: mp3, mp4, mpeg, mpga, m4a, wav, webm.' }, { status: 415 }),
      Response.json({ text: 'Try that again' }),
    ];
    const { transcriptions, chats } = setup(() => responses.shift()!);

    await record();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send recording' })));
    expect((await screen.findByRole('alert')).textContent).toContain('Supported audio formats');
    expect(chats()).toHaveLength(0);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry sending' })));
    await waitFor(() => expect(chats()).toHaveLength(1));
    expect(JSON.parse(chats()[0]!.body as string).user_message).toBe('Try that again');
    expect(transcriptions()).toHaveLength(2);
  });

  it('no speech detected is a recoverable error, never an empty message', async () => {
    const { chats } = setup(() => Response.json({ text: '   ' }));
    await record();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send recording' })));
    expect((await screen.findByRole('alert')).textContent).toContain('No speech was detected. Try recording again.');
    expect(screen.getByRole('button', { name: 'Retry sending' })).toBeTruthy();
    expect(chats()).toHaveLength(0);
  });
});
