import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFakeMedia } from '@/test/fakeMedia';
import { createVapiProvider, resolveVapiClass } from './vapiProvider';

/** Minimal stand-in for the Vapi SDK class: `start()` resolves and the call connects. */
class FakeVapi {
  static instances: FakeVapi[] = [];
  /** When set, start() emits this SDK error and resolves null (Vapi's connection-failure contract). */
  static startError: unknown = null;
  readonly publicKey: string;
  private listeners = new Map<string, ((payload?: unknown) => void)[]>();
  stop = vi.fn(async () => this.emit('call-end'));
  constructor(publicKey: string) {
    this.publicKey = publicKey;
    FakeVapi.instances.push(this);
  }
  on(event: string, listener: (payload?: unknown) => void) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }
  removeAllListeners() {
    this.listeners.clear();
  }
  emit(event: string, payload?: unknown) {
    this.listeners.get(event)?.forEach((listener) => listener(payload));
  }
  async start() {
    if (FakeVapi.startError) {
      this.emit('error', FakeVapi.startError);
      return null;
    }
    queueMicrotask(() => this.emit('call-start'));
    return { id: 'call' };
  }
}

// Regression: the Vite dev optimizer wraps the CommonJS SDK, so `mod.default` is `{ default: Vapi }`.
const sdk = vi.hoisted(() => ({ module: {} as Record<string, unknown> }));
vi.mock('@vapi-ai/web', () => sdk.module);

const CONFIG = { publicKey: 'pk-test', assistantId: 'assistant-test' };
let media: ReturnType<typeof installFakeMedia>;
afterEach(() => {
  media?.uninstall();
  FakeVapi.instances = [];
  FakeVapi.startError = null;
});

describe('resolveVapiClass', () => {
  it('accepts both CommonJS interop shapes and rejects anything else', () => {
    expect(resolveVapiClass({ default: FakeVapi })).toBe(FakeVapi);
    expect(resolveVapiClass({ default: { default: FakeVapi } })).toBe(FakeVapi);
    expect(resolveVapiClass({ default: {} })).toBeNull();
    expect(resolveVapiClass(null)).toBeNull();
  });
});

describe('createVapiProvider', () => {
  it('starts a call when the SDK arrives as { default: { default: Vapi } }', async () => {
    sdk.module.default = { default: FakeVapi };
    media = installFakeMedia();
    const provider = createVapiProvider(CONFIG);
    const states: string[] = [];
    provider.onStateChange((state) => states.push(state));

    await provider.start();
    await Promise.resolve();
    expect(FakeVapi.instances).toHaveLength(1);
    expect(FakeVapi.instances[0]!.publicKey).toBe('pk-test');
    expect(states).toEqual(['connecting', 'active']);

    await provider.end();
    expect(FakeVapi.instances[0]!.stop).toHaveBeenCalled();
    expect(states.at(-1)).toBe('ended');
  });

  it('reports an unusable SDK export as a provider error, not a connection failure, without leaking config', async () => {
    sdk.module.default = { default: { notAClass: true } };
    media = installFakeMedia();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(createVapiProvider(CONFIG).start()).rejects.toMatchObject({ code: 'provider-error' });
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('SDK initialisation failed');
    expect(logged).not.toContain('pk-test');
    expect(logged).not.toContain('assistant-test');
    warn.mockRestore();
  });
});

/** Daily's fatal error as the SDK forwards it when Vapi closes the room. */
const EJECTED = {
  type: 'daily-error',
  error: { message: 'Meeting has ended', action: 'error', errorMsg: 'Meeting has ended', error: { type: 'ejected', msg: 'Meeting has ended' } },
};
const endedStatus = (endedReason: string) => ({ type: 'status-update', status: 'ended', endedReason });

async function liveCall() {
  sdk.module.default = { default: FakeVapi };
  media = installFakeMedia();
  const provider = createVapiProvider(CONFIG);
  const states: string[] = [];
  const errors: string[] = [];
  provider.onStateChange((state) => states.push(state));
  provider.onError((error) => errors.push(error.code));
  await provider.start();
  await Promise.resolve();
  expect(states).toEqual(['connecting', 'active']);
  return { provider, vapi: FakeVapi.instances.at(-1)!, states, errors };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createVapiProvider call endings', () => {
  it.each(['assistant-ended-call', 'assistant-ended-call-after-message-spoken', 'assistant-said-end-call-phrase'])(
    '%s followed by the Daily ejection completes normally',
    async (reason) => {
      const { vapi, states, errors } = await liveCall();
      vapi.emit('message', endedStatus(reason));
      vapi.emit('error', EJECTED);
      vapi.emit('call-end');
      await settle();
      expect(states.at(-1)).toBe('completed');
      expect(errors).toEqual([]);
    },
  );

  it('a bare call-end or an ejection without a reason is a normal completion', async () => {
    const first = await liveCall();
    first.vapi.emit('call-end');
    expect(first.states.at(-1)).toBe('completed');

    const second = await liveCall();
    second.vapi.emit('error', EJECTED); // stop() then fires call-end
    await settle();
    expect(second.states.at(-1)).toBe('completed');
    expect(second.errors).toEqual([]);
  });

  it('an ejection after Vapi reported a failure reason is a call failure', async () => {
    const { vapi, states, errors } = await liveCall();
    vapi.emit('message', endedStatus('pipeline-error-openai-llm-failed'));
    vapi.emit('error', EJECTED);
    await settle();
    expect(errors).toEqual(['call-failed']);
    expect(states.at(-1)).toBe('ended');
  });

  it('a dropped connection whose room was deleted is a failure, despite the "Meeting has ended" text', async () => {
    const { vapi, errors, states } = await liveCall();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Observed in Chromium: network drop mid-call → Vapi ends the call → Daily reports `no-room`.
    vapi.emit('error', {
      type: 'daily-error',
      error: { action: 'error', errorMsg: 'Meeting has ended', message: { type: 'no-room', msg: 'Exiting meeting because room was deleted' }, error: { type: 'no-room' } },
    });
    await settle();
    expect(errors).toEqual(['call-failed']);
    expect(states.at(-1)).toBe('ended');
    vi.mocked(console.warn).mockRestore();
  });

  it('a transport error during a live call is still a call failure', async () => {
    const { vapi, errors, states } = await liveCall();
    vapi.emit('error', { type: 'daily-error', error: { errorMsg: 'Connection lost', error: { type: 'connection-error' } } });
    await settle();
    expect(errors).toEqual(['call-failed']);
    expect(states.at(-1)).toBe('ended');
  });

  it('a user hang-up ends cleanly even if Daily reports an error while leaving', async () => {
    const { provider, vapi, errors, states } = await liveCall();
    vapi.stop.mockImplementationOnce(async () => {
      vapi.emit('error', EJECTED);
      vapi.emit('call-end');
    });
    await provider.end();
    expect(errors).toEqual([]);
    expect(states.at(-1)).toBe('ended');
  });

  it('an ejection while connecting is a connection failure', async () => {
    sdk.module.default = { default: FakeVapi };
    media = installFakeMedia();
    FakeVapi.startError = EJECTED;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(createVapiProvider(CONFIG).start()).rejects.toMatchObject({ code: 'connection-failed' });
    vi.mocked(console.warn).mockRestore();
  });
});
