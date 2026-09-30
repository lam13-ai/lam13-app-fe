import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { audioFocus } from '@/features/voice';
import { createMockCallFactory } from '@/features/calling';
import { installFakeMedia } from '@/test/fakeMedia';
import { renderApp, TEST_CALLING_ENV } from './testUtils';

let media: ReturnType<typeof installFakeMedia> | undefined;
afterEach(() => {
  vi.useRealTimers();
  media?.uninstall();
  media = undefined;
});

const panel = () => screen.getByRole('region', { name: 'Voice call' });
const transcriptLog = () => within(panel()).getByRole('log', { name: 'Call transcript' });

async function startCall() {
  const button = await screen.findByRole('button', { name: 'Start voice call' });
  await act(async () => fireEvent.click(button));
}

describe('voice calling (mock provider)', () => {
  it('idle → connecting → active, with live duration and an End call action', async () => {
    const { calls } = renderApp('/');
    await startCall();

    expect(within(panel()).getByText('Connecting…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel call' })).toBeTruthy();
    expect(calls.last!.config).toEqual({ publicKey: 'test-public-key', assistantId: 'test-assistant-id' });
    expect(audioFocus.active).toBe('call');

    act(() => calls.last!.connect());
    expect(within(panel()).getByText(/^Live · 0:0\d$/)).toBeTruthy();
    // Both the header action and the panel offer End call.
    expect(screen.getAllByRole('button', { name: 'End call' })).toHaveLength(2);
    expect(within(panel()).getByRole('button', { name: 'End call' })).toBeTruthy();
  });

  it('shows user/assistant transcripts (interim → final) and clears them after the call', async () => {
    const { calls } = renderApp('/');
    await startCall();
    act(() => calls.last!.connect());

    act(() => calls.last!.transcript({ role: 'assistant', text: 'Hello, how can', final: false }));
    act(() => calls.last!.transcript({ role: 'assistant', text: 'Hello, how can I help?', final: true }));
    act(() => calls.last!.transcript({ role: 'user', text: 'Draft KPIs', final: false }));

    const log = transcriptLog();
    expect(within(log).getByText('Lam13')).toBeTruthy();
    expect(within(log).getByText('You')).toBeTruthy();
    expect(within(log).getByText('Hello, how can I help?')).toBeTruthy();
    expect(within(log).queryByText('Hello, how can')).toBeNull();
    expect(within(log).getByText('(speaking)')).toBeTruthy(); // user line still interim

    // Transcripts stay out of chat history.
    expect(screen.queryByRole('log', { name: 'Conversation' })).toBeNull();

    await act(async () => fireEvent.click(within(panel()).getByRole('button', { name: 'End call' })));
    await startCall();
    act(() => calls.last!.connect());
    expect(within(transcriptLog()).queryByText('Hello, how can I help?')).toBeNull();
    expect(within(transcriptLog()).getByText('Say hello — Lam13 is listening.')).toBeTruthy();
  });

  it('End call: active → ending → idle, releasing the provider and audio focus', async () => {
    const { calls } = renderApp('/');
    await startCall();
    act(() => calls.last!.connect());

    await act(async () => fireEvent.click(within(panel()).getByRole('button', { name: 'End call' })));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Voice call' })).toBeNull());
    expect(calls.last!.endCalls).toBe(1);
    expect(calls.last!.disposed).toBe(true);
    expect(audioFocus.active).toBeNull();
    expect(screen.getByRole('button', { name: 'Start voice call' })).toBeTruthy();
  });

  it('the assistant ending the call returns cleanly to idle, and a new call can start', async () => {
    const { calls } = renderApp('/');
    await startCall();
    act(() => calls.last!.connect());
    act(() => calls.last!.transcript({ role: 'assistant', text: 'Goodbye!', final: true }));

    act(() => calls.last!.hangUp());
    expect(screen.queryByRole('region', { name: 'Voice call' })).toBeNull();
    expect(screen.queryByText('The call ran into a problem and ended.')).toBeNull();
    expect(calls.last!.disposed).toBe(true);
    expect(audioFocus.active).toBeNull();

    await startCall();
    act(() => calls.last!.connect());
    expect(calls.calls).toHaveLength(2);
    expect(within(panel()).getByText(/^Live ·/)).toBeTruthy();
    expect(within(transcriptLog()).queryByText('Goodbye!')).toBeNull();
  });

  it('connection failure shows a friendly error and Try again starts a fresh call', async () => {
    const calls = createMockCallFactory({ startError: { code: 'permission-denied', message: 'Microphone access was blocked. Allow it in your browser settings to call.' } });
    renderApp('/', { calls });
    await startCall();

    expect(await within(panel()).findByRole('alert')).toBeTruthy();
    expect(within(panel()).getByText(/Microphone access was blocked/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry voice call' })).toBeTruthy();
    expect(audioFocus.active).toBeNull();

    await act(async () => fireEvent.click(within(panel()).getByRole('button', { name: 'Try again' })));
    expect(calls.calls).toHaveLength(2);
    fireEvent.click(within(panel()).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('region', { name: 'Voice call' })).toBeNull();
  });

  it('allows 60 seconds for microphone permission and restarts the clock when granted', async () => {
    const calls = createMockCallFactory();
    const baseCreate = calls.create;
    let stage: 'microphone' | 'sdk' = 'microphone';
    let microphoneReady = () => {};
    calls.create = (config) => {
      const provider = baseCreate(config);
      provider.getStartStage = () => stage;
      provider.onMicrophoneReady = (listener) => {
        microphoneReady = listener;
        return () => { microphoneReady = () => {}; };
      };
      return provider;
    };
    renderApp('/', { calls });
    const button = await screen.findByRole('button', { name: 'Start voice call' });
    vi.useFakeTimers();
    act(() => fireEvent.click(button));

    act(() => vi.advanceTimersByTime(30_000));
    expect(within(panel()).getByText('Connecting…')).toBeTruthy();
    act(() => vi.advanceTimersByTime(15_000));
    stage = 'sdk';
    act(() => microphoneReady());
    act(() => vi.advanceTimersByTime(30_000));
    expect(within(panel()).getByText('Connecting…')).toBeTruthy();
    act(() => vi.advanceTimersByTime(30_000));
    expect(within(panel()).getByText("Voice calling couldn't start. Refresh the page and try again.")).toBeTruthy();
    expect(audioFocus.active).toBeNull();
  });

  it('identifies a microphone prompt left unanswered for 60 seconds', async () => {
    const calls = createMockCallFactory();
    const baseCreate = calls.create;
    calls.create = (config) => {
      const provider = baseCreate(config);
      provider.getStartStage = () => 'microphone';
      provider.onMicrophoneReady = () => () => {};
      return provider;
    };
    renderApp('/', { calls });
    const button = await screen.findByRole('button', { name: 'Start voice call' });
    vi.useFakeTimers();
    act(() => fireEvent.click(button));

    act(() => vi.advanceTimersByTime(59_000));
    expect(within(panel()).getByText('Connecting…')).toBeTruthy();
    act(() => vi.advanceTimersByTime(1_000));
    expect(within(panel()).getByText("Microphone access wasn't confirmed. Click Allow in your browser's prompt, then try again.")).toBeTruthy();
    expect(audioFocus.active).toBeNull();
  });

  it('unexpected termination or a mid-call error ends in a recoverable error state', async () => {
    const { calls } = renderApp('/');
    await startCall();
    act(() => calls.last!.connect());
    act(() => calls.last!.drop());
    expect(within(panel()).getByText('The call ended unexpectedly.')).toBeTruthy();
    expect(audioFocus.active).toBeNull();

    await act(async () => fireEvent.click(within(panel()).getByRole('button', { name: 'Try again' })));
    act(() => calls.last!.connect());
    act(() => calls.last!.fail({ code: 'call-failed', message: 'The call ran into a problem and ended.' }));
    expect(within(panel()).getByText('The call ran into a problem and ended.')).toBeTruthy();
    expect(calls.last!.disposed).toBe(true);
  });

  it('missing configuration fails safely, naming only the variables (dev builds)', async () => {
    const { calls } = renderApp('/', { callingEnv: { ...TEST_CALLING_ENV, vapi: { publicKey: undefined, assistantId: undefined } } });
    await startCall();
    expect(within(panel()).getByText("Voice calling isn't configured for this environment.")).toBeTruthy();
    expect(within(panel()).getByText('VITE_VAPI_PUBLIC_KEY')).toBeTruthy();
    expect(within(panel()).queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(calls.calls).toHaveLength(0);
  });

  it('cannot start a call while a voice note is recording', async () => {
    media = installFakeMedia();
    const { calls } = renderApp('/');
    const mic = await screen.findByRole('button', { name: 'Record voice message' });
    await act(async () => fireEvent.click(mic));
    await screen.findByRole('button', { name: 'Stop recording' });

    await startCall();
    expect(within(panel()).getByText('Finish or delete your voice recording before starting a call.')).toBeTruthy();
    expect(calls.calls).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Stop recording' })).toBeTruthy(); // recording untouched
  });

  it('cannot record a voice note during a call', async () => {
    media = installFakeMedia();
    const { calls } = renderApp('/');
    await startCall();
    act(() => calls.last!.connect());

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record voice message' })));
    expect(await screen.findByText('End the call to record a voice message.')).toBeTruthy();
    expect(media.getUserMedia).not.toHaveBeenCalled();
    expect(audioFocus.active).toBe('call');
  });

  it('signing out ends the call', async () => {
    const { calls } = renderApp('/');
    await startCall();
    act(() => calls.last!.connect());
    const drawer = screen.getByRole('dialog', { name: 'Sidebar', hidden: true });
    await act(async () => fireEvent.click(within(drawer).getByRole('button', { name: 'Sign out', hidden: true })));
    await screen.findByRole('heading', { name: 'Sign in to Lam13.' });
    expect(calls.last!.endCalls + (calls.last!.disposed ? 1 : 0)).toBeGreaterThan(0);
    expect(audioFocus.active).toBeNull();
  });
});
