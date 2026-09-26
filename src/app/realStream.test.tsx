import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpAdapter } from '@/api';
import { renderApp } from './testUtils';

/**
 * The real HTTP adapter + chat controller + UI, fed the LAM13 backend's actual `POST /chat/stream`
 * frames (api/routers/chat.py `_sse()`) one at a time, so what the user sees can be checked between frames.
 */

const frame = (event: string, data: object) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const START = frame('start', { content: '', session_id: 'sess-1', message_id: 'u-1', assistantMessageId: 'a-1' });

function fakeBackend() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let opened!: () => void;
  const streamOpened = new Promise<void>((resolve) => (opened = resolve));
  const sessions: object[] = [];
  const fetch = async (url: string, init: RequestInit = {}) => {
    const path = url;
    if (path === '/chat/stream' && init.method === 'POST') {
      const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
      opened();
      return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (path === '/chat/sessions') return Response.json(sessions);
    return Response.json({ detail: 'Conversation not found' }, { status: 404 });
  };
  vi.stubGlobal('fetch', fetch); // the API boundary
  return {
    api: createHttpAdapter(),
    /** Delivers raw bytes (any fragment of a frame) and lets React settle. */
    push: async (text: string) => {
      await streamOpened; // the app's POST /chat/stream has arrived
      await act(async () => controller.enqueue(encoder.encode(text)));
    },
    // The app may already have stopped reading (after `done` / `error`), which closes the stream.
    close: () =>
      act(async () => {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }),
    addSession: (title: string) =>
      sessions.push({ sessionId: 'sess-1', title, createdAt: '2026-09-25T10:00:00', updatedAt: '2026-09-25T10:00:05', totalCost: 0 }),
  };
}

async function send(text: string) {
  fireEvent.click(await screen.findByRole('button', { name: /ask lam13/i }, { timeout: 8000 }));
  const textarea = screen.getByLabelText('Message Lam13');
  fireEvent.change(textarea, { target: { value: text } });
  fireEvent.keyDown(textarea, { key: 'Enter' });
}

const log = () => screen.getByRole('log', { name: 'Conversation' });
const answer = () => within(log()).getAllByRole('article').at(-1)!;
/** The answer's rendered Markdown only (not its status box or actions). */
const answerText = () => answer().querySelector('.md-content')?.textContent ?? '';
const header = () => document.querySelector('header')!;
/** The visible label in an answer's status box (null once the answer has words). */
const activity = (el: HTMLElement) => el.querySelector('[data-activity] .animate-fade')?.textContent ?? null;

afterEach(() => vi.unstubAllGlobals());

describe('real backend stream (HTTP adapter)', () => {
  it('Thinking → incremental Answering → complete at response_completed, then trailing title/agent updates', async () => {
    const backend = fakeBackend();
    const { router } = renderApp('/', { api: backend.api });

    await send('Outline a water strategy');
    // Optimistic user message + Thinking (header and the answer's place) before any byte arrives.
    expect(within(log()).getByText('Outline a water strategy')).toBeTruthy();
    expect(within(header()).getByText('Thinking…')).toBeTruthy();
    expect(activity(answer())).toBe('Thinking…');
    expect(screen.getByRole('button', { name: 'Stop generating' })).toBeTruthy();

    // `start` creates the session (URL follows); the model's reasoning keeps Thinking, text hidden.
    await backend.push(START + frame('response_started', { content: 'Generating response...' }));
    await backend.push('event: thin'); // a frame split across network chunks
    await backend.push('king\ndata: {"content":"Consider the","source":"chatbot","mode":"token"}\n\n');
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/sess-1'));
    expect(within(header()).getByText('Thinking…')).toBeTruthy();
    // Generation started: a high-level status in the answer's place; the reasoning text never appears.
    await waitFor(() => expect(activity(answer())).toBe('Generating response…'));
    expect(document.body.textContent).not.toContain('Consider the');

    // First answer token: Answering, text visible; more tokens grow it.
    await backend.push(frame('token', { content: 'Start with', source: 'chatbot' }));
    await screen.findByText('Answering…');
    await waitFor(() => expect(answerText()).toBe('Start with'));
    expect(answer().querySelector('[data-activity]')).toBeNull(); // the status box gave way to the answer
    expect(answer().getAttribute('aria-busy')).toBe('true');
    await backend.push(frame('token', { content: ' a national', source: 'chatbot' }));
    await backend.push(frame('token', { content: ' water audit.', source: 'chatbot' }));
    await waitFor(() => expect(answerText()).toBe('Start with a national water audit.'));
    expect(screen.getByText('Answering…')).toBeTruthy();

    // response_completed: the answer is final — composer idle, actions shown — while the backend post-processes.
    await backend.push(frame('response_completed', { content: 'Response completed.' }));
    await backend.push(frame('postprocess_started', { content: 'Running post-processing...' }));
    await screen.findByText('Online');
    expect(screen.queryByRole('button', { name: 'Stop generating' })).toBeNull();
    expect(answer().getAttribute('aria-busy')).toBe('false');
    expect(within(answer()).getByRole('button', { name: /copy/i })).toBeTruthy();
    expect(answerText()).toContain('Start with a national water audit.');

    // Trailing updates on the same response: agent output appended, then the generated title.
    await backend.push(frame('progress', { content: 'Reviewing', source: 'eshmun' }));
    await backend.push(frame('token', { content: 'Agent note.', source: 'eshmun' }));
    // Appended after a blank line (as the backend stores it): a new paragraph of the same answer.
    await waitFor(() => expect(within(answer()).getByText('Agent note.').tagName).toBe('P'));
    expect(within(answer()).getByText('Start with a national water audit.')).toBeTruthy();
    expect(screen.getByText('Online')).toBeTruthy(); // not flipped back to Solving/Answering
    backend.addSession('Water Strategy Outline');
    await backend.push(frame('postprocess_completed', { content: 'Post-processing complete.' }));
    await backend.push(frame('done', { content: '', session_id: 'sess-1', assistantMessageId: 'a-1', title: 'Water Strategy Outline', totalCost: 0 }));
    await backend.close();
    await screen.findByRole('heading', { level: 1, name: 'Water Strategy Outline' });
    expect(screen.getByText('Online')).toBeTruthy();
  });

  it('turns a backend stream error into the retryable error state, keeping the partial answer', async () => {
    const backend = fakeBackend();
    renderApp('/', { api: backend.api });
    await send('Outline a water strategy');

    await backend.push(START + frame('token', { content: 'Partial answer', source: 'chatbot' }));
    await waitFor(() => expect(answerText()).toContain('Partial answer'));
    await backend.push(frame('done', { session_id: 'sess-1', assistantMessageId: 'a-1', title: 'T', partial: true, recoveredContent: 'Partial answer' }));
    await backend.push(frame('error', { content: 'We encountered an issue processing your request.' }));
    await backend.close();

    expect(await within(answer()).findByText('We encountered an issue processing your request.')).toBeTruthy();
    expect(within(answer()).getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(answerText()).toContain('Partial answer');
    expect(screen.getByText('Online')).toBeTruthy();
  });

  it('ignores unknown events and heartbeats without stalling the answer', async () => {
    const backend = fakeBackend();
    renderApp('/', { api: backend.api });
    await send('Outline a water strategy');

    await backend.push(START + ': keep-alive\n\n' + frame('brand_new_event', { anything: true }));
    await backend.push(frame('token', { content: 'Still streaming', source: 'chatbot' }));
    await waitFor(() => expect(answerText()).toBe('Still streaming'));
    await backend.push(frame('response_completed', { content: 'Response completed.' }));
    await screen.findByText('Online');
    await backend.close();
  });

  it('ends a stream that closes without completing as an interrupted, retryable answer', async () => {
    const backend = fakeBackend();
    renderApp('/', { api: backend.api });
    await send('Outline a water strategy');

    await backend.push(START + frame('token', { content: 'Cut off', source: 'chatbot' }));
    await backend.close();
    expect(await within(answer()).findByText('The response ended unexpectedly.')).toBeTruthy();
    expect(answerText()).toContain('Cut off');
  });
});
