import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ATTACHMENT_LIMITS } from '@/api';
import { renderApp } from './testUtils';

/**
 * Pasting files into the message box is one more input to the attachment pipeline the file picker uses:
 * same validation, same chips (preview / remove), uploaded only when the message is sent.
 */

const file = (bytes: number, type: string, name = '') => new File([new Uint8Array(bytes)], name, { type });

/**
 * A paste's clipboard as Chrome exposes it. `via: 'items'` exposes the files only as DataTransferItems
 * (some browsers leave `files` empty).
 */
function clipboard({ files = [] as File[], text, via = 'files' as 'files' | 'items' }: { files?: File[]; text?: string; via?: 'files' | 'items' }) {
  const items = [
    ...(text === undefined ? [] : [{ kind: 'string', type: 'text/plain', getAsFile: () => null }]),
    ...files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })),
  ];
  return {
    files: via === 'files' ? files : [],
    items,
    types: [...(text === undefined ? [] : ['text/plain', 'text/html']), ...(files.length ? ['Files'] : [])],
    getData: (type: string) => (type === 'text/plain' ? (text ?? '') : ''),
  };
}

async function setup() {
  const app = renderApp('/c/water-security-kpis');
  await screen.findByRole('log', { name: 'Conversation' }, { timeout: 8000 });
  { const pill = screen.queryByRole('button', { name: /ask lam13/i }); if (pill) fireEvent.click(pill); }
  const upload = vi.spyOn(app.api.attachments, 'upload');
  const send = vi.spyOn(app.api.messages, 'send');
  return { ...app, upload, send };
}

const box = () => screen.getByLabelText('Message Lam13') as HTMLTextAreaElement;
/** Returns false when the paste's default (inserting text) was prevented. */
const paste = (data: ReturnType<typeof clipboard>) => fireEvent.paste(box(), { clipboardData: data });
/** The composer's attachment chips (a sent message has its own "Attached files" list). */
const chips = () => within(box().closest('form')!).queryByRole('list', { name: 'Attached files' });
const chipNames = () => (chips() ? within(chips()!).getAllByRole('listitem').map((li) => li.textContent) : []);

describe('pasting images and files into the message box', () => {
  it('leaves a plain-text paste to the browser: no attachment handling', async () => {
    await setup();
    expect(paste(clipboard({ text: 'Quarterly targets' }))).toBe(true); // not prevented: the text pastes natively
    expect(chips()).toBeNull();
  });

  it('attaches a nameless PNG screenshot as pasted-image.png — type, size and bytes kept, nothing uploaded or sent', async () => {
    const { upload, send } = await setup();
    const shot = file(2048, 'image/png');
    expect(paste(clipboard({ files: [shot] }))).toBe(false); // no text representation lands in the box
    expect(chipNames()).toEqual(['pasted-image.png']);
    expect(box().value).toBe('');
    expect(upload).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('names a nameless JPEG pasted-image.jpg, and keeps a copied file’s own name (files exposed only as items too)', async () => {
    await setup();
    paste(clipboard({ files: [file(1024, 'image/jpeg')] }));
    paste(clipboard({ files: [file(4096, 'application/pdf', 'Board pack Q3.pdf')], via: 'items' }));
    expect(chipNames()).toEqual(['pasted-image.jpg', 'Board pack Q3.pdf']);
  });

  it('uses the picker’s validation: wrong type, oversize and the attachment limit are rejected with its messages', async () => {
    await setup();
    paste(clipboard({ files: [file(10, 'text/csv', 'numbers.csv'), file(ATTACHMENT_LIMITS.maxBytes + 1, 'image/png', 'huge.png')] }));
    expect(await screen.findByText('numbers.csv: Only PDF, PNG, JPEG, WebP and GIF files can be attached.')).toBeTruthy();
    expect(await screen.findByText('huge.png: Files can be up to 25 MB.')).toBeTruthy();
    expect(chips()).toBeNull();

    const many = Array.from({ length: ATTACHMENT_LIMITS.maxFiles + 1 }, (_, i) => file(10, 'image/png', `shot-${i + 1}.png`));
    paste(clipboard({ files: many }));
    expect(chipNames()).toHaveLength(ATTACHMENT_LIMITS.maxFiles);
    expect(await screen.findByText(`shot-7.png: You can attach up to ${ATTACHMENT_LIMITS.maxFiles} files.`)).toBeTruthy();
  });

  it('attaches the files of a mixed paste and lets its plain text paste as usual', async () => {
    await setup();
    expect(paste(clipboard({ text: 'Revenue by region', files: [file(10, 'image/png', 'image.png')] }))).toBe(true);
    expect(chipNames()).toEqual(['image.png']);
  });

  it('a pasted attachment can be removed', async () => {
    await setup();
    paste(clipboard({ files: [file(10, 'image/png', 'chart.png')] }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove chart.png' }));
    expect(chips()).toBeNull();
  });

  it('is sent with the message through the normal flow: one upload, one message', async () => {
    const { upload, send } = await setup();
    paste(clipboard({ files: [file(10, 'image/png')] }));
    fireEvent.change(box(), { target: { value: 'What does this show?' } });
    await act(async () => fireEvent.keyDown(box(), { key: 'Enter' }));

    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(upload).toHaveBeenCalledOnce();
    expect(upload.mock.calls[0]![0]).toMatchObject({ filename: 'pasted-image.png' });
    const ref = await upload.mock.results[0]!.value;
    expect(send.mock.calls[0]![1]).toMatchObject({ content: 'What does this show?', attachment_ids: [ref.id] });
    await waitFor(() => expect(chips()).toBeNull());
  });

  it('the attach button’s file picker still attaches through the same path', async () => {
    await setup();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [file(10, 'image/webp', 'map.webp')] } });
    expect(chipNames()).toEqual(['map.webp']);
  });
});
