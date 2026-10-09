import { describe, expect, it } from 'vitest';
import { imagesFromPaste, type PasteEventLike } from './clipboard';
import { displayFileName, formatElapsed, formatWhen, statusesAt, STATUS_STEPS } from './generation';
import { ACCEPT_ATTR, ACCEPTED_EXTENSIONS, ACCEPTED_MIME, FORMAT_LABEL, MAX_IMAGES, validateSelection, type FileLike } from './upload';

/** The upload rules, the paste path and the status timeline (the Kothar frontend's tests, with the limit at five). */

const f = (name: string, type = 'image/png', size = 1, lastModified = 1): FileLike => ({ name, type, size, lastModified });

describe('validateSelection', () => {
  it('keeps valid files and reports the invalid one', () => {
    const r = validateSelection([], [f('a.png'), f('b.jpg', 'image/jpeg'), f('notes.pdf', 'application/pdf')]);
    expect(r.accepted).toHaveLength(2);
    expect(r.notices[0]!.text).toMatch(/Unsupported file type/);
    expect(r.notices[0]!.text).toMatch(/notes\.pdf/);
  });

  it('the limit is five images: one to five are accepted, a sixth is rejected', () => {
    expect(MAX_IMAGES).toBe(5);
    for (let n = 1; n <= 5; n++) {
      const r = validateSelection(
        [],
        Array.from({ length: n }, (_, i) => f(`${i}.png`)),
      );
      expect(r.accepted).toHaveLength(n);
      expect(r.notices).toEqual([]);
    }
    const five = Array.from({ length: 5 }, (_, i) => f(`${i}.png`));
    for (const extra of [[f('6.png')], [f('6.png'), f('7.jpg', 'image/jpeg')]]) {
      const r = validateSelection(five, extra);
      expect(r.accepted).toEqual([]);
      expect(r.notices.map((n) => n.text)).toEqual(['You can upload up to 5 images at a time.']);
    }
    // a single batch of seven keeps the first five only
    const batch = validateSelection(
      [],
      ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((n) => f(`${n}.png`)),
    );
    expect(batch.accepted.map((a) => a.name)).toEqual(['a.png', 'b.png', 'c.png', 'd.png', 'e.png']);
    expect(batch.notices.at(-1)!.text).toBe('You can upload up to 5 images at a time.');
  });

  it('fills up to the limit without wiping the existing selection; removing one makes room again', () => {
    const existing = [f('1.png'), f('2.png'), f('3.png')];
    const r = validateSelection(existing, [f('4.png'), f('5.png'), f('6.png')]);
    expect(r.accepted.map((a) => a.name)).toEqual(['4.png', '5.png']);
    const afterRemove = [...existing, ...r.accepted].slice(1);
    const readd = validateSelection(afterRemove, [f('6.png')]);
    expect(afterRemove.length + readd.accepted.length).toBe(5);
    expect(readd.notices).toEqual([]);
  });

  it('ignores duplicates by name, size and lastModified', () => {
    const r = validateSelection([f('a.png')], [f('a.png'), f('a.png', 'image/png', 2)]);
    expect(r.accepted).toHaveLength(1);
    expect(r.notices[0]!.text).toMatch(/already selected/);
  });

  it('only JPEG and PNG are accepted — by type, or by extension when the browser reports no type', () => {
    expect(ACCEPTED_MIME).toEqual(['image/jpeg', 'image/png']);
    expect(ACCEPTED_EXTENSIONS).toEqual(['.jpg', '.jpeg', '.png']);
    for (const ok of [f('a.png'), f('a.jpg', 'image/jpeg'), f('a.jpeg', 'image/jpeg'), f('x.jpg', ''), f('X.JPEG', ''), f('x.png', '')]) {
      expect(validateSelection([], [ok]).accepted).toHaveLength(1);
    }
    const rejected = [
      f('a.gif', 'image/gif'),
      f('a.webp', 'image/webp'),
      f('a.svg', 'image/svg+xml'),
      f('a.bmp', 'image/bmp'),
      f('a.heic', 'image/heic'),
      f('a.pdf', 'application/pdf'),
      f('a.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
      f('a.txt', ''),
      f('renamed.png', 'image/gif'), // the reported type wins over a misleading extension
    ];
    for (const bad of rejected) {
      const r = validateSelection([], [bad]);
      expect(r.accepted, bad.name).toEqual([]);
      expect(r.notices[0]!.text).toMatch(/Unsupported file type\. Please upload JPG, JPEG, or PNG images only\./);
    }
  });

  it('the accept attribute and the visible label advertise only JPEG and PNG', () => {
    expect(ACCEPT_ATTR).toBe('image/jpeg,image/png,.jpg,.jpeg,.png');
    expect(FORMAT_LABEL).toBe('JPG, JPEG or PNG');
  });

  it('a mixed selection keeps the supported files and only those', () => {
    const r = validateSelection([], [f('a.png'), f('b.gif', 'image/gif'), f('c.jpg', 'image/jpeg'), f('d.webp', 'image/webp')]);
    expect(r.accepted.map((a) => a.name)).toEqual(['a.png', 'c.jpg']);
  });
});

describe('imagesFromPaste', () => {
  const blob = (type: string, bytes = [1, 2, 3]) => new File([new Uint8Array(bytes)], 'image', { type });
  const paste = (...items: Array<{ kind: string; type: string; file?: File }>): PasteEventLike => ({
    clipboardData: { items: items.map((i) => ({ kind: i.kind, type: i.type, getAsFile: () => i.file ?? null })), files: [] },
  });
  const image = (type: string, bytes?: number[]) => ({ kind: 'file', type, file: blob(type, bytes) });
  const text = { kind: 'string', type: 'text/plain' };
  const counter = () => {
    let n = 0;
    return () => ++n;
  };

  it('a pasted PNG or JPEG becomes a named File; image/jpg is still JPEG; successive pastes are numbered', () => {
    const next = counter();
    const [png] = imagesFromPaste(paste(image('image/png')), next);
    expect([png!.name, png!.type]).toEqual(['pasted-image.png', 'image/png']);
    const [jpg] = imagesFromPaste(paste(image('image/jpg')), next);
    expect([jpg!.name, jpg!.type]).toEqual(['pasted-image-2.jpg', 'image/jpeg']);
  });

  it('clipboard text does not produce an upload, and the same paste is handled only once', () => {
    expect(imagesFromPaste(paste(text), counter())).toEqual([]);
    const event = paste(image('image/png'));
    const next = counter();
    expect(imagesFromPaste(event, next)).toHaveLength(1);
    expect(imagesFromPaste(event, next)).toEqual([]);
  });

  it('unsupported pasted images are handed to validation and rejected there, naming what was pasted', () => {
    for (const type of ['image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/heic']) {
      const files = imagesFromPaste(paste(text, image(type)), counter());
      expect(files).toHaveLength(1);
      const { accepted, notices } = validateSelection([], files);
      expect(accepted).toEqual([]);
      expect(notices[0]!.text).toMatch(/Unsupported file type/);
    }
    expect(imagesFromPaste(paste(image('image/gif')), counter())[0]!.name).toBe('pasted-image.gif');
  });

  it('the five-image limit still applies to pasted images', () => {
    const existing = Array.from({ length: MAX_IMAGES }, (_, i) => new File([new Uint8Array([i])], `img-${i}.png`, { type: 'image/png', lastModified: i }));
    const pasted = imagesFromPaste(paste(image('image/png', [9, 9, 9])), counter());
    const { accepted, notices } = validateSelection(existing, pasted);
    expect(accepted).toEqual([]);
    expect(notices.at(-1)!.text).toMatch(/up to 5 images/);
  });

  it('files exposed only through clipboardData.files are picked up', () => {
    const event: PasteEventLike = { clipboardData: { items: [], files: [blob('image/png')] } };
    expect(imagesFromPaste(event, counter())[0]!.name).toBe('pasted-image.png');
  });
});

describe('status timeline and display helpers', () => {
  it('statuses reveal progressively, accumulate, and never regress', () => {
    expect(statusesAt(0)).toEqual([STATUS_STEPS[0]!.text]);
    let last = 0;
    for (let t = 0; t <= 300_000; t += 1_000) {
      const shown = statusesAt(t).length;
      expect(shown).toBeGreaterThanOrEqual(last);
      last = shown;
    }
    expect(statusesAt(10 * 60_000)).toHaveLength(STATUS_STEPS.length);
    expect(statusesAt(13_000).at(-1)).toBe(STATUS_STEPS[1]!.text);
  });

  it('elapsed is formatted as mm:ss, and decks are named and dated for display', () => {
    expect([formatElapsed(0), formatElapsed(59_999), formatElapsed(61_000), formatElapsed(-5)]).toEqual(['00:00', '00:59', '01:01', '00:00']);
    expect(displayFileName('From-backend.pptx')).toBe('From-backend.pptx');
    expect(displayFileName(undefined, new Date(2026, 8, 3, 16, 5))).toBe('Strategic-Presentation-2026-09-03-1605.pptx');
    const now = new Date(2026, 8, 3, 18, 0);
    expect(formatWhen(new Date(2026, 8, 3, 16, 20).getTime(), now)).toBe('Today, 16:20');
    expect(formatWhen(new Date(2026, 8, 2, 16, 20).getTime(), now)).toBe('Yesterday, 16:20');
    expect(formatWhen(new Date(2026, 7, 1, 9, 5).getTime(), now)).toBe('1 Aug 2026, 09:05');
  });
});
