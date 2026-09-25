import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { INSTANT_TIMING, type MockTiming, type StreamEvent } from '@/api';
import { renderApp } from './testUtils';

/** Slow enough to observe (and stop) a stream in progress. */
const SLOW: MockTiming = { ...INSTANT_TIMING, request: [30, 30], think: [30, 30], token: [4, 4], chunk: [10, 10] };

async function sendMessage(text: string) {
  const collapsed = screen.queryByRole('button', { name: /ask lam13/i });
  if (collapsed) fireEvent.click(collapsed);
  const textarea = screen.getByLabelText('Message Lam13');
  fireEvent.change(textarea, { target: { value: text } });
  fireEvent.keyDown(textarea, { key: 'Enter' });
}

const log = () => screen.getByRole('log', { name: 'Conversation' });
const lastAnswer = () => within(log()).getAllByRole('article').at(-1)!;
const waitForIdle = () =>
  waitFor(() => expect(screen.getByText('Online')).toBeTruthy(), { timeout: 12_000 });

describe('chat flow', () => {
  it('shows the optimistic user message immediately, then streams the answer to completion', async () => {
    renderApp('/c/water-security-kpis', { timing: SLOW });
    await screen.findByRole('log', { name: 'Conversation' }, { timeout: 8000 });

    await sendMessage('Draft KPIs for digital identity');
    // Optimistic: visible before the server responds; header shows Thinking.
    expect(within(log()).getByText('Draft KPIs for digital identity')).toBeTruthy();
    expect(screen.getByText('Thinking…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stop generating' })).toBeTruthy();

    // Streaming: the answer grows while the header reads Answering.
    await screen.findByText('Answering…', {}, { timeout: 8000 });
    await waitFor(() => expect(lastAnswer().textContent?.length).toBeGreaterThan(20));
    expect(lastAnswer().getAttribute('aria-busy')).toBe('true');

    await waitForIdle();
    expect(lastAnswer().getAttribute('aria-busy')).toBe('false');
    expect(within(lastAnswer()).getByRole('heading', { name: 'Proposed KPI Framework' })).toBeTruthy();
    expect(within(lastAnswer()).getByRole('table')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Record voice message' })).toBeTruthy();
  });

  it('stop keeps the partial answer, re-enables the composer, and retry regenerates it', async () => {
    renderApp('/c/water-security-kpis', { timing: SLOW });
    await screen.findByRole('log', { name: 'Conversation' }, { timeout: 8000 });

    await sendMessage('Outline a strategy for coastal resilience');
    await waitFor(() => expect(lastAnswer().textContent?.length).toBeGreaterThan(30), { timeout: 3000 });
    fireEvent.click(screen.getByRole('button', { name: 'Stop generating' }));

    expect(await screen.findByText('Response stopped.')).toBeTruthy();
    const partial = lastAnswer().textContent ?? '';
    expect(partial).toContain('Strategic Response');
    expect((screen.getByLabelText('Message Lam13') as HTMLTextAreaElement).disabled).toBe(false);
    expect(screen.getByText('Online')).toBeTruthy();

    fireEvent.click(within(lastAnswer()).getByRole('button', { name: 'Retry' }));
    await screen.findByText('Answering…', {}, { timeout: 8000 });
    await waitForIdle();
    expect(screen.queryByText('Response stopped.')).toBeNull();
    // Regenerated answers use a different framing.
    expect(lastAnswer().textContent).toContain('A sharper way to frame this');
  });

  it('a mid-stream error keeps the partial answer and Retry completes it', async () => {
    renderApp('/c/water-security-kpis');
    await screen.findByRole('log', { name: 'Conversation' }, { timeout: 8000 });

    await sendMessage('Assess delivery risks /error');
    expect(await screen.findByText('The response was interrupted.')).toBeTruthy();
    expect(lastAnswer().textContent).toContain('Stress-Test Summary');

    fireEvent.click(within(lastAnswer()).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByText('The response was interrupted.')).toBeNull());
    await waitForIdle();
    expect(within(lastAnswer()).getByRole('table')).toBeTruthy();
  });

  it('a request rejected before streaming marks the message "Not sent" with Retry', async () => {
    renderApp('/c/water-security-kpis');
    await screen.findByRole('log', { name: 'Conversation' }, { timeout: 8000 });

    await sendMessage('Hello /fail');
    expect(await screen.findByText(/Not sent — Lam13 is temporarily unavailable/)).toBeTruthy();
    // The empty assistant draft is removed; only the seeded answer remains.
    expect(within(log()).getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('first message from a new chat creates the conversation, navigates, and auto-titles it', async () => {
    const { router } = renderApp('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Draft KPIs for digital services' }));

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/c\/c_/));
    expect(await screen.findByRole('heading', { level: 1, name: 'Draft KPIs for digital services' })).toBeTruthy();
    await waitForIdle();

    const nav = screen.getByRole('navigation', { name: 'Conversations' });
    const today = within(nav).getAllByRole('link');
    expect(today[0]?.textContent).toBe('Draft KPIs for digital services');
    expect(within(log()).getAllByText('Draft KPIs for digital services').length).toBeGreaterThan(0);
  });

  it('a new chat keeps its view (streaming state, open composer, focus) when it moves to its URL', async () => {
    const { router } = renderApp('/', { timing: SLOW });
    await screen.findByRole('button', { name: /ask lam13/i });
    await sendMessage('Stress-test a growth plan');
    const section = screen.getByRole('region', { name: 'Chat' });

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/c\/c_/));
    // Same DOM node (not remounted) and still streaming right after the URL change.
    expect(screen.getByRole('region', { name: 'Chat' })).toBe(section);
    expect(screen.getByRole('button', { name: 'Stop generating' })).toBeTruthy();

    await waitForIdle();
    const textarea = screen.getByLabelText('Message Lam13');
    expect(document.activeElement).toBe(textarea);
  });

  it('shows "Solving…" only when the server streams that state — never on its own', async () => {
    const { api } = renderApp('/c/water-security-kpis', { timing: SLOW });
    await screen.findByRole('log', { name: 'Conversation' }, { timeout: 8000 });

    // A normal answer never shows it.
    const seen = new Set<string>();
    const observer = new MutationObserver(() => seen.add(document.body.textContent ?? ''));
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    await sendMessage('Draft KPIs for digital identity');
    await waitForIdle();
    observer.disconnect();
    expect([...seen].some((text) => text.includes('Solving…'))).toBe(false);

    // A backend that reports a distinct solving state gets it shown in the header.
    const send = api.messages.send.bind(api.messages);
    api.messages.send = async (...args) => {
      const events = await send(...args);
      return (async function* (): AsyncGenerator<StreamEvent> {
        for await (const event of events) {
          yield event;
          if (event.event === 'message.created') {
            yield { event: 'status', data: { state: 'solving' } };
            await new Promise((resolve) => setTimeout(resolve, 150));
          }
        }
      })();
    };
    await sendMessage('Stress-test a growth plan');
    expect(await screen.findByText('Solving…')).toBeTruthy();
    await screen.findByText('Answering…', {}, { timeout: 8000 });
    await waitForIdle();
  });

  it('shows an error state when history fails to load', async () => {
    const { api } = renderApp('/c/water-security-kpis');
    // Simulate a server error for the next history request.
    api.messages.list = async () => {
      throw Object.assign(new Error('boom'), { name: 'ApiError' });
    };
    // Navigate to another conversation whose history is not cached yet.
    fireEvent.click(await screen.findByRole('link', { name: 'Digital services roadmap' }));
    expect(await screen.findByRole('heading', { name: "Couldn't load messages." }, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
