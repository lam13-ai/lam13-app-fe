import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiProvider, ATTACHMENT_LIMITS, createMockAdapter, INSTANT_TIMING, queryKeys, type ApiAdapter } from '@/api';
import { useImageAttachments } from '../hooks/useImageAttachments';
import { validateImageFiles } from './attachments';
import { createChatActions } from './chatStream';
import { toChronological, type MessagesData } from './messageCache';

const image = (name: string, type = 'image/png', size = 1024) => new File([new Uint8Array(size)], name, { type });

afterEach(() => vi.restoreAllMocks());

describe('validateImageFiles', () => {
  it('accepts supported images and rejects wrong types, oversize files and extras beyond the limit, with reasons', () => {
    const big = image('big.png', 'image/png', ATTACHMENT_LIMITS.maxBytes + 1);
    const { accepted, rejected } = validateImageFiles([image('a.png'), image('doc.pdf', 'application/pdf'), big, image('b.webp', 'image/webp')], 0);
    expect(accepted.map((f) => f.name)).toEqual(['a.png', 'b.webp']);
    expect(rejected).toEqual([
      { name: 'doc.pdf', reason: 'Only PNG, JPEG, WebP and GIF images can be attached.' },
      { name: 'big.png', reason: 'Images can be up to 10 MB.' },
    ]);

    const full = validateImageFiles([image('x.png'), image('y.png')], ATTACHMENT_LIMITS.maxFiles - 1);
    expect(full.accepted.map((f) => f.name)).toEqual(['x.png']);
    expect(full.rejected[0]).toEqual({ name: 'y.png', reason: 'You can attach up to 6 images.' });
  });
});

describe('attachments contract (mock adapter)', () => {
  it('uploads supported images and rejects others with the documented status codes', async () => {
    const api = createMockAdapter({ timing: INSTANT_TIMING });
    const ref = await api.attachments.upload({ file: image('chart.png'), filename: 'chart.png' });
    expect(ref).toMatchObject({ kind: 'image', filename: 'chart.png', mime_type: 'image/png', size_bytes: 1024 });
    await expect(api.attachments.upload({ file: image('x.svg', 'image/svg+xml'), filename: 'x.svg' })).rejects.toMatchObject({ status: 415 });
    await expect(
      api.attachments.upload({ file: image('huge.png', 'image/png', ATTACHMENT_LIMITS.maxBytes + 1), filename: 'huge.png' }),
    ).rejects.toMatchObject({ status: 413 });
  });

  it('attaches uploaded images to the sent message and rejects unknown ids before streaming', async () => {
    const api = createMockAdapter({ timing: INSTANT_TIMING });
    const ref = await api.attachments.upload({ file: image('chart.png'), filename: 'chart.png' });
    const events = [];
    for await (const e of await api.messages.send('water-security-kpis', { client_message_id: 'c1', kind: 'text', content: 'What does this show?', attachment_ids: [ref.id] })) {
      events.push(e);
    }
    const created = events.find((e) => e.event === 'message.created');
    expect(created?.event === 'message.created' && created.data.user_message.attachments?.map((a) => a.id)).toEqual([ref.id]);

    await expect(
      api.messages.send('water-security-kpis', { client_message_id: 'c2', kind: 'text', content: 'Hi', attachment_ids: ['missing'] }),
    ).rejects.toMatchObject({ status: 422, code: 'attachment_not_found' });
  });
});

function wrapper(api: ApiAdapter) {
  const client = new QueryClient();
  return ({ children }: { children: ReactNode }) => (
    <ApiProvider adapter={api}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </ApiProvider>
  );
}

describe('useImageAttachments', () => {
  it('previews, removes and clears drafts, revoking every object URL', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const { result, unmount } = renderHook(() => useImageAttachments(), { wrapper: wrapper(createMockAdapter({ timing: INSTANT_TIMING })) });

    let rejected: ReturnType<typeof result.current.add> = [];
    act(() => {
      rejected = result.current.add([image('a.png'), image('b.gif', 'image/gif'), image('c.txt', 'text/plain')]);
    });
    expect(rejected.map((r) => r.name)).toEqual(['c.txt']);
    expect(result.current.drafts.map((d) => [d.file.name, d.status])).toEqual([
      ['a.png', 'pending'],
      ['b.gif', 'pending'],
    ]);

    const [first, second] = result.current.drafts;
    act(() => result.current.remove(first!.id));
    expect(revoke).toHaveBeenCalledWith(first!.previewUrl);
    expect(result.current.drafts).toHaveLength(1);

    unmount();
    expect(revoke).toHaveBeenCalledWith(second!.previewUrl);
  });

  it('uploads on send, marks a failed image, and does not re-upload the ones already done', async () => {
    const api = createMockAdapter({ timing: INSTANT_TIMING });
    const realUpload = api.attachments.upload.bind(api.attachments);
    const upload = vi.spyOn(api.attachments, 'upload');
    const { result } = renderHook(() => useImageAttachments(), { wrapper: wrapper(api) });
    act(() => void result.current.add([image('a.png'), image('b.png')]));

    upload.mockImplementationOnce(realUpload).mockRejectedValueOnce(Object.assign(new Error('offline'), { name: 'TypeError' }));
    await act(async () => {
      await expect(result.current.upload('water-security-kpis')).rejects.toThrow();
    });
    expect(result.current.drafts.map((d) => d.status)).toEqual(['uploaded', 'error']);
    expect(result.current.drafts[1]!.error).toBeTruthy();

    upload.mockClear();
    upload.mockImplementation(realUpload);
    let refs: Awaited<ReturnType<typeof result.current.upload>> = [];
    await act(async () => {
      refs = await result.current.upload('water-security-kpis');
    });
    expect(upload).toHaveBeenCalledTimes(1); // only the failed one
    expect(refs).toHaveLength(2);
  });
});

describe('sending with attachments', () => {
  it('shows images on the optimistic message and sends their ids; the server copy is authoritative', async () => {
    const api = createMockAdapter({ timing: INSTANT_TIMING });
    const queryClient = new QueryClient();
    const send = vi.spyOn(api.messages, 'send');
    const ref = await api.attachments.upload({ file: image('chart.png'), filename: 'chart.png' });

    const pending = createChatActions({ api, queryClient }).send('water-security-kpis', 'What does this show?', { attachments: [ref] });
    const optimistic = toChronological(queryClient.getQueryData<MessagesData>(queryKeys.messages('water-security-kpis'))).at(-2);
    expect(optimistic?.attachments?.map((a) => a.id)).toEqual([ref.id]);
    await pending;

    expect(send.mock.calls[0]![1]).toMatchObject({ kind: 'text', attachment_ids: [ref.id] });
    const user = toChronological(queryClient.getQueryData<MessagesData>(queryKeys.messages('water-security-kpis'))).findLast((m) => m.role === 'user');
    expect(user?.attachments?.[0]).toMatchObject({ id: ref.id, filename: 'chart.png' });
  });
});
