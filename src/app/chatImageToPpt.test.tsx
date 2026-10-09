import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpAdapter, type PresentationResult } from '@/api';
import { usePresentationRunsStore } from '@/features/presentations';
import { renderApp } from './testUtils';

/**
 * Image → PPT in the chat composer: sending PNG / JPG images (up to three) starts a presentation run in that
 * conversation — no prompt, no separate page, and no chat request for the images. These tests watch
 * `api.presentations.generate` and `api.messages.send` to prove what is and is not requested.
 */

const find = { timeout: 8000 };
beforeEach(() => {
  localStorage.clear();
  usePresentationRunsStore.setState({ runs: {} });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const png = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png', lastModified: name.length });
const jpg = (name: string) => new File([new Uint8Array([4, 5, 6])], name, { type: 'image/jpeg', lastModified: name.length });
const READY: PresentationResult = { kind: 'url', downloadUrl: 'https://service.test/studio/download/img2pptx__1' };
const LIMIT = 'You can upload a maximum of 3 images at a time.';

async function open(path = '/c/water-security-kpis') {
  const app = renderApp(path);
  await screen.findByLabelText('Message Lam13', {}, find);
  if (path !== '/' && !path.endsWith('/new')) await screen.findByRole('log', { name: 'Conversation' }, find);
  return {
    ...app,
    generate: vi.spyOn(app.api.presentations, 'generate'),
    send: vi.spyOn(app.api.messages, 'send'),
    upload: vi.spyOn(app.api.attachments, 'upload'),
  };
}
const box = () => screen.getByLabelText('Message Lam13') as HTMLTextAreaElement;
const form = () => box().closest('form')!;
const picker = () => document.querySelector<HTMLInputElement>('input[type="file"][hidden]')!;
const pick = (...files: File[]) => fireEvent.change(picker(), { target: { files } });
const chips = () => within(form()).queryByRole('list', { name: 'Attached files' });
const chipNames = () => (chips() ? within(chips()!).getAllByRole('listitem').map((li) => li.textContent) : []);
const sendButton = () => within(form()).getByRole('button', { name: 'Send message' }) as HTMLButtonElement;
const sentImages = () => screen.getAllByRole('list', { name: 'Images for the presentation' }).map((ul) => within(ul).getAllByRole('img').map((img) => img.getAttribute('alt')));

describe('sending images in a chat starts a presentation', () => {
  it('one PNG and no text: Send is enabled, generation starts by itself, and no chat request is made', async () => {
    const { generate, send, upload } = await open();
    expect(picker().accept).toBe('application/pdf,image/jpeg,image/png,.jpg,.jpeg,.png'); // the dialog offers PDF, PNG and JPG only
    pick(png('chart.png'));
    expect(chipNames()).toEqual(['chart.png']);
    expect(box().value).toBe('');
    expect(sendButton().disabled).toBe(false); // nothing needs to be typed
    expect(generate).not.toHaveBeenCalled(); // attaching alone sends nothing

    let finish!: (result: PresentationResult) => void;
    generate.mockImplementation(() => new Promise<PresentationResult>((resolve) => (finish = resolve)));
    fireEvent.click(sendButton());

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]![0].map((f) => [f.name, f.type])).toEqual([['chart.png', 'image/png']]);
    expect(send).not.toHaveBeenCalled(); // not routed through the chat model
    expect(upload).not.toHaveBeenCalled(); // not uploaded as a chat document either
    expect(chips()).toBeNull();
    expect(sentImages()).toEqual([['chart.png']]);

    // Running: the progress line in the conversation, and the composer busy with Stop — so no second run can start.
    const progress = await screen.findByRole('region', { name: 'Presentation progress' });
    expect(within(progress).getByText("We've received your images and started preparing the presentation.")).toBeTruthy();
    expect(within(progress).getByText(/Processing for 00:0\d/)).toBeTruthy();
    expect(within(form()).getByRole('button', { name: 'Stop generating' })).toBeTruthy();
    expect(box().disabled).toBe(true);
    fireEvent.submit(form());
    expect(generate).toHaveBeenCalledTimes(1);

    await act(async () => finish(READY));
    const ready = await screen.findByRole('region', { name: 'Presentation ready' });
    expect(within(ready).getByText(/^Strategic-Presentation-\d{4}-\d{2}-\d{2}-\d{4}\.pptx$/)).toBeTruthy();
    const download = within(ready).getByRole('link', { name: 'Download presentation' }) as HTMLAnchorElement;
    expect(download.href).toBe(READY.downloadUrl); // exactly as the service returned it
    expect(download.getAttribute('download')).toMatch(/\.pptx$/);
    expect([download.target, download.rel]).toEqual(['_blank', 'noopener noreferrer']);
    expect(screen.queryByRole('region', { name: 'Presentation progress' })).toBeNull();
    expect(box().disabled).toBe(false); // the chat is free again
    expect(send).not.toHaveBeenCalled();
  });

  it('JPG and JPEG are accepted; two and three images make one run', async () => {
    const { generate } = await open();
    generate.mockResolvedValue(READY);
    pick(jpg('one.jpg'), jpg('two.jpeg'));
    expect(chipNames()).toEqual(['one.jpg', 'two.jpeg']);
    fireEvent.click(sendButton());
    await screen.findByRole('region', { name: 'Presentation ready' });
    expect(generate.mock.calls[0]![0].map((f) => [f.name, f.type])).toEqual([
      ['one.jpg', 'image/jpeg'],
      ['two.jpeg', 'image/jpeg'],
    ]);

    pick(png('a.png'), jpg('bb.JPG'), png('ccc.png'));
    expect(chipNames()).toEqual(['a.png', 'bb.JPG', 'ccc.png']);
    await act(async () => fireEvent.click(sendButton()));
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
    expect(generate.mock.calls[1]![0].map((f) => f.name)).toEqual(['a.png', 'bb.JPG', 'ccc.png']);
    expect(sentImages()).toEqual([['one.jpg', 'two.jpeg'], ['a.png', 'bb.JPG', 'ccc.png']]);
  });

  it('a fourth image is refused at once — picked, pasted, dropped, or four at once — before any request', async () => {
    const { generate, send } = await open();
    pick(png('a.png'), png('bb.png'), png('ccc.png'));
    pick(png('fourth.png'));
    expect(chipNames()).toEqual(['a.png', 'bb.png', 'ccc.png']);
    expect(await screen.findByText(LIMIT)).toBeTruthy();

    fireEvent.paste(box(), { clipboardData: { files: [png('pasted.png')], items: [], types: ['Files'], getData: () => '' } });
    fireEvent.drop(screen.getByRole('region', { name: 'Chat' }), { dataTransfer: { files: [jpg('dropped.jpg')], types: ['Files'] } });
    expect(chipNames()).toEqual(['a.png', 'bb.png', 'ccc.png']);
    expect(generate).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();

    generate.mockResolvedValue(READY);
    fireEvent.click(sendButton());
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    expect(generate.mock.calls[0]![0]).toHaveLength(3);
    cleanup();

    await open();
    pick(png('n1.png'), png('n2.png'), jpg('n3.jpg'), png('n4.png'));
    expect(chipNames()).toEqual(['n1.png', 'n2.png', 'n3.jpg']);
    expect(await screen.findByText(LIMIT)).toBeTruthy();
    cleanup();

    await open();
    fireEvent.drop(screen.getByRole('region', { name: 'Chat' }), { dataTransfer: { files: ['d1', 'd2', 'd3', 'd4'].map((n) => jpg(`${n}.jpg`)), types: ['Files'] } });
    expect(chipNames()).toEqual(['d1.jpg', 'd2.jpg', 'd3.jpg']);
    expect(await screen.findByText(LIMIT)).toBeTruthy();
  });

  it('unsupported formats are refused at once and never converted or sent', async () => {
    const { generate, send, upload } = await open();
    const other = (name: string, type: string) => new File([new Uint8Array([7])], name, { type });
    pick(other('anim.gif', 'image/gif'), other('photo.webp', 'image/webp'), other('logo.svg', 'image/svg+xml'), other('scan.bmp', 'image/bmp'), other('page.tiff', 'image/tiff'));
    expect(await screen.findByText('Unsupported file type. Please upload JPG, JPEG, or PNG images only. Skipped anim.gif, photo.webp, logo.svg and 2 more.')).toBeTruthy();
    expect(chips()).toBeNull();
    expect(within(form()).queryByRole('button', { name: 'Send message' })).toBeNull(); // nothing to send: the mic is offered, as with an empty box

    pick(other('numbers.csv', 'text/csv'));
    expect(await screen.findByText('numbers.csv: Only PDF documents and PNG or JPG images can be attached.')).toBeTruthy();
    // a mixed pick keeps only the PNG / JPG
    pick(png('ok.png'), other('no.gif', 'image/gif'));
    expect(chipNames()).toEqual(['ok.png']);
    expect([generate.mock.calls.length, send.mock.calls.length, upload.mock.calls.length]).toEqual([0, 0, 0]);
  });

  it('images with text: one presentation run, the text shown with the images, and no chat request', async () => {
    const { generate, send, upload } = await open();
    generate.mockResolvedValue(READY);
    pick(png('chart.png'));
    fireEvent.change(box(), { target: { value: 'Board update for Q3' } });
    await act(async () => fireEvent.keyDown(box(), { key: 'Enter' }));
    await screen.findByRole('region', { name: 'Presentation ready' });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled(); // no duplicate request through the chat
    expect(upload).not.toHaveBeenCalled();
    const turn = screen.getByRole('list', { name: 'Images for the presentation' }).parentElement!;
    expect(turn.textContent).toContain('Board update for Q3'); // the text is kept in the conversation
    expect(box().value).toBe('');
  });

  it('a text-only message and a PDF with text still go through the normal chat flow', async () => {
    const { generate, send, upload } = await open();
    fireEvent.change(box(), { target: { value: 'What are the next steps?' } });
    await act(async () => fireEvent.keyDown(box(), { key: 'Enter' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0]![1]).toMatchObject({ content: 'What are the next steps?' });
    expect(generate).not.toHaveBeenCalled();
    await waitFor(() => expect(box().disabled).toBe(false), find);

    pick(new File([new Uint8Array([1])], 'Board pack.pdf', { type: 'application/pdf' }));
    expect(chipNames()).toEqual(['Board pack.pdf']);
    expect(within(form()).queryByRole('button', { name: 'Send message' })).toBeNull(); // a document still needs a question
    fireEvent.change(box(), { target: { value: 'Summarise this.' } });
    await act(async () => fireEvent.keyDown(box(), { key: 'Enter' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(generate).not.toHaveBeenCalled();
  });

  it('images and a document are not mixed in one message', async () => {
    await open();
    pick(png('chart.png'));
    pick(new File([new Uint8Array([1])], 'Board pack.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText('Send images and documents separately: images are turned into a presentation.')).toBeTruthy();
    expect(chipNames()).toEqual(['chart.png']);
  });
});

describe('a presentation run in the conversation', () => {
  it('Stop cancels the run and gives the images and text back to the composer; a late answer is ignored', async () => {
    const { generate } = await open();
    let finish!: (result: PresentationResult) => void;
    generate.mockImplementation(() => new Promise<PresentationResult>((resolve) => (finish = resolve)));
    pick(png('chart.png'));
    fireEvent.change(box(), { target: { value: 'For the board' } });
    fireEvent.click(sendButton());
    await screen.findByRole('region', { name: 'Presentation progress' });
    const signal = generate.mock.calls[0]![1]!.signal!;

    fireEvent.click(within(form()).getByRole('button', { name: 'Stop generating' }));
    expect(signal.aborted).toBe(true); // the request and its polling end with this signal
    expect(screen.queryByRole('region', { name: 'Presentation progress' })).toBeNull();
    expect(chipNames()).toEqual(['chart.png']);
    await waitFor(() => expect(box().value).toBe('For the board'));
    await act(async () => finish(READY));
    expect(screen.queryByRole('region', { name: 'Presentation ready' })).toBeNull();

    generate.mockResolvedValue(READY); // and it can be sent again
    await act(async () => fireEvent.click(sendButton()));
    await screen.findByRole('region', { name: 'Presentation ready' });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('a failure shows one calm message; "Try again" runs the same images again, once', async () => {
    const { generate, send } = await open();
    generate.mockRejectedValueOnce(new Error('400 at most 3 images per deck — internal detail')).mockResolvedValueOnce(READY);
    pick(png('a.png'), jpg('bb.jpg'));
    fireEvent.click(sendButton());
    const failed = await screen.findByRole('region', { name: 'Presentation failed' });
    expect(within(failed).getByRole('alert').textContent).toBe("We couldn't finish your presentation this time.");
    expect(document.body.textContent).not.toContain('internal detail');
    expect(box().disabled).toBe(false);

    fireEvent.click(within(failed).getByRole('button', { name: 'Try again' }));
    await screen.findByRole('region', { name: 'Presentation ready' });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]![0].map((f) => f.name)).toEqual(['a.png', 'bb.jpg']);
    expect(screen.getAllByRole('list', { name: 'Images for the presentation' })).toHaveLength(1); // retried in place
    expect(send).not.toHaveBeenCalled();
  });

  it('a deck short of a slide still succeeds and says how many images made it', async () => {
    const { generate } = await open();
    generate.mockResolvedValue({ ...READY, asked: 3, slideCount: 2 });
    pick(png('a.png'), png('bb.png'), png('ccc.png'));
    fireEvent.click(sendButton());
    const ready = await screen.findByRole('region', { name: 'Presentation ready' });
    expect(within(ready).getByText('2 of 3 images were converted. The rest could not be read.')).toBeTruthy();
  });

  it('stays with its conversation: not shown in another one, back when returning, and kept after a reload', async () => {
    const { generate, router } = await open();
    generate.mockResolvedValue(READY);
    pick(png('chart.png'));
    fireEvent.click(sendButton());
    await screen.findByRole('region', { name: 'Presentation ready' });

    await act(async () => void router.navigate('/'));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Presentation ready' })).toBeNull());
    await act(async () => void router.navigate('/c/water-security-kpis'));
    expect(await screen.findByRole('region', { name: 'Presentation ready' }, find)).toBeTruthy();
    cleanup();

    // A reload: the page's memory is gone; the finished deck of this conversation comes back from the browser's storage.
    const stored = localStorage.getItem('lam13:presentation-runs')!;
    expect(stored).toContain('water-security-kpis');
    expect(stored).not.toContain('blob:'); // no dead preview links are kept
    usePresentationRunsStore.setState({ runs: {} });
    localStorage.setItem('lam13:presentation-runs', stored);
    await usePresentationRunsStore.persist.rehydrate();
    await open();
    const ready = await screen.findByRole('region', { name: 'Presentation ready' }, find);
    expect((within(ready).getByRole('link', { name: 'Download presentation' }) as HTMLAnchorElement).href).toBe(READY.downloadUrl);
    expect(screen.getByRole('list', { name: 'Images for the presentation' }).textContent).toContain('chart.png'); // by name: the picture itself is not kept
  });

  it('in a new chat: the run shows without creating a conversation, and follows the chat once a message creates it', async () => {
    const { generate, send, router } = await open('/');
    generate.mockResolvedValue(READY);
    pick(png('chart.png'));
    fireEvent.click(sendButton());
    await screen.findByRole('region', { name: 'Presentation ready' });
    expect(router.state.location.pathname).toBe('/'); // no conversation was created for the images
    expect(send).not.toHaveBeenCalled();

    fireEvent.change(box(), { target: { value: 'Now draft the cover note' } });
    await act(async () => fireEvent.keyDown(box(), { key: 'Enter' }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/c\/.+/), find);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('region', { name: 'Presentation ready' })).toBeTruthy(); // still there, now under the conversation
    const id = router.state.location.pathname.split('/')[2]!;
    expect(Object.keys(usePresentationRunsStore.getState().runs)).toEqual([id]);
  });
});

describe('Project Chats', () => {
  it('image-only submissions start a presentation in a project chat too, with no chat request', async () => {
    const { generate, send, router } = await open('/projects/water-security/c/ws-c1');
    generate.mockResolvedValue(READY);
    pick(png('chart.png'), jpg('map.jpg'));
    expect(sendButton().disabled).toBe(false);
    fireEvent.click(sendButton());
    const ready = await screen.findByRole('region', { name: 'Presentation ready' });
    expect(within(ready).getByRole('link', { name: 'Download presentation' })).toBeTruthy();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]![0].map((f) => f.name)).toEqual(['chart.png', 'map.jpg']);
    expect(send).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe('/projects/water-security/c/ws-c1');
    expect(Object.keys(usePresentationRunsStore.getState().runs)).toEqual(['ws-c1']); // filed under this project conversation
  });

  it('a fourth image is refused there as well', async () => {
    const { generate } = await open('/projects/water-security/c/ws-c1');
    pick(png('a.png'), png('bb.png'), png('ccc.png'), png('dddd.png'));
    expect(chipNames()).toEqual(['a.png', 'bb.png', 'ccc.png']);
    expect(await screen.findByText(LIMIT)).toBeTruthy();
    expect(generate).not.toHaveBeenCalled();
  });
});

describe('the separate Image to PPT page is gone', () => {
  it('no sidebar entry, and its old address is not a page', async () => {
    const { router } = renderApp('/');
    await screen.findByRole('link', { name: 'Projects' }, find);
    expect(screen.queryByRole('link', { name: /Image to PPT/i })).toBeNull();
    await act(async () => void router.navigate('/image-to-ppt'));
    expect(screen.queryByRole('heading', { level: 1, name: 'Image to PPT' })).toBeNull();
    expect((await screen.findAllByText(/not found|doesn.t exist|404/i, {}, find)).length).toBeGreaterThan(0);
  });
});

describe('without a generation service configured (the real adapter)', () => {
  it('sending images says so, starts nothing, and keeps the images and text', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      calls.push(`${init.method ?? 'GET'} ${url}`);
      return Response.json([]);
    });
    renderApp('/', { api: createHttpAdapter(), auth: { accessToken: 'test-token-not-real' } }); // the test build has no VITE_PRESENTATION_ENDPOINT
    await screen.findByLabelText('Message Lam13', {}, find);
    pick(png('chart.png'));
    fireEvent.change(box(), { target: { value: 'For the board' } });
    fireEvent.click(sendButton());
    expect(await screen.findByText('Image to PPT is not set up on this deployment yet.')).toBeTruthy();
    expect(chipNames()).toEqual(['chart.png']);
    await waitFor(() => expect(box().value).toBe('For the board'));
    expect(screen.queryByRole('region', { name: 'Presentation progress' })).toBeNull();
    expect(calls.some((c) => /generate|pptx|studio|chat\/stream|chat\/upload/.test(c))).toBe(false);
  });
});
