import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider, createMockAdapter, INSTANT_TIMING } from '@/api';
import { Composer, type ComposerProps } from './Composer';

function setup(props: Partial<ComposerProps> = {}) {
  const handlers = { onSend: vi.fn(), onStop: vi.fn(), onSendVoice: vi.fn(async () => {}), onAttach: vi.fn() };
  const ui = (p: Partial<ComposerProps>) => (
    <ApiProvider adapter={createMockAdapter({ timing: INSTANT_TIMING })}>
      <QueryClientProvider client={client}>
        <Composer draftKey="test" streaming={false} {...handlers} {...p} />
      </QueryClientProvider>
    </ApiProvider>
  );
  const client = new QueryClient();
  const result = render(ui(props));
  return { ...handlers, rerender: (p: Partial<ComposerProps>) => result.rerender(ui(p)) };
}

function open() {
  fireEvent.click(screen.getByRole('button', { name: /ask lam13/i }));
  return screen.getByLabelText('Message Lam13') as HTMLTextAreaElement;
}

describe('Composer', () => {
  it('starts collapsed and expands into a focused textarea with the toolbar', async () => {
    setup();
    expect(screen.queryByLabelText('Message Lam13')).toBeNull();

    const textarea = open();
    expect(document.activeElement).toBe(textarea);
    expect(screen.getByRole('button', { name: 'Add attachment' })).toBeTruthy();
    // Model/effort chips appear once the model catalogue loads.
    expect(await screen.findByRole('button', { name: /select model/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /reasoning effort/i })).toBeTruthy();
  });

  it('morphs the action button from mic to send as text is entered', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Record voice message' })).toBeTruthy();

    fireEvent.change(open(), { target: { value: 'Hello' } });
    expect(screen.getByRole('button', { name: 'Send message' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Record voice message' })).toBeNull();
  });

  it('without voice support the mic is replaced by a disabled send button', () => {
    setup({ onSendVoice: undefined });
    expect(screen.queryByRole('button', { name: 'Record voice message' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('sends trimmed text on Enter and clears the draft; Shift+Enter and whitespace do not send', () => {
    const { onSend } = setup();
    const textarea = open();

    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.change(textarea, { target: { value: '  Draft a KPI set  ' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('Draft a KPI set');
    expect(textarea.value).toBe('');
  });

  it('while streaming: stays visible, disables input, and the button becomes Stop', () => {
    const { onStop, onSend, rerender } = setup();
    open();
    rerender({ streaming: true });

    const textarea = screen.getByLabelText('Message Lam13') as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();

    const stop = screen.getByRole('button', { name: 'Stop generating' });
    expect(document.activeElement).toBe(stop);
    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalledOnce();

    rerender({ streaming: false });
    expect(textarea.disabled).toBe(false);
    expect(document.activeElement).toBe(textarea);
  });
});
