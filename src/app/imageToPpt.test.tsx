import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpAdapter, type PresentationResult } from '@/api';
import { renderApp } from './testUtils';

/**
 * Image → PPT (`/image-to-ppt`): up to five PNG / JPG images become one PowerPoint. Every rule is checked
 * on the page before `api.presentations.generate` is called; these tests watch that call to prove what does
 * and does not reach the generation service.
 */

const find = { timeout: 8000 };
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const png = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png', lastModified: name.length });
const jpg = (name: string) => new File([new Uint8Array([4, 5, 6])], name, { type: 'image/jpeg', lastModified: name.length });
const READY: PresentationResult = { kind: 'url', downloadUrl: 'https://service.test/studio/download/img2pptx__1', asked: 1, slideCount: 1 };

async function open() {
  const app = renderApp('/image-to-ppt');
  await screen.findByRole('heading', { level: 1, name: 'Image to PPT' }, find);
  const generate = vi.spyOn(app.api.presentations, 'generate');
  return { ...app, generate };
}
const picker = () => screen.getByLabelText('Choose images to upload') as HTMLInputElement;
const pick = (...files: File[]) => fireEvent.change(picker(), { target: { files } });
const selected = () => within(screen.getByRole('list', { name: 'Selected images' })).getAllByRole('listitem').map((li) => li.textContent);
const generateButton = () => screen.getByRole('button', { name: 'Generate presentation' }) as HTMLButtonElement;
const alerts = () => screen.queryAllByRole('alert').map((a) => a.textContent);

describe('Image to PPT: where it is and what it says', () => {
  it('is in the sidebar, and the page states the five-image limit and the accepted formats', async () => {
    const { router } = renderApp('/');
    fireEvent.click(await screen.findByRole('link', { name: 'Image to PPT' }, find));
    expect(await screen.findByRole('heading', { level: 1, name: 'Image to PPT' }, find)).toBeTruthy();
    expect(router.state.location.pathname).toBe('/image-to-ppt');
    expect(screen.getByText('JPG, JPEG or PNG · Up to 5 images')).toBeTruthy();
    expect(screen.getByText(/Add up to 5 images \(JPG, JPEG or PNG\)/)).toBeTruthy();
    expect(picker().accept).toBe('image/jpeg,image/png,.jpg,.jpeg,.png'); // the file dialog offers PNG and JPG only
    expect(picker().multiple).toBe(true);
    expect(generateButton().disabled).toBe(true); // nothing to generate from yet
  });
});

describe('Image to PPT: selection is validated before anything is sent', () => {
  it('one image, and five images (PNG, JPG and JPEG), are accepted', async () => {
    const { generate } = await open();
    pick(png('one.png'));
    expect(selected()).toEqual(['one.png']);
    expect(screen.getByLabelText('1 of 5 images selected')).toBeTruthy();
    expect(generateButton().disabled).toBe(false);

    pick(jpg('two.jpg'), jpg('three.jpeg'), png('four.png'), jpg('five.JPG'));
    expect(selected()).toEqual(['one.png', 'two.jpg', 'three.jpeg', 'four.png', 'five.JPG']);
    expect(screen.getByLabelText('5 of 5 images selected')).toBeTruthy();
    expect(alerts()).toEqual([]);
    expect((screen.getByRole('button', { name: 'Add images' }) as HTMLButtonElement).disabled).toBe(true); // the picker cannot be opened for a sixth
    expect(screen.getByText('You have added the maximum of 5 images. Remove one to add another.')).toBeTruthy();
    expect(generate).not.toHaveBeenCalled();
  });

  it('a sixth image is blocked at once — added later, dropped, or picked in one batch — and never reaches generation', async () => {
    const { generate } = await open();
    pick(...['a', 'b', 'c', 'd', 'e'].map((n) => png(`${n}.png`)));
    pick(png('sixth.png'));
    expect(selected()).toHaveLength(5);
    expect(selected()).not.toContain('sixth.png');
    expect(alerts()).toEqual(['You can upload up to 5 images at a time.']);
    expect(generate).not.toHaveBeenCalled(); // rejected on the page, with no request

    // dropped onto the composer: the same answer
    const zone = screen.getByRole('list', { name: 'Selected images' }).parentElement!.parentElement!;
    fireEvent.drop(zone, { dataTransfer: { files: [jpg('dropped.jpg')] } });
    expect(selected()).toHaveLength(5);
    expect(alerts()).toEqual(['You can upload up to 5 images at a time.']);

    // what is generated is exactly the five
    generate.mockResolvedValue(READY);
    fireEvent.click(generateButton());
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    expect(generate.mock.calls[0]![0].map((f) => f.name)).toEqual(['a.png', 'b.png', 'c.png', 'd.png', 'e.png']);
    cleanup();

    // seven picked at once: the first five are kept, the rest are refused
    await open();
    pick(...['1', '2', '3', '4', '5', '6', '7'].map((n) => png(`n${n}.png`)));
    expect(selected()).toEqual(['n1.png', 'n2.png', 'n3.png', 'n4.png', 'n5.png']);
    expect(alerts()).toEqual(['You can upload up to 5 images at a time.']);
  });

  it('an unsupported file is blocked at once, is not converted, and never reaches generation', async () => {
    const { generate } = await open();
    const gif = new File([new Uint8Array([7])], 'animation.gif', { type: 'image/gif' });
    const pdf = new File([new Uint8Array([8])], 'brief.pdf', { type: 'application/pdf' });
    const webp = new File([new Uint8Array([9])], 'photo.webp', { type: 'image/webp' });
    pick(gif);
    expect(alerts()).toEqual(['Unsupported file type. Please upload JPG, JPEG, or PNG images only. Skipped animation.gif.']);
    expect(screen.queryByRole('list', { name: 'Selected images' })).toBeNull();
    expect(generateButton().disabled).toBe(true);

    // a mixed pick keeps only the PNG / JPG files
    pick(png('ok.png'), pdf, webp, jpg('ok.jpg'));
    expect(selected()).toEqual(['ok.png', 'ok.jpg']);
    expect(alerts()).toEqual(['Unsupported file type. Please upload JPG, JPEG, or PNG images only. Skipped brief.pdf, photo.webp.']);
    expect(generate).not.toHaveBeenCalled();

    generate.mockResolvedValue(READY);
    fireEvent.click(generateButton());
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    expect(generate.mock.calls[0]![0].map((f) => [f.name, f.type])).toEqual([
      ['ok.png', 'image/png'],
      ['ok.jpg', 'image/jpeg'],
    ]);
  });

  it('a duplicate is not added twice; removing an image makes room again', async () => {
    await open();
    const a = png('a.png');
    pick(a, png('bb.png'));
    pick(a);
    expect(selected()).toEqual(['a.png', 'bb.png']);
    expect(alerts()).toEqual(['That image is already selected.']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove image a.png' }));
    expect(selected()).toEqual(['bb.png']);
    expect(alerts()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove all' }));
    expect(screen.queryByRole('list', { name: 'Selected images' })).toBeNull();
  });

  it('a pasted image takes the same path as a picked one, with the same rules', async () => {
    await open();
    const paste = (file: File) => fireEvent.paste(window, { clipboardData: { items: [{ kind: 'file', type: file.type, getAsFile: () => file }], files: [] } });
    paste(new File([new Uint8Array([1])], 'image.png', { type: 'image/png' }));
    expect(selected()).toEqual(['pasted-image.png']);
    paste(new File([new Uint8Array([2])], 'image.gif', { type: 'image/gif' }));
    expect(selected()).toEqual(['pasted-image.png']);
    expect(alerts()[0]).toMatch(/Unsupported file type.*pasted-image-2\.gif/);
  });
});

describe('Image to PPT: generation', () => {
  it('shows progress while it runs — one run only — then the download and "Create another presentation"', async () => {
    const { generate } = await open();
    let finish!: (result: PresentationResult) => void;
    generate.mockImplementation(() => new Promise<PresentationResult>((resolve) => (finish = resolve)));
    pick(png('one.png'));
    fireEvent.click(generateButton());

    // Running: the submitted image, the first status line, the timer — and no way to start a second run.
    const progress = await screen.findByRole('region', { name: 'Progress' });
    expect(within(progress).getByText("We've received your images and started preparing the presentation.")).toBeTruthy();
    expect(within(progress).getByText(/Processing for 00:0\d/)).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Submitted images' })).getByText('1 image submitted')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Generate presentation' })).toBeNull();
    expect(screen.queryByLabelText('Choose images to upload')).toBeNull();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]![0].map((f) => f.name)).toEqual(['one.png']);
    expect(generate.mock.calls[0]![1]!.signal!.aborted).toBe(false);

    await act(async () => finish({ ...READY, asked: 1, slideCount: 1 }));
    const ready = await screen.findByRole('region', { name: 'Presentation ready' });
    expect(within(ready).getByText('Your presentation is ready.')).toBeTruthy();
    expect(within(ready).getByText(/^Strategic-Presentation-\d{4}-\d{2}-\d{2}-\d{4}\.pptx$/)).toBeTruthy(); // labelled for display
    const download = within(ready).getByRole('link', { name: 'Download presentation' }) as HTMLAnchorElement;
    expect(download.href).toBe(READY.downloadUrl); // exactly as the service returned it
    expect(download.getAttribute('download')).toMatch(/\.pptx$/);
    expect([download.target, download.rel]).toEqual(['_blank', 'noopener noreferrer']);
    expect(within(ready).queryByText(/images were converted/)).toBeNull();
    expect(screen.queryByText(/Processing for/)).toBeNull();

    fireEvent.click(within(ready).getByRole('button', { name: 'Create another presentation' }));
    expect(screen.getByText('Attach images to get started')).toBeTruthy(); // back to an empty composer
    expect(generateButton().disabled).toBe(true);
  });

  it('a deck short of a slide still succeeds and says how many images made it', async () => {
    const { generate } = await open();
    generate.mockResolvedValue({ ...READY, asked: 3, slideCount: 2 });
    pick(png('a.png'), png('bb.png'), png('ccc.png'));
    fireEvent.click(generateButton());
    const ready = await screen.findByRole('region', { name: 'Presentation ready' });
    expect(within(ready).getByText('2 of 3 images were converted. The rest could not be read.')).toBeTruthy();
    expect(within(ready).getByRole('link', { name: 'Download presentation' })).toBeTruthy();
  });

  it('a failure shows one calm message; "Try again" runs the same images again, "Start over" clears them', async () => {
    const { generate } = await open();
    generate.mockRejectedValueOnce(new Error('503 internal detail that must not be shown')).mockResolvedValueOnce(READY);
    pick(png('a.png'), jpg('bb.jpg'));
    fireEvent.click(generateButton());
    const failed = await screen.findByRole('region', { name: 'Generation failed' });
    expect(within(failed).getByRole('alert').textContent).toBe("We couldn't finish your presentation this time.");
    expect(document.body.textContent).not.toContain('internal detail');
    expect(screen.queryByRole('link', { name: 'Download presentation' })).toBeNull();

    fireEvent.click(within(failed).getByRole('button', { name: 'Try again' }));
    await screen.findByRole('region', { name: 'Presentation ready' });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]![0].map((f) => f.name)).toEqual(['a.png', 'bb.jpg']); // the same selection, no re-upload
    cleanup();

    const again = await open();
    again.generate.mockRejectedValue(new Error('nope'));
    pick(png('a.png'));
    fireEvent.click(generateButton());
    fireEvent.click(within(await screen.findByRole('region', { name: 'Generation failed' })).getByRole('button', { name: 'Start over' }));
    expect(screen.getByText('Attach images to get started')).toBeTruthy();
    expect(again.generate).toHaveBeenCalledTimes(1);
  });

  it('cancelling a run (the development-only control) aborts it and keeps the images; a late answer is ignored', async () => {
    const { generate } = await open();
    let finish!: (result: PresentationResult) => void;
    generate.mockImplementation(() => new Promise<PresentationResult>((resolve) => (finish = resolve)));
    pick(png('a.png'));
    fireEvent.click(generateButton());
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel run (development only)' }));
    const signal = generate.mock.calls[0]![1]!.signal!;
    expect(signal.aborted).toBe(true); // the request and its polling end with this signal
    expect(selected()).toEqual(['a.png']);
    await act(async () => finish(READY));
    expect(screen.queryByRole('region', { name: 'Presentation ready' })).toBeNull(); // a stale run cannot settle the page

    generate.mockResolvedValue(READY);
    fireEvent.click(generateButton()); // and a new run can be started
    await screen.findByRole('region', { name: 'Presentation ready' });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('leaving the page aborts the run in progress', async () => {
    const { generate, router } = await open();
    generate.mockImplementation(() => new Promise<PresentationResult>(() => undefined));
    pick(png('a.png'));
    fireEvent.click(generateButton());
    await screen.findByRole('region', { name: 'Progress' });
    const signal = generate.mock.calls[0]![1]!.signal!;
    await act(async () => void router.navigate('/projects'));
    await waitFor(() => expect(signal.aborted).toBe(true));
  });

  it('the sample backend answers through the same flow', async () => {
    renderApp('/image-to-ppt');
    await screen.findByRole('heading', { level: 1, name: 'Image to PPT' }, find);
    pick(png('a.png'), jpg('bb.jpg'));
    fireEvent.click(generateButton());
    const ready = await screen.findByRole('region', { name: 'Presentation ready' }, find);
    expect((within(ready).getByRole('link', { name: 'Download presentation' }) as HTMLAnchorElement).href).toMatch(/\/studio\/download\/img2pptx__mock$/);
  });
});

describe('Image to PPT against the real adapter', () => {
  it('without a generation service configured the page says so, offers no Generate, and makes no generation request', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      calls.push(`${init.method ?? 'GET'} ${url}`);
      return Response.json([]);
    });
    renderApp('/image-to-ppt', { api: createHttpAdapter(), auth: { accessToken: 'test-token-not-real' } }); // the test build has no VITE_PRESENTATION_ENDPOINT
    await screen.findByRole('heading', { level: 1, name: 'Image to PPT' }, find);
    expect(alerts()).toEqual(['Image to PPT is not set up on this deployment yet, so a presentation cannot be generated.']);
    pick(png('a.png'));
    expect(selected()).toEqual(['a.png']); // images can still be chosen and are still validated
    expect(generateButton().disabled).toBe(true);
    fireEvent.click(generateButton());
    expect(screen.queryByRole('region', { name: 'Progress' })).toBeNull();
    expect(calls.some((c) => /generate|pptx|studio/.test(c))).toBe(false);
  });
});
