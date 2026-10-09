import { Paperclip, Plus, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useApi } from '@/api';
import { PageFrame } from '@/components/PageFrame';
import { Button, smallIconProps } from '@/components/ui';
import { cn } from '@/lib/cn';
import { imagesFromPaste } from '../lib/clipboard';
import { displayFileName, GENERIC_ERROR, type GenerationState } from '../lib/generation';
import { ACCEPT_ATTR, FORMAT_LABEL, MAX_IMAGES, validateSelection, type Notice } from '../lib/upload';
import { ProcessingFlow } from './ProcessingFlow';

export type SelectedImage = { id: string; file: File; url: string };

/** The selected images as thumbnails; `onRemove` is omitted once they are submitted (the set is then read-only). */
export function ImagePreviewGrid({ images, onRemove, className }: { images: SelectedImage[]; onRemove?: (id: string) => void; className?: string }) {
  return (
    <ul aria-label="Selected images" className={cn('grid grid-cols-3 gap-2 sm:grid-cols-5', className)}>
      {images.map((image) => (
        <li key={image.id} className="overflow-hidden rounded-card border border-border bg-bg">
          <div className="relative aspect-[4/3] bg-bg-subtle">
            {/* an unreadable file shouldn't show a broken-image glyph */}
            <img src={image.url} alt="" className="size-full object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(image.id)}
                aria-label={`Remove image ${image.file.name}`}
                className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full border border-border bg-bg/90 text-fg-muted transition-colors hover:border-fg hover:text-fg"
              >
                <X size={14} strokeWidth={2.2} aria-hidden />
              </button>
            )}
          </div>
          <p className="truncate px-2 py-1.5 text-2xs text-fg-muted" title={image.file.name}>
            {image.file.name}
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * `/image-to-ppt`: pick up to five PNG / JPG images, generate one PowerPoint from them, download it.
 *
 * The flow is the Kothar frontend's `ImageUploader` (selection, validation before any request, one run at a
 * time, retry with the same images, start over, abort on unmount); only the surface is this app's. Every
 * file is checked here — format, duplicates, the five-image limit — before `api.presentations.generate` is
 * called, so a sixth image or an unsupported file never reaches the service.
 */
export function ImageToPptView() {
  const api = useApi();
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [generation, setGeneration] = useState<GenerationState>({ status: 'idle' });
  const [over, setOver] = useState(false);
  /** Set synchronously, so two clicks in one tick cannot both pass the guard. */
  const run = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();

  // Revoke every object URL still held when the page goes away.
  const live = useRef<SelectedImage[]>([]);
  useEffect(() => {
    live.current = images;
  });
  useEffect(() => () => live.current.forEach((i) => URL.revokeObjectURL(i.url)), []);

  // Abort an in-flight run when the page goes away (navigation, sign out).
  useEffect(() => () => run.current?.abort(), []);

  // A file dropped outside the zone would otherwise navigate the tab away.
  useEffect(() => {
    const block = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
    };
  }, []);

  const addFiles = (files: File[]) => {
    const { accepted, notices } = validateSelection(
      images.map((i) => i.file),
      files,
    );
    setNotices(notices);
    if (!accepted.length) return;
    // Object URLs are created here, not inside a state updater — updaters run twice under StrictMode and
    // would leak a URL per file.
    const additions = accepted.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }));
    setImages([...images, ...additions]);
  };

  // Pasted images (Ctrl/Cmd+V anywhere on the page) take the same path as picked or dropped files. One
  // listener, only while the composer is showing, so a paste can never alter the files of a run in progress.
  const addFilesRef = useRef(addFiles);
  useEffect(() => {
    addFilesRef.current = addFiles;
  });
  const pasteCount = useRef(0);
  useEffect(() => {
    if (generation.status !== 'idle') return;
    const onPaste = (event: ClipboardEvent) => {
      const files = imagesFromPaste(event, () => ++pasteCount.current);
      if (!files.length) return; // plain text: leave it to the browser
      event.preventDefault();
      addFilesRef.current(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [generation.status]);

  const remove = (id: string) => {
    const gone = images.find((i) => i.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    setNotices([]);
    setImages(images.filter((i) => i.id !== id));
  };

  const removeAll = () => {
    images.forEach((i) => URL.revokeObjectURL(i.url));
    setNotices([]);
    setImages([]);
  };

  /** Starts one run for the current selection. Used by Generate and Try again. */
  const start = () => {
    if (run.current || !images.length || images.length > MAX_IMAGES || !api.presentations.available) return;
    const controller = new AbortController();
    run.current = controller;
    const startedAt = Date.now();
    setGeneration({ status: 'processing', startedAt });

    const settle = (next: GenerationState) => {
      if (controller.signal.aborted) return; // cancelled, reset, or unmounted
      run.current = null;
      setGeneration(next);
    };

    api.presentations
      .generate(
        images.map((i) => i.file),
        { signal: controller.signal },
      )
      // the backend's name wins; otherwise the deck is labelled for display
      .then((result) => settle({ status: 'success', startedAt, result: { ...result, fileName: displayFileName(result.fileName) } }))
      // every failure category reaches the user as the same calm message
      .catch(() => settle({ status: 'error', startedAt, message: GENERIC_ERROR }));
  };

  const stop = () => {
    run.current?.abort();
    run.current = null;
    setGeneration({ status: 'idle' });
  };

  /** Abandons the whole selection: back to an empty upload state. */
  const startOver = () => {
    stop();
    images.forEach((i) => URL.revokeObjectURL(i.url));
    setImages([]);
    setNotices([]);
  };

  const count = images.length;
  const full = count >= MAX_IMAGES;
  const openPicker = () => input.current?.click();
  const take = (list: FileList | null) => {
    if (list && list.length) addFiles(Array.from(list));
  };

  if (generation.status !== 'idle') {
    return (
      <PageFrame title="Image to PPT" subtitle={`Turn up to ${MAX_IMAGES} images into a PowerPoint presentation.`}>
        <ProcessingFlow images={images} generation={generation} onRetry={start} onStartOver={startOver} onCancel={stop} />
      </PageFrame>
    );
  }

  return (
    <PageFrame title="Image to PPT" subtitle={`Turn up to ${MAX_IMAGES} images into a PowerPoint presentation.`}>
      <div className="flex flex-col gap-3">
        <div className="mb-3 text-center">
          <p className="eyebrow">Image to PPT</p>
          <h2 className="mt-2 text-base font-bold">Create your presentation</h2>
          <p className="mx-auto mt-2 max-w-[46ch] text-sm leading-relaxed text-fg-muted">
            Add up to {MAX_IMAGES} images ({FORMAT_LABEL}) and Lam turns them into one PowerPoint deck.
          </p>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            // still handed over at the limit, so the user gets a notice rather than a silently swallowed drop
            take(e.dataTransfer.files);
          }}
          className={cn('rounded-card border bg-bg transition-colors duration-150 ease-standard', over ? 'border-accent bg-accent-wash' : 'border-border')}
        >
          {count > 0 ? (
            <div className="p-3 sm:p-4">
              <ImagePreviewGrid images={images} onRemove={remove} />
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 sm:p-5">
              <button
                type="button"
                aria-label="Attach images"
                onClick={openPicker}
                className="grid size-10 shrink-0 place-items-center rounded-card border border-border bg-accent-wash text-accent transition-colors hover:border-accent/60"
              >
                <Plus size={16} strokeWidth={1.9} aria-hidden />
              </button>
              <div className="min-w-0">
                <p className="text-sm font-bold">Attach images to get started</p>
                <p className="mt-1 text-xs text-fg-muted">
                  {FORMAT_LABEL} · Up to {MAX_IMAGES} images
                </p>
                <p className="mt-0.5 text-2xs text-fg-muted">You can also drop images here, or copy and paste them.</p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-3 py-2.5 sm:px-4">
            <Button variant="outline" size="sm" disabled={full} leadingIcon={<Paperclip {...smallIconProps} />} onClick={openPicker}>
              {count > 0 ? 'Add images' : 'Attach images'}
            </Button>
            {count > 0 && (
              <>
                <span className="text-2xs tabular-nums text-fg-muted" aria-label={`${count} of ${MAX_IMAGES} images selected`}>
                  {count} / {MAX_IMAGES}
                </span>
                <Button variant="ghost" size="sm" onClick={removeAll}>
                  Remove all
                </Button>
              </>
            )}
            <Button variant="primary" size="sm" className="ml-auto" disabled={count === 0 || !api.presentations.available} onClick={start}>
              Generate presentation
            </Button>
          </div>

          <label htmlFor={inputId} className="sr-only">
            Choose images to upload
          </label>
          <input
            id={inputId}
            ref={input}
            type="file"
            accept={ACCEPT_ATTR}
            multiple
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              take(e.target.files);
              e.target.value = ''; // lets the same file be re-added after removal
            }}
          />
        </div>

        <div aria-live="polite" className="flex flex-col gap-2">
          {full && notices.length === 0 && <p className="text-xs text-fg-muted">You have added the maximum of {MAX_IMAGES} images. Remove one to add another.</p>}
          {notices.map((notice) => (
            <p key={notice.text} role="alert" className={cn('text-xs', notice.tone === 'danger' ? 'text-danger' : 'text-fg')}>
              {notice.text}
            </p>
          ))}
          {!api.presentations.available && (
            <p role="alert" className="text-xs text-danger">
              Image to PPT is not set up on this deployment yet, so a presentation cannot be generated.
            </p>
          )}
        </div>

        <p className="text-center text-2xs text-fg-muted">Generation takes about five minutes.</p>
      </div>
    </PageFrame>
  );
}
