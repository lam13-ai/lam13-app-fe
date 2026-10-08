import { CircleCheck, Download, FolderInput, FolderPlus, MoreHorizontal, Pencil, Search, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { toErrorInfo, useApi } from '@/api';
import { Button, IconButton, Menu, MenuItem, Popover, Spinner, VisuallyHidden, iconProps, smallIconProps, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatRelativeTime } from '@/lib/format';
import type { ArchiveFile, ArchiveFileKind, Project } from '@/types/api';
import { useProjectAction } from '../hooks/useProjects';
import { FileTypeIcon } from './FileTypeIcon';
import { ConfirmPanel, NameForm } from './ProjectForms';

type Filter = 'all' | ArchiveFileKind;

const KINDS: Record<ArchiveFileKind, { label: string; unit: string }> = {
  presentation: { label: 'Presentations', unit: 'slide' },
  document: { label: 'Documents', unit: 'page' },
  image: { label: 'Images', unit: '' },
};
const FILTERS: Filter[] = ['all', 'presentation', 'document', 'image'];

/** What the backend's Archives accept (it checks again, by extension and by content). */
export const ACCEPT = '.pdf,.docx,.pptx,.png,.jpg,.jpeg,.gif,.webp';

const PILL = 'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors duration-150 ease-standard';
// As before — a solid pill for the current filter, outlined ones for the rest — in the page's softer ink.
const pill = (on: boolean) => cn(PILL, on ? 'border-fg bg-fg font-bold text-bg' : 'border-border text-fg-muted hover:border-fg/40 hover:text-fg');

export function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(mb >= 10 ? 0 : 1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** A file's "…" menu: download it, file it in a folder, or delete it (confirmed). A refusal by the backend is shown. */
function FileActions({ project, file }: { project: Project; file: ArchiveFile }) {
  const [view, setView] = useState<'menu' | 'move' | 'delete'>('menu');
  const api = useApi();
  const toast = useToast();
  const action = useProjectAction(project.id);
  const download = () =>
    api.projects.fileDownloadUrl(project.id, file.id).then(
      (url) => {
        // The link is short-lived and made for this request: open it at once (it downloads the file).
        const link = Object.assign(document.createElement('a'), { href: url, target: '_blank', rel: 'noopener', download: file.name });
        link.click();
      },
      (error: unknown) => toast.show(toErrorInfo(error).message),
    );
  const move = (folderId: string | null) =>
    action.mutate((projects) => projects.moveFile(project.id, file.id, folderId), { onError: (error) => toast.show(toErrorInfo(error).message) });
  return (
    <Popover
      placement="bottom-end"
      kind="dialog"
      className={view === 'delete' ? 'w-[min(20rem,calc(100vw-1.5rem))]' : 'w-56'}
      onOpenChange={(open) => {
        if (!open) setView('menu');
      }}
      trigger={(props) => <IconButton {...props} label={`Actions for ${file.name}`} size="sm" icon={<MoreHorizontal {...iconProps} />} />}
    >
      {view === 'menu' ? (
        <Menu label={`Actions for ${file.name}`}>
          <MenuItem onSelect={() => void download()} leading={<Download {...smallIconProps} />}>
            Download
          </MenuItem>
          {project.folders.length > 0 && (
            <MenuItem onSelect={() => setView('move')} leading={<FolderInput {...smallIconProps} />} keepOpen>
              Move to folder
            </MenuItem>
          )}
          <MenuItem onSelect={() => setView('delete')} leading={<Trash2 {...smallIconProps} />} tone="danger" keepOpen>
            Delete
          </MenuItem>
        </Menu>
      ) : view === 'move' ? (
        <Menu label="Move to folder">
          {project.folders.map((folder) => (
            <MenuItem key={folder.id} checked={file.folder_id === folder.id} onSelect={() => move(folder.id)}>
              {folder.name}
            </MenuItem>
          ))}
          <MenuItem checked={!file.folder_id} onSelect={() => move(null)}>
            No folder
          </MenuItem>
        </Menu>
      ) : (
        <ConfirmPanel title="Delete this file?" confirmLabel="Delete" onConfirm={() => action.mutateAsync((projects) => projects.deleteFile(project.id, file.id))}>
          <span className="font-bold text-fg">{file.name}</span> will be removed from the project for everyone.
        </ConfirmPanel>
      )}
    </Popover>
  );
}

function FileStatus({ status }: { status: ArchiveFile['status'] }) {
  if (status === 'ready') {
    return (
      <span className="flex shrink-0 items-center gap-1 text-fg">
        <CircleCheck size={14} strokeWidth={1.8} aria-hidden className="text-accent" /> Readable by Lam
      </span>
    );
  }
  if (status === 'processing') {
    return (
      <span className="flex shrink-0 items-center gap-1.5">
        <Spinner size={12} state="active" /> Processing…
      </span>
    );
  }
  // Kept for the team and downloadable; Lam does not read it.
  return (
    <span className="shrink-0" title={status === 'failed' ? 'Lam could not read this file. It is still stored.' : 'Stored for the team. Lam reads PDFs and images.'}>
      {status === 'failed' ? "Couldn't be read" : 'Stored'}
    </span>
  );
}

function FileCard({ project, file }: { project: Project; file: ArchiveFile }) {
  const kind = KINDS[file.kind];
  const folder = project.folders.find((f) => f.id === file.folder_id);
  return (
    <article className="flex h-full flex-col gap-3 rounded-card border border-border bg-bg p-4 transition-[border-color] duration-150 ease-standard hover:border-fg/30">
      <div className="flex items-start gap-3">
        {/* The format's own mark (PowerPoint, Word, PDF, image); the extension is spelled out in the line below. */}
        <FileTypeIcon extension={file.extension} />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 break-words text-xs font-bold leading-snug text-fg" title={file.name}>
            {file.name}
          </h3>
          <p className="mt-1 text-2xs text-fg-muted">
            {[file.extension, formatFileSize(file.size_bytes), file.pages && `${file.pages} ${kind.unit}s`, folder?.name].filter(Boolean).join(' · ')}
          </p>
        </div>
        <FileActions project={project} file={file} />
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-hairline pt-2.5 text-2xs text-fg-muted">
        <span className="min-w-0 truncate">
          {file.uploaded_by} · {formatRelativeTime(file.uploaded_at)}
        </span>
        <FileStatus status={file.status} />
      </div>
    </article>
  );
}

/** A project's file library: presentations, documents and images the team uploaded, in optional folders. */
export function Archives({ project, compact = false }: { project: Project; /** One column (inside a side panel). */ compact?: boolean }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const action = useProjectAction(project.id);
  const { files, folders } = project;
  // A folder that was deleted (here or by someone else) is no longer a filter.
  const folder = folders.find((f) => f.id === folderId) ?? null;
  const isOwner = project.role !== 'member';

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    // One at a time: each upload answers with the project as it is then, and a refused file says why.
    for (const [index, file] of picked.entries()) {
      setUploading(picked.length - index);
      try {
        await action.mutateAsync((projects) => projects.uploadFile(project.id, file, folder?.id ?? null));
      } catch (error) {
        toast.show(`${file.name}: ${toErrorInfo(error).message}`);
      }
    }
    setUploading(0);
  };

  const inFolder = useMemo(() => (folder ? files.filter((f) => f.folder_id === folder.id) : files), [files, folder]);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: inFolder.length, presentation: 0, document: 0, image: 0 };
    for (const f of inFolder) c[f.kind] += 1;
    return c;
  }, [inFolder]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inFolder
      .filter((f) => (filter === 'all' || f.kind === filter) && (!q || f.name.toLowerCase().includes(q)))
      .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
  }, [inFolder, filter, query]);

  const uploadButton = (
    <>
      <input ref={inputRef} type="file" multiple accept={ACCEPT} onChange={(e) => void onPick(e)} className="sr-only" tabIndex={-1} aria-label="Choose files to add" />
      <Button
        variant="outline"
        size="sm"
        disabled={uploading > 0}
        leadingIcon={uploading > 0 ? <Spinner size={14} state="active" /> : <Upload {...smallIconProps} />}
        onClick={() => inputRef.current?.click()}
      >
        {uploading > 0 ? 'Uploading…' : 'Upload'}
      </Button>
    </>
  );
  const note = (
    <p className="text-2xs leading-relaxed text-fg-muted">
      PDF, Word, PowerPoint and images, up to 50 MB each. Lam reads PDFs and images; Word and PowerPoint files are stored for the team.
    </p>
  );
  const newFolder = (
    <Popover
      placement="bottom-start"
      kind="dialog"
      className="w-[min(20rem,calc(100vw-1.5rem))]"
      trigger={(props) => (
        <button {...props} type="button" className={cn(PILL, 'border-dashed border-border text-fg-muted hover:border-fg/40 hover:text-fg')}>
          <FolderPlus size={14} strokeWidth={1.8} aria-hidden /> New folder
        </button>
      )}
    >
      <NameForm
        title="New folder"
        label="Folder name"
        placeholder="e.g. Board papers"
        submitLabel="Create folder"
        onSubmit={(name) => action.mutateAsync((projects) => projects.createFolder(project.id, name))}
      />
    </Popover>
  );

  if (files.length === 0 && folders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-card border border-dashed border-hairline-strong px-6 py-16 text-center">
        <p className="eyebrow">Archives</p>
        <h2 className="text-base font-bold">No files yet.</h2>
        <p className="max-w-[46ch] text-sm leading-relaxed text-fg-muted">
          Presentations, documents and images you upload are kept here for the project&apos;s team, so Lam can read them in this project&apos;s chats.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {uploadButton}
          {newFolder}
        </div>
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

      <div role="group" aria-label="Folder" className="flex flex-wrap items-center gap-1.5">
        <button type="button" aria-pressed={!folder} onClick={() => setFolderId(null)} className={pill(!folder)}>
          All folders
        </button>
        {folders.map((f) => (
          <button key={f.id} type="button" aria-pressed={folder?.id === f.id} onClick={() => setFolderId(f.id)} className={pill(folder?.id === f.id)}>
            {f.name}
            <span className="tabular-nums opacity-80">{files.filter((file) => file.folder_id === f.id).length}</span>
          </button>
        ))}
        {newFolder}
        {folder && (
          <span className="ml-auto flex items-center gap-1">
            <Popover
              placement="bottom-end"
              kind="dialog"
              className="w-[min(20rem,calc(100vw-1.5rem))]"
              trigger={(props) => <IconButton {...props} label={`Rename folder ${folder.name}`} size="sm" icon={<Pencil {...iconProps} />} />}
            >
              <NameForm
                key={folder.id}
                title="Rename folder"
                label="Folder name"
                initial={folder.name}
                submitLabel="Save"
                onSubmit={(name) => action.mutateAsync((projects) => projects.renameFolder(project.id, folder.id, name))}
              />
            </Popover>
            {/* Deleting a folder re-files everyone's documents: the owner's to do. */}
            {isOwner && (
              <Popover
                placement="bottom-end"
                kind="dialog"
                className="w-[min(20rem,calc(100vw-1.5rem))]"
                trigger={(props) => <IconButton {...props} label={`Delete folder ${folder.name}`} size="sm" icon={<Trash2 {...iconProps} />} />}
              >
                <ConfirmPanel
                  title={`Delete the folder ${folder.name}?`}
                  confirmLabel="Delete folder"
                  onConfirm={() => action.mutateAsync((projects) => projects.deleteFolder(project.id, folder.id))}
                >
                  Its files are kept in the project, outside any folder.
                </ConfirmPanel>
              </Popover>
            )}
          </span>
        )}
      </div>

      <div role="group" aria-label="File type" className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={pill(filter === f)}>
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
          <p className="text-sm">{inFolder.length === 0 && folder ? 'This folder is empty.' : 'No files match.'}</p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setFilter('all');
              setFolderId(null);
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
              <FileCard project={project} file={f} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
