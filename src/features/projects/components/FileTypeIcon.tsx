import { FileText, Image as ImageIcon } from 'lucide-react';
import pdfSvg from '@/assets/filetypes/pdf.svg?raw';
import powerpointSvg from '@/assets/filetypes/powerpoint.svg?raw';
import wordSvg from '@/assets/filetypes/word.svg?raw';
import { cn } from '@/lib/cn';

export type FileIconType = 'powerpoint' | 'word' | 'pdf' | 'image' | 'file';

/** The familiar mark of each format (src/assets/filetypes), drawn in the format's own colour. */
const pathOf = (svg: string) => / d="([^"]+)"/.exec(svg)?.[1] ?? '';
const MARKS: Partial<Record<FileIconType, string>> = { powerpoint: pathOf(powerpointSvg), word: pathOf(wordSvg), pdf: pathOf(pdfSvg) };

/**
 * A small tinted tile per type: PowerPoint its orange, Word its blue, PDF the Lam13 accent it has always had
 * here, images the neutral surface. Colours are theme tokens (softer in light, lifted in dark).
 */
const TONES: Record<FileIconType, string> = {
  powerpoint: 'bg-file-ppt/12 text-file-ppt',
  word: 'bg-file-word/12 text-file-word',
  pdf: 'bg-accent-wash text-accent',
  image: 'bg-muted text-fg-muted',
  file: 'bg-muted text-fg-muted',
};

const BY_EXTENSION: Record<string, FileIconType> = {
  PPTX: 'powerpoint',
  PPT: 'powerpoint',
  KEY: 'powerpoint',
  DOCX: 'word',
  DOC: 'word',
  PDF: 'pdf',
  PNG: 'image',
  JPG: 'image',
  JPEG: 'image',
  GIF: 'image',
  WEBP: 'image',
};

export const fileIconType = (extension: string): FileIconType => BY_EXTENSION[extension.toUpperCase()] ?? 'file';

/** The file-type mark shown in an Archives card: recognisable at a glance, the same small size for every type. */
export function FileTypeIcon({ extension }: { extension: string }) {
  const type = fileIconType(extension);
  const mark = MARKS[type];
  return (
    <span aria-hidden="true" data-file-icon={type} className={cn('flex size-8 shrink-0 items-center justify-center rounded-card', TONES[type])}>
      {mark ? (
        <svg viewBox="0 0 24 24" width={17} height={17} fill="currentColor">
          <path d={mark} />
        </svg>
      ) : type === 'image' ? (
        <ImageIcon size={17} strokeWidth={1.7} />
      ) : (
        <FileText size={17} strokeWidth={1.7} />
      )}
    </span>
  );
}
