import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  it('rotates generic labels while waiting, stops at the last one, and then holds no timer', () => {
    render(<ActivityStatus label="Thinking…" />);
    expect(label()).toBe('Thinking…');
    advance(ACTIVITY_STEP_MS);
    expect(label()).toBe('Preparing your answer…');
    advance(ACTIVITY_STEP_MS);
    expect(label()).toBe('Working on it…');
    advance(ACTIVITY_STEP_MS * 10);
    expect(label()).toBe('Almost there…');
    expect(vi.getTimerCount()).toBe(0);
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
  const renderMessage = (patch: Partial<MessageView>) => <AssistantMessage message={message(patch)} anchorKey="a1" activity="Thinking…" />;

  it('the first token replaces the box with the answer and stops the rotation', () => {
    const { rerender, container } = render(renderMessage({}));
    advance(ACTIVITY_STEP_MS);
    expect(label()).toBe('Preparing your answer…');
    rerender(renderMessage({ content: 'Great q' }));
    expect(container.querySelector('[data-activity]')).toBeNull();
    expect(container.textContent).toContain('Great q');
    expect(vi.getTimerCount()).toBe(0);
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

  it('completion removes the box and stops the timer', () => {
    const { rerender, container } = render(renderMessage({}));
    rerender(renderMessage({ status: 'complete' }));
    expect(container.querySelector('[data-activity]')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
