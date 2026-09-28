import type { Artifact } from '@/types/api';
import type { MessageView } from '@/types/chat';

/** A line that is only a Markdown link, e.g. `[Download PDF](https://…)`, optionally bold / bulleted / with an icon. */
const LINK_LINE = /^\s*(?:[-*+]\s+)?(?:\p{Extended_Pictographic}️?\s*)?[*_]{0,2}\[([^\]]+)\]\(\s*<?([^)\s>]+)>?\s*\)[*_]{0,2}\s*$/u;
/** A thematic break (`---`, `***`, `___`), the separator the report service puts before its link. */
const RULE_LINE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;

function safeUrl(href: string): string | null {
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function isDocumentLink(text: string, url: string, known: Set<string>): boolean {
  return known.has(url) || /download/i.test(text) || /\.(pdf|pptx?|xlsx?)(?:[?#]|$)/i.test(new URL(url).pathname);
}

function linkedArtifact(message: MessageView, url: string, text: string, index: number): Artifact {
  const path = new URL(url).pathname;
  const type: Artifact['type'] = /\.pptx?$/i.test(path) || /\b(deck|pptx?|slides?)\b/i.test(text) ? 'pptx' : /\.xlsx?$/i.test(path) ? 'xlsx' : 'report';
  const at = message.created_at || new Date(0).toISOString();
  return {
    id: `${message.id}:link:${index}`,
    conversation_id: message.conversation_id,
    message_id: message.id,
    type,
    filename: type === 'pptx' ? 'Presentation.pptx' : type === 'xlsx' ? 'Workbook.xlsx' : 'Strategy report.pdf',
    status: 'ready',
    progress: null,
    download: { url, expires_at: null },
    error: null,
    created_at: at,
    updated_at: at,
  };
}

/**
 * One download UI per file. Generated-document links at the END of an answer (the report service appends
 * `---` + `[Download PDF](url)` to its Markdown) come out of the text and become document cards: merged
 * with the message's own artifact for the same URL, or added as one when the message has none. Links
 * inside the prose, and anything that isn't an http(s) URL, stay in the Markdown untouched.
 */
export function separateDocumentLinks(message: MessageView): { content: string; artifacts: Artifact[] } {
  const artifacts = message.artifacts ?? [];
  const known = new Set(artifacts.flatMap((a) => (a.download ? [safeUrl(a.download.url) ?? a.download.url] : [])));
  const lines = message.content.split('\n');
  const found: { url: string; text: string }[] = [];

  let end = lines.length;
  for (;;) {
    while (end > 0 && !lines[end - 1]!.trim()) end--;
    const match = end > 0 ? LINK_LINE.exec(lines[end - 1]!) : null;
    const url = match && safeUrl(match[2]!);
    if (!match || !url || !isDocumentLink(match[1]!, url, known)) break;
    found.unshift({ url, text: match[1]! });
    end--;
  }
  if (found.length === 0) return { content: message.content, artifacts };

  // The separator the link sat under would now dangle at the end of the answer.
  while (end > 0 && (!lines[end - 1]!.trim() || RULE_LINE.test(lines[end - 1]!))) end--;

  const extra = found
    .filter(({ url }) => !known.has(url))
    .filter(({ url }, i, all) => all.findIndex((f) => f.url === url) === i)
    .map(({ url, text }, i) => linkedArtifact(message, url, text, i));
  return { content: lines.slice(0, end).join('\n'), artifacts: [...artifacts, ...extra] };
}
