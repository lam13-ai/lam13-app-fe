import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from '@/stores/uiStore';
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

/** The composer's textarea. It is there on load; the pill is clicked only if the composer was left and collapsed. */
function open() {
  const pill = screen.queryByRole('button', { name: /ask lam13/i });
  if (pill) fireEvent.click(pill);
  return screen.getByLabelText('Message Lam13') as HTMLTextAreaElement;
}

// The UI store is shared by the tests in this file: each one starts from its real initial state (model: Lam).
beforeEach(() => useUiStore.setState(useUiStore.getInitialState()));

describe('Composer', () => {
  it('is always expanded: on load without taking focus, and it stays so when empty, blurred, clicked away from, after Escape and after sending', async () => {
    setup();
    expect(screen.queryByRole('button', { name: /ask lam13/i })).toBeNull(); // no collapsed pill on load
    const initial = screen.getByLabelText('Message Lam13') as HTMLTextAreaElement;
    expect(document.activeElement).not.toBe(initial); // expanded, but focus is not stolen on load
    expect(screen.getByRole('button', { name: 'Add attachment' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Model: Lam' })).toBeTruthy();

    const stillExpanded = () => {
      expect(screen.getByLabelText('Message Lam13')).toBe(initial); // the same textarea: never swapped for the pill
      expect(screen.queryByRole('button', { name: /ask lam13/i })).toBeNull();
      expect(screen.getByRole('button', { name: 'Model: Lam' })).toBeTruthy();
    };
    fireEvent.keyDown(initial, { key: 'Escape' }); // empty + Escape
    stillExpanded();
    initial.focus();
    fireEvent.pointerDown(document.body); // a click elsewhere
    fireEvent.blur(initial, { relatedTarget: document.body }); // tabbing out
    stillExpanded();
    fireEvent.change(initial, { target: { value: 'Hello' } });
    fireEvent.keyDown(initial, { key: 'Enter' }); // after sending, empty again
    expect(initial.value).toBe('');
    stillExpanded();
    fireEvent.pointerDown(document.body);
    stillExpanded();
    expect(screen.getByRole('button', { name: 'Model: Lam' })).toBeTruthy();
    // The effort chip appears once the backend's catalogue loads.
    expect(await screen.findByRole('button', { name: /reasoning effort/i })).toBeTruthy();
  });

  it('the model selector defaults to Lam and lists real providers with their models; choosing one only changes the selection', () => {
    const { onSend } = setup();
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Model: Lam' }));
    const menu = () => screen.getByRole('menu', { name: 'Model' });
    expect(within(menu()).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Lam', 'OpenAI', 'Anthropic', 'Google', 'Moonshot AI', 'Qwen', 'Z.ai']);
    expect(within(menu()).getAllByRole('menuitemradio', { checked: true }).map((o) => o.textContent)).toEqual([expect.stringMatching(/^Lam/)]);
    expect(within(menu()).queryByText(/Lam (Deep|Swift|Research|Vision)|Lam13/)).toBeNull();
    expect(screen.queryByText(/soon/i)).toBeNull();
    for (const name of ['GPT-6.1 Sol', 'Claude Opus 5.5', 'Gemini 3.8 Pro', 'Kimi K3', 'Qwen3.8-Max', 'GLM 5.3']) {
      expect(within(menu()).getByRole('menuitemradio', { name })).toBeTruthy();
    }
    expect(screen.getByText(/Lam answers every message for now/)).toBeTruthy(); // never claims the others are live

    fireEvent.click(within(menu()).getByRole('menuitemradio', { name: 'Claude Sonnet 5.5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Model: Claude Sonnet 5.5' }));
    expect(within(menu()).getAllByRole('menuitemradio', { checked: true }).map((o) => o.textContent)).toEqual(['Claude Sonnet 5.5']);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('Qwen is a provider group with its logo and sample models; choosing one is a UI-only selection and Lam stays the default', () => {
    const { onSend } = setup();
    open();
    expect(screen.getByRole('button', { name: 'Model: Lam' })).toBeTruthy(); // the default is unchanged
    fireEvent.click(screen.getByRole('button', { name: 'Model: Lam' }));
    const menu = () => screen.getByRole('menu', { name: 'Model' });
    const qwen = within(menu()).getByRole('group', { name: 'Qwen' });
    expect(qwen.querySelector('img')).toBeTruthy();
    expect(within(qwen).getAllByRole('menuitemradio').map((o) => o.textContent)).toEqual(['Qwen3.8-Max', 'Qwen3.7-Plus', 'Qwen3.8-Flash']);
    expect(within(qwen).queryAllByRole('menuitemradio', { checked: true })).toEqual([]);
    expect(screen.getByText(/Other models are not connected yet/)).toBeTruthy(); // no claim that Qwen is live

    fireEvent.click(within(qwen).getByRole('menuitemradio', { name: 'Qwen3.7-Plus' }));
    fireEvent.click(screen.getByRole('button', { name: 'Model: Qwen3.7-Plus' }));
    expect(within(menu()).getAllByRole('menuitemradio', { checked: true }).map((o) => o.textContent)).toEqual(['Qwen3.7-Plus']);
    expect(onSend).not.toHaveBeenCalled();

    // Search finds it by provider and by model name.
    const names = () => within(menu()).queryAllByRole('menuitemradio').map((o) => o.textContent);
    const search = screen.getByRole('searchbox', { name: 'Search models' });
    fireEvent.change(search, { target: { value: 'qwen' } });
    expect(names()).toEqual(['Qwen3.8-Max', 'Qwen3.7-Plus', 'Qwen3.8-Flash']);
    fireEvent.change(search, { target: { value: '3.8-flash' } });
    expect(names()).toEqual(['Qwen3.8-Flash']);
  });

  it('the model list is searchable by model or provider', () => {
    setup();
    open();
    fireEvent.click(screen.getByRole('button', { name: /^Model:/ }));
    const names = () => within(screen.getByRole('menu', { name: 'Model' })).queryAllByRole('menuitemradio').map((o) => o.textContent);
    const search = screen.getByRole('searchbox', { name: 'Search models' });
    fireEvent.change(search, { target: { value: 'gemini' } });
    expect(names()).toEqual(['Gemini 3.8 Pro', 'Gemini 3.8 Flash']);
    fireEvent.change(search, { target: { value: 'anthropic' } });
    expect(names()).toEqual(['Claude Opus 5.5', 'Claude Sonnet 5.5', 'Claude Fable 5.1']);
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(names()).toEqual([]);
    expect(screen.getByText(/No models match/)).toBeTruthy();
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
