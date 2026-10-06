import { CircleCheck, FileText, Image as ImageIcon, Presentation, Search, Upload } from 'lucide-react';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Button, Spinner, VisuallyHidden, smallIconProps } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatRelativeTime } from '@/lib/format';
import type { ArchiveFile, ArchiveFileKind } from '@/types/api';

type Filter = 'all' | ArchiveFileKind;

const KINDS: Record<ArchiveFileKind, { label: string; Icon: typeof FileText; tone: string; unit: string }> = {
  presentation: { label: 'Presentations', Icon: Presentation, tone: 'bg-fg text-bg', unit: 'slide' },
  document: { label: 'Documents', Icon: FileText, tone: 'bg-accent-wash text-accent', unit: 'page' },
  image: { label: 'Images', Icon: ImageIcon, tone: 'bg-muted text-fg', unit: '' },
};
const FILTERS: Filter[] = ['all', 'presentation', 'document', 'image'];

const ACCEPT = '.ppt,.pptx,.key,.pdf,.doc,.docx,.txt,.md,image/*';
const PRESENTATION = /\.(pptx?|key)$/i;

/** A file picked in this browser, listed locally (nothing is uploaded). */
function toLocalFile(file: File, index: number): ArchiveFile {
  return {
    id: `local-${Date.now()}-${index}`,
    name: file.name,
    kind: file.type.startsWith('image/') ? 'image' : PRESENTATION.test(file.name) ? 'presentation' : 'document',
    extension: (file.name.includes('.') ? file.name.split('.').pop()! : 'file').toUpperCase(),
    size_bytes: file.size,
    uploaded_at: new Date().toISOString(),
    uploaded_by: 'You',
    status: 'local',
  };
}

export function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(mb >= 10 ? 0 : 1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function FileCard({ file }: { file: ArchiveFile }) {
  const kind = KINDS[file.kind];
  return (
    <article className="flex h-full flex-col gap-3 rounded-card border border-border bg-bg p-3.5 transition-[border-color] duration-150 ease-standard hover:border-fg/30">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={cn('flex size-10 shrink-0 items-center justify-center rounded-card', kind.tone)}>
          <kind.Icon size={20} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 break-words text-xs font-bold leading-snug" title={file.name}>
            {file.name}
          </h3>
          <p className="mt-1 text-2xs text-fg-muted">
            {[file.extension, formatFileSize(file.size_bytes), file.pages && `${file.pages} ${kind.unit}s`].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-hairline pt-2.5 text-2xs text-fg-muted">
        <span className="min-w-0 truncate">
          {file.uploaded_by} · {formatRelativeTime(file.uploaded_at)}
        </span>
        {file.status === 'ready' ? (
          <span className="flex shrink-0 items-center gap-1 font-bold text-fg">
            <CircleCheck size={14} strokeWidth={1.8} aria-hidden className="text-accent" /> Readable by Lam
          </span>
        ) : file.status === 'local' ? (
          <span className="shrink-0 rounded-full border border-hairline-strong px-2 font-bold">Not uploaded</span>
        ) : (
          <span className="flex shrink-0 items-center gap-1.5 font-bold">
            <Spinner size={12} state="active" /> Processing…
          </span>
        )}
      </div>
    </article>
  );
}

/** A project's file library: presentations, documents and images uploaded earlier that Lam can read. */
export function Archives({ files: saved, compact = false }: { files: ArchiveFile[]; /** One column (inside a side panel). */ compact?: boolean }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  // TODO(backend): uploads need a project-files endpoint. Until then picked files are only listed here, for this visit.
  const [added, setAdded] = useState<ArchiveFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const files = useMemo(() => [...added, ...saved], [added, saved]);
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []).map(toLocalFile);
    if (picked.length) setAdded((list) => [...picked, ...list]);
    e.target.value = '';
  };
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: files.length, presentation: 0, document: 0, image: 0 };
    for (const f of files) c[f.kind] += 1;
    return c;
  }, [files]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files
      .filter((f) => (filter === 'all' || f.kind === filter) && (!q || f.name.toLowerCase().includes(q)))
      .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
  }, [files, filter, query]);
  const uploadButton = (
    <>
      <input ref={inputRef} type="file" multiple accept={ACCEPT} onChange={onPick} className="sr-only" tabIndex={-1} aria-label="Choose files to add" />
      <Button variant="outline" size="sm" leadingIcon={<Upload {...smallIconProps} />} onClick={() => inputRef.current?.click()}>
        Upload
      </Button>
    </>
  );
  const note = (
    <p className="text-2xs leading-relaxed text-fg-muted">
      Sample library. Files you add are listed in this browser only: they are not uploaded or read by Lam yet.
    </p>
  );

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-card border border-dashed border-hairline-strong px-6 py-16 text-center">
        <p className="eyebrow">Archives</p>
        <h2 className="text-base font-bold">No files yet.</h2>
        <p className="max-w-[46ch] text-sm leading-relaxed text-fg-muted">
          Presentations, documents and images you upload are kept here, so Lam can read them in every chat in this project.
        </p>
        {uploadButton}
        {note}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex min-w-[12rem] flex-1 items-center">
          <VisuallyHidden>Search files</VisuallyHidden>
          <Search {...smallIconProps} className="pointer-events-none absolute left-3 text-fg-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files"
            className="h-11 w-full border border-border bg-bg pl-9 pr-3 text-base text-fg outline-none transition-colors duration-150 ease-standard placeholder:text-fg-muted focus:border-composer-focus focus:ring-1 focus:ring-composer-ring focus-visible:outline-none sm:text-sm md:h-9"
          />
        </label>
        {uploadButton}
      </div>
      <div role="group" aria-label="File type" className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors duration-150 ease-standard',
              filter === f ? 'border-fg bg-fg text-bg' : 'border-border text-fg-muted hover:border-fg/40 hover:text-fg',
            )}
          >
            {f === 'all' ? 'All files' : KINDS[f].label}
            <span className={cn('tabular-nums', filter === f ? 'opacity-70' : 'opacity-80')}>{counts[f]}</span>
          </button>
        ))}
      </div>
      {note}
      <p aria-live="polite" className="sr-only">
        {shown.length} of {files.length} files
      </p>
      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <p className="text-sm">No files match.</p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setFilter('all');
            }}
            className="min-h-11 text-xs font-bold underline-offset-4 hover:underline md:min-h-0"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <ul aria-label="Files" className={cn('grid gap-3', !compact && 'sm:grid-cols-2 lg:grid-cols-3')}>
          {shown.map((f) => (
            <li key={f.id}>
              <FileCard file={f} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
