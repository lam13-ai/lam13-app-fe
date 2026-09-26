import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui';
import type { MessageView } from '@/types/chat';
import { ACTIVITY_STEP_MS, ActivityStatus } from './ActivityStatus';
import { AssistantMessage } from './AssistantMessage';

const label = () => document.querySelector('[data-activity] .animate-fade')?.textContent ?? null;
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ActivityStatus', () => {
  it('rotates generic labels every ~3.5s, then keeps cycling the later ones while the answer is generating', () => {
    expect(ACTIVITY_STEP_MS).toBeGreaterThanOrEqual(3000);
    expect(ACTIVITY_STEP_MS).toBeLessThanOrEqual(4000);
    render(<ActivityStatus label="Thinking…" />);
    expect(label()).toBe('Thinking…');
    advance(ACTIVITY_STEP_MS - 100);
    expect(label()).toBe('Thinking…'); // not before ~3.5s
    advance(100);
    expect(label()).toBe('Preparing your answer…');
    const seen = [label()];
    for (let i = 0; i < 8; i++) {
      advance(ACTIVITY_STEP_MS);
      seen.push(label());
    }
    expect(seen).toEqual([
      'Preparing your answer…',
      'Working on it…',
      'Generating response…',
      'Putting the answer together…',
      'Almost there…',
      'Working on it…', // cycles on: never frozen, never back to "Thinking…"
      'Generating response…',
      'Putting the answer together…',
      'Almost there…',
    ]);
    expect(vi.getTimerCount()).toBe(1); // still running while mounted
    // One stable announcement for screen readers, not every label.
    expect(screen.getByRole('status').textContent).toBe('Lam13 is working on the answer.');
  });

  it('a real event moves it forward (response_started → Generating response…), never back', () => {
    const { rerender } = render(<ActivityStatus label="Thinking…" />);
    advance(ACTIVITY_STEP_MS);
    expect(label()).toBe('Preparing your answer…');
    rerender(<ActivityStatus label="Generating response…" />);
    expect(label()).toBe('Generating response…');
    advance(ACTIVITY_STEP_MS);
    expect(label()).toBe('Putting the answer together…');

    // Already past it: a later event can't send it back.
    const later = render(<ActivityStatus label="Thinking…" />);
    advance(ACTIVITY_STEP_MS * 5);
    later.rerender(<ActivityStatus label="Generating response…" />);
    expect(later.container.textContent).toContain('Almost there…');
  });

  it('shows other server states (Solving…) as they are, without a timer', () => {
    render(<ActivityStatus label="Solving…" />);
    expect(label()).toBe('Solving…');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a hidden tab (timers throttled) shows the right label on return', () => {
    render(<ActivityStatus label="Thinking…" />);
    // Hidden: 7s pass but no interval fires.
    vi.setSystemTime(Date.now() + ACTIVITY_STEP_MS * 3.5);
    expect(label()).toBe('Thinking…');
    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(label()).toBe('Generating response…');
  });

  it('leaves no timer behind after unmount', () => {
    const { unmount } = render(<ActivityStatus label="Thinking…" />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('AssistantMessage status box', () => {
  const message = (patch: Partial<MessageView>): MessageView => ({
    id: 'a1',
    conversation_id: 'c1',
    client_message_id: null,
    role: 'assistant',
    kind: 'text',
    content: '',
    audio: null,
    call: null,
    status: 'streaming',
    created_at: '',
    ...patch,
  });
  const renderMessage = (patch: Partial<MessageView>) => (
    <ToastProvider>
      <AssistantMessage message={message(patch)} anchorKey="a1" activity="Thinking…" />
    </ToastProvider>
  );

  it('tokens arriving (content buffered) keep the box and show no partial text', () => {
    const { rerender, container } = render(renderMessage({}));
    advance(ACTIVITY_STEP_MS);
    expect(label()).toBe('Preparing your answer…');
    // Even if a streaming message carries text (e.g. a server copy while it generates), none of it shows.
    rerender(renderMessage({ content: 'Great q' }));
    expect(container.querySelector('[data-activity]')).not.toBeNull();
    expect(container.textContent).not.toContain('Great q');
    expect(vi.getTimerCount()).toBe(1);
  });

  it.each([
    ['Stop', { status: 'cancelled' as const }, 'Stopped before a response was generated.'],
    ['an error', { status: 'error' as const }, 'Something went wrong while generating this response.'],
  ])('%s removes the box, stops the timer and keeps the existing notice', (_, patch, notice) => {
    const { rerender, container } = render(renderMessage({}));
    rerender(renderMessage(patch));
    expect(container.querySelector('[data-activity]')).toBeNull();
    expect(container.textContent).toContain(notice);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('completion replaces the box with the whole answer in one render and stops the timer', () => {
    const { rerender, container } = render(renderMessage({}));
    advance(ACTIVITY_STEP_MS * 2);
    rerender(renderMessage({ status: 'complete', content: '## Plan\n\nThe whole answer.' }));
    expect(container.querySelector('[data-activity]')).toBeNull();
    expect(container.querySelector('h2')?.textContent).toBe('Plan');
    expect(container.textContent).toContain('The whole answer.');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Stop reveals the partial answer with the stopped notice', () => {
    const { rerender, container } = render(renderMessage({}));
    rerender(renderMessage({ status: 'cancelled', content: 'Partial answer' }));
    expect(container.querySelector('[data-activity]')).toBeNull();
    expect(container.textContent).toContain('Partial answer');
    expect(container.textContent).toContain('Response stopped.');
    expect(vi.getTimerCount()).toBe(0);
  });
});
