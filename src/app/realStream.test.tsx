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
  // The composer is open on load. Wait for one that takes input (a chat that is still streaming has it disabled).
  const box = () => screen.getByLabelText('Message Lam13') as HTMLTextAreaElement;
  await waitFor(() => expect(box().disabled).toBe(false), { timeout: 8000 });
  fireEvent.change(box(), { target: { value: text } });
  // Right after the app loads the typed text can take a moment to show; Enter is pressed once it has, as a person would.
  await waitFor(() => expect(box().value).toBe(text));
  fireEvent.keyDown(box(), { key: 'Enter' });
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
  it('reasoning window while thinking, then the answer streams in (Answering) through post-processing → Online at done', async () => {
    const backend = fakeBackend();
    const { router } = renderApp('/', { api: backend.api });

    await send('Outline a water strategy');
    // Optimistic user message + Thinking (header and the answer's place) before any byte arrives.
    expect(within(log()).getByText('Outline a water strategy')).toBeTruthy();
    expect(within(header()).getByText('Thinking…')).toBeTruthy();
    expect(activity(answer())).toBe('Thinking…');
    expect(screen.getByRole('button', { name: 'Stop generating' })).toBeTruthy();

    // `start` creates the session (URL follows); generation started: a high-level status in the answer's place.
    await backend.push(START + frame('response_started', { content: 'Generating response...' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/sess-1'));
    await waitFor(() => expect(activity(answer())).toBe('Generating response…'));
    // The model's reasoning replaces it with the open reasoning window, one step per sentence.
    await backend.push('event: thin'); // a frame split across network chunks
    await backend.push('king\ndata: {"content":"Consider the basics. ","source":"chatbot","mode":"sentence"}\n\n');
    await backend.push(frame('thinking', { content: 'Then the audit.\n\n', source: 'chatbot', mode: 'sentence' }));
    const steps = () => [...answer().querySelectorAll('[data-reasoning] li')].map((li) => li.textContent);
    const reasoningToggle = () => answer().querySelector('[data-reasoning] button')!;
    await waitFor(() => expect(steps()).toEqual(['Consider the basics.', 'Then the audit.']));
    expect(reasoningToggle().getAttribute('aria-expanded')).toBe('true');
    expect(activity(answer())).toBeNull();
    expect(within(header()).getByText('Thinking…')).toBeTruthy();

    // Answer tokens stream in as they arrive; the reasoning window collapses to "Thought for Ns".
    const flashes: string[] = [];
    const headerStates = new Set<string>();
    const observer = new MutationObserver(() => {
      const text = answerText();
      if (text) flashes.push(text);
      headerStates.add(/Thinking…|Answering…|Online/.exec(header().textContent ?? '')?.[0] ?? '');
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    await backend.push(frame('token', { content: 'Start with', source: 'chatbot' }));
    await waitFor(() => expect(answerText()).toBe('Start with'));
    expect(within(header()).getByText('Answering…')).toBeTruthy();
    expect(reasoningToggle().textContent).toMatch(/^Thought for \d+s$/);
    expect(reasoningToggle().getAttribute('aria-expanded')).toBe('false');
    await backend.push(frame('token', { content: ' a national', source: 'chatbot' }));
    await backend.push(frame('token', { content: ' water audit.', source: 'chatbot' }));
    await waitFor(() => expect(answerText()).toBe('Start with a national water audit.'));
    expect(answer().getAttribute('aria-busy')).toBe('true');

    // response_completed, then post-processing (a progress step and agent output): the answer keeps growing.
    await backend.push(frame('response_completed', { content: 'Response completed.' }));
    await backend.push(frame('postprocess_started', { content: 'Running post-processing...' }));
    await backend.push(frame('progress', { content: 'Reviewing', source: 'eshmun' }));
    await backend.push(frame('token', { content: 'Agent note.', source: 'eshmun' }));
    await within(answer()).findByText('Agent note.');
    expect(within(header()).getByText('Answering…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stop generating' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('Reviewing');

    // done: the answer (agent output as its own paragraph) is complete, and Online.
    backend.addSession('Water Strategy Outline');
    await backend.push(frame('postprocess_completed', { content: 'Post-processing complete.' }));
    await backend.push(frame('done', { content: '', session_id: 'sess-1', assistantMessageId: 'a-1', title: 'Water Strategy Outline', totalCost: 0 }));
    await screen.findByText('Online');
    observer.disconnect();
    const final = answerText();
    expect(final).toMatch(/^Start with a national water audit\.\s*Agent note\.$/);
    expect(within(answer()).getByText('Agent note.').tagName).toBe('P');
    // The answer only ever grew: each text rendered on the way is where the final one starts.
    expect(flashes.length).toBeGreaterThan(1);
    expect(flashes.filter((text) => !final.startsWith(text))).toEqual([]);
    expect([...headerStates]).toEqual(expect.arrayContaining(['Answering…', 'Online']));
    expect(answer().querySelector('[data-activity]')).toBeNull();
    expect(reasoningToggle().textContent).toMatch(/^Thought for \d+s$/); // the reasoning stays with the answer
    expect(screen.queryByRole('button', { name: 'Stop generating' })).toBeNull();
    expect(answer().getAttribute('aria-busy')).toBe('false');
    expect(within(answer()).getByRole('button', { name: /copy/i })).toBeTruthy();
    await backend.close();
    await screen.findByRole('heading', { level: 1, name: 'Water Strategy Outline' });
  });

  it('each token is visible as it arrives ("Hello", " world", "!"), not only the final text', async () => {
    const backend = fakeBackend();
    renderApp('/', { api: backend.api });
    await send('Say hello');
    await backend.push(START + frame('response_started', { content: 'Generating response...' }));

    await backend.push(frame('token', { content: 'Hello', source: 'chatbot' }));
    await waitFor(() => expect(answerText()).toBe('Hello'));
    expect(answer().getAttribute('aria-busy')).toBe('true'); // still generating: this is not the final text
    await backend.push(frame('token', { content: ' world', source: 'chatbot' }));
    await waitFor(() => expect(answerText()).toBe('Hello world'));
    await backend.push(frame('token', { content: '!', source: 'chatbot' }));
    await waitFor(() => expect(answerText()).toBe('Hello world!'));
    expect(within(header()).getByText('Answering…')).toBeTruthy();

    await backend.push(frame('response_completed', { content: 'Response completed.' }) + frame('done', { session_id: 'sess-1', assistantMessageId: 'a-1', title: 'Hello' }));
    await screen.findByText('Online');
    expect(answerText()).toBe('Hello world!');
    expect(within(log()).getAllByRole('article')).toHaveLength(1); // one assistant message
    await backend.close();
  });

  it('post-processing after the answer is "Finishing…", not "Answering…"; done returns the chat to Online and idle', async () => {
    const backend = fakeBackend();
    renderApp('/', { api: backend.api });
    await send('What date is tomorrow?');
    await backend.push(START + frame('thinking', { content: 'Considering. ', source: 'chatbot', mode: 'sentence' }));
    await backend.push(frame('token', { content: 'Check your', source: 'chatbot' }) + frame('token', { content: ' calendar.', source: 'chatbot' }));
    await waitFor(() => expect(answerText()).toBe('Check your calendar.'));
    expect(within(header()).getByText('Answering…')).toBeTruthy();
    expect(screen.getByPlaceholderText('Lam13 is responding…')).toBeTruthy();

    // The text is final; the stream stays open while the backend post-processes.
    await backend.push(frame('response_completed', { content: 'Response completed.' }) + frame('postprocess_started', { content: 'Running post-processing...' }));
    await waitFor(() => expect(within(header()).getByText('Finishing…')).toBeTruthy());
    expect(within(header()).queryByText('Answering…')).toBeNull();
    expect(screen.getByPlaceholderText('Lam13 is finishing up…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stop generating' })).toBeTruthy(); // still one turn: not terminated
    expect(answerText()).toBe('Check your calendar.');

    await backend.push(frame('postprocess_completed', { content: 'Post-processing complete.' }));
    await backend.push(frame('done', { content: '', session_id: 'sess-1', assistantMessageId: 'a-1', title: 'Date', totalCost: 0 }));
    await within(header()).findByText('Online');
    expect(answerText()).toBe('Check your calendar.');
    expect(screen.queryByRole('button', { name: 'Stop generating' })).toBeNull();
    expect(screen.queryByPlaceholderText(/Lam13 is (responding|finishing up)…/)).toBeNull();
    expect((screen.getByLabelText('Message Lam13') as HTMLTextAreaElement).disabled).toBe(false);
    expect(answer().getAttribute('aria-busy')).toBe('false');

    // Nothing arriving late (the stream closing, the saved session loading) brings the busy state back.
    await backend.close();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(within(header()).getByText('Online')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Stop generating' })).toBeNull();
  });

  it('an agent working after the text shows "Solving…" (header + status under the text), never the backend’s progress text', async () => {
    const backend = fakeBackend();
    renderApp('/', { api: backend.api });
    await send('Review my framework');
    await backend.push(START + frame('token', { content: 'Here is the framework.', source: 'chatbot' }));
    await waitFor(() => expect(answerText()).toBe('Here is the framework.'));
    await backend.push(frame('response_completed', { content: 'Response completed.' }) + frame('postprocess_started', { content: 'Running post-processing...' }));
    await waitFor(() => expect(within(header()).getByText('Finishing…')).toBeTruthy()); // the text is final: not "Answering…"

    await backend.push(frame('progress', { content: 'Running eshmun analysis...', source: 'eshmun' }));
    await waitFor(() => expect(within(header()).getByText('Solving…')).toBeTruthy());
    expect(activity(answer())).toBe('Solving…'); // under the text that already streamed
    expect(answerText()).toBe('Here is the framework.');
    expect(document.body.textContent).not.toMatch(/eshmun|Running .* analysis/i);

    // The agent's output is more of the same answer: Answering again, the status box gone.
    await backend.push(frame('token', { content: 'Agent findings.', source: 'eshmun' }));
    await within(answer()).findByText('Agent findings.');
    expect(within(header()).getByText('Answering…')).toBeTruthy();
    expect(answer().querySelector('[data-activity]')).toBeNull();

    await backend.push(frame('postprocess_completed', {}) + frame('done', { session_id: 'sess-1', assistantMessageId: 'a-1', title: 'Framework' }));
    await screen.findByText('Online');
    expect(answerText()).toMatch(/^Here is the framework\.\s*Agent findings\.$/);
    expect(within(log()).getAllByRole('article')).toHaveLength(1);
    await backend.close();
  });

  it('turns a backend stream error into the retryable error state, keeping the partial answer', async () => {
    const backend = fakeBackend();
    renderApp('/', { api: backend.api });
    await send('Outline a water strategy');

    await backend.push(START + frame('token', { content: 'Partial answer', source: 'chatbot' }));
    await waitFor(() => expect(answerText()).toBe('Partial answer')); // streamed
    expect(within(header()).getByText('Answering…')).toBeTruthy();
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
    expect(within(header()).getByText('Answering…')).toBeTruthy();
    await backend.push(frame('response_completed', { content: 'Response completed.' }));
    await backend.push(frame('done', { content: '', session_id: 'sess-1', assistantMessageId: 'a-1' }));
    await screen.findByText('Online');
    expect(answerText()).toBe('Still streaming');
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
