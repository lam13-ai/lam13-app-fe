import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpAdapter } from '@/api';
import { setAccessTokenGetter } from '@/api/auth';
import { PROJECT_CHAT_SEEDS } from '@/api/mock/projectChatFixtures';
import { FakeMediaRecorder, installFakeMedia } from '@/test/fakeMedia';
import { renderApp } from './testUtils';

/**
 * Safety of the demo layer in the real (HTTP) adapter:
 * 1. a demo conversation never reaches the backend's upload or transcription endpoints — and real
 *    conversations still do, with the same requests as before;
 * 2. the adapter (and so the app) starts when browser storage is blocked.
 */

const TOKEN = 'test-token-not-real';
const DEMO_IDS = PROJECT_CHAT_SEEDS.map((s) => s.id);
const find = { timeout: 8000 };

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: BodyInit | null | undefined;
}

/** Records every request; answers the routes a page needs, and `respond` for the rest. */
function backend(respond: (call: Call) => Response | undefined = () => undefined) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const call = { url, method: init.method ?? 'GET', headers: (init.headers ?? {}) as Record<string, string>, body: init.body };
    calls.push(call);
    return respond(call) ?? (url === '/chat/sessions' ? Response.json([]) : Response.json({ detail: 'Not Found' }, { status: 404 }));
  });
  return { calls, to: (url: string) => calls.filter((c) => c.url === url) };
}

const pdf = () => new File(['%PDF-1.4'], 'brief.pdf', { type: 'application/pdf' });
const audio = () => new Blob(['fake-audio'], { type: 'audio/webm' });

let unregister: () => void;
let media: ReturnType<typeof installFakeMedia> | undefined;
beforeEach(() => {
  unregister = setAccessTokenGetter(async () => TOKEN);
});
afterEach(() => {
  unregister();
  media?.uninstall();
  media = undefined;
  FakeMediaRecorder.supported = new Set(['audio/webm;codecs=opus', 'audio/webm']);
  vi.unstubAllGlobals();
});

describe('demo conversations never reach the upload or transcription endpoints', () => {
  it('the demo ids are exactly the eight sample conversations', () => {
    expect(DEMO_IDS).toEqual(['ws-c1', 'ws-c2', 'ws-c3', 'ws-c4', 'ai-c1', 'ai-c2', 'ds-c1', 'ds-c2']);
  });

  it.each(DEMO_IDS)('%s: an attachment is refused locally — no request', async (id) => {
    const { calls } = backend();
    await expect(createHttpAdapter().attachments.upload({ file: pdf(), filename: 'brief.pdf', conversation_id: id })).rejects.toMatchObject({
      status: 501,
      code: 'not_supported',
      message: "Attaching files isn't available in demo conversations.",
    });
    expect(calls).toEqual([]);
  });

  it.each(DEMO_IDS)('%s: a recording is refused locally — no request', async (id) => {
    const { calls } = backend();
    await expect(createHttpAdapter().audio.transcribe({ file: audio(), duration_ms: 1500, conversation_id: id })).rejects.toMatchObject({
      status: 501,
      code: 'not_supported',
      message: "Voice input isn't available in demo conversations.",
    });
    expect(calls).toEqual([]);
  });

  // Ids that merely resemble a demo id, a real session id, and no conversation at all (a new chat).
  it.each(['ws-c10', 'ws-c', 'WS-C1', ' ws-c1', 'ws-c1 ', 'xws-c1', 'ai-c3', '4f0c2c5e-8a57-4d0b-9c0e-2f6a7b1d3e90', null])(
    'a real conversation (%j) still uploads to POST /chat/upload, unchanged',
    async (id) => {
      const { calls } = backend((call) => (call.url === '/chat/upload' ? Response.json({ id: 'doc1', pdfName: 'brief.pdf' }) : undefined));
      const ref = await createHttpAdapter().attachments.upload({ file: pdf(), filename: 'brief.pdf', conversation_id: id });
      expect(ref).toMatchObject({ id: 'doc1', kind: 'document', filename: 'brief.pdf' });
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ url: '/chat/upload', method: 'POST' });
      expect(calls[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}`);
      const form = calls[0]!.body as FormData;
      expect((form.get('file') as File).name).toBe('brief.pdf');
      expect(form.get('session_id')).toBe(id); // null for a new chat: the field is not sent
      expect([...form.keys()]).toEqual(id ? ['file', 'session_id'] : ['file']);
    },
  );

  it.each(['ws-c10', 'WS-C1', '4f0c2c5e-8a57-4d0b-9c0e-2f6a7b1d3e90', null, undefined])(
    'a real conversation (%j) still transcribes via POST /voice/transcribe, and its id is not sent',
    async (id) => {
      const { calls } = backend((call) => (call.url === '/voice/transcribe' ? Response.json({ text: 'Draft the Q4 plan' }) : undefined));
      const result = await createHttpAdapter().audio.transcribe({ file: audio(), duration_ms: 1500, conversation_id: id });
      expect(result).toEqual({ text: 'Draft the Q4 plan' });
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ url: '/voice/transcribe', method: 'POST' });
      expect(calls[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}`);
      const form = calls[0]!.body as FormData;
      expect([...form.keys()]).toEqual(['file']); // exactly as before: only the recording
      expect((form.get('file') as File).name).toBe('recording.webm');
    },
  );

  it('in the app: attaching a file in a demo chat sends nothing to the backend and says why; the text is kept', async () => {
    const { calls, to } = backend();
    renderApp('/projects/water-security/c/ws-c1', { api: createHttpAdapter(), auth: { accessToken: TOKEN } });
    await screen.findByRole('log', { name: 'Conversation' }, find);
    fireEvent.click(screen.getByRole('button', { name: /ask lam13/i }));
    fireEvent.change(document.querySelector('input[type="file"][hidden]')!, { target: { files: [pdf()] } });
    expect(await screen.findByRole('list', { name: 'Attached files' })).toBeTruthy();
    const box = screen.getByLabelText('Message Lam13') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'Use this file.' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(await screen.findByText("Attaching files isn't available in demo conversations.", {}, find)).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText('Message Lam13') as HTMLTextAreaElement).value).toBe('Use this file.'));
    expect(to('/chat/upload')).toEqual([]);
    expect(to('/chat/stream')).toEqual([]);
    expect(calls.filter((c) => c.url.includes('ws-c1'))).toEqual([]);
    expect(within(screen.getByRole('log', { name: 'Conversation' })).queryByText('Use this file.')).toBeNull(); // nothing was sent
  });

  it('in the app: recording in a demo chat is not transcribed by the backend and says why', async () => {
    media = installFakeMedia();
    const { to } = backend();
    renderApp('/projects/water-security/c/ws-c1', { api: createHttpAdapter(), auth: { accessToken: TOKEN } });
    await screen.findByRole('log', { name: 'Conversation' }, find);
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Record voice message' }, find)));
    await screen.findByRole('button', { name: 'Stop recording' });
    await act(() => new Promise((resolve) => setTimeout(resolve, 300))); // real time passes while "recording"
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop recording' })));

    expect((await screen.findByRole('alert')).textContent).toContain("Voice input isn't available in demo conversations.");
    expect(to('/voice/transcribe')).toEqual([]);
    expect(to('/chat/stream')).toEqual([]);
  });
});

describe('blocked browser storage', () => {
  /** `localStorage` as when site data is blocked: reading the property itself throws. */
  function blockStorage() {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const access = vi.fn(() => {
      throw new DOMException('Access is denied for this document.', 'SecurityError');
    });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: access });
    return {
      access,
      restore: () => (original ? Object.defineProperty(globalThis, 'localStorage', original) : delete (globalThis as { localStorage?: Storage }).localStorage),
    };
  }
  /** A storage whose property can be read but whose every operation throws (quota / policy). */
  const brokenStorage = () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const fail = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: fail, setItem: fail, removeItem: fail, clear: fail, key: fail, length: 0 } });
    return () => (original ? Object.defineProperty(globalThis, 'localStorage', original) : undefined);
  };

  it('creating the adapter does not throw when reading localStorage throws, and projects work for the session', async () => {
    const blocked = blockStorage();
    try {
      const api = createHttpAdapter();
      expect(blocked.access).toHaveBeenCalled(); // the blocked property was reached — and survived
      expect((await api.projects.list()).length).toBeGreaterThan(0);
      const before = (await api.projects.get('ai-strategy')).chats.length;
      const after = await api.projects.linkChat('ai-strategy', { id: 'real-1', title: 'A real chat' });
      expect(after.chats).toHaveLength(before + 1); // kept in memory when it cannot be stored
    } finally {
      blocked.restore();
    }
  });

  it('storage that can be read as a property but fails on every operation is tolerated too', async () => {
    const restore = brokenStorage();
    try {
      const api = createHttpAdapter();
      const after = await api.projects.linkChat('ai-strategy', { id: 'real-2', title: 'Another chat' });
      expect(after.chats.some((c) => c.id === 'real-2')).toBe(true);
    } finally {
      restore();
    }
  });

  it('with working storage a link is still persisted and read back by a new adapter', async () => {
    const store = new Map<string, string>();
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    });
    try {
      await createHttpAdapter().projects.linkChat('ai-strategy', { id: 'real-3', title: 'Persisted chat' });
      expect([...store.keys()]).toEqual(['lam13.projectChats.v1']);
      expect((await createHttpAdapter().projects.get('ai-strategy')).chats.some((c) => c.id === 'real-3')).toBe(true); // as after a reload
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
    }
  });

  it('the app renders with the real adapter when storage is blocked', async () => {
    backend();
    const blocked = blockStorage();
    try {
      renderApp('/projects', { api: createHttpAdapter(), auth: { accessToken: TOKEN } });
      expect(await screen.findByRole('heading', { level: 1, name: 'Projects' }, find)).toBeTruthy();
      expect(within(await screen.findByRole('list', { name: 'Projects' }, find)).getAllByRole('link').length).toBeGreaterThan(0);
    } finally {
      blocked.restore();
    }
  });
});
