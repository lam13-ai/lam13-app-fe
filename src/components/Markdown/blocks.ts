const FENCE = /^\s*(`{3,}|~{3,})/;
const LIST_ITEM = /^(?:[-*+]|\d{1,9}[.)])(?:\s|$)/;
const isBlank = (line: string) => line.trim() === '';
const isIndented = (line: string) => line.startsWith(' ') || line.startsWith('\t');

/**
 * Splits Markdown that is still streaming into top-level blocks, so finished blocks can be rendered once
 * and only the last, growing one re-parsed. The pieces always join back to `content` exactly.
 *
 * A cut is made only where later text cannot change what came before: after a blank line outside a code
 * fence, when the next line is complete (its type is known), not indented (a list / code continuation),
 * and not another item of the list or quote the block ends in (loose lists and quotes stay whole).
 * The final piece is the open tail. Cross-block syntax (reference links) is not resolved while streaming;
 * the finished answer is rendered as one document.
 */
export function splitMarkdownBlocks(content: string): string[] {
  const lines = content.split('\n');
  const blocks: string[] = [];
  let blockStart = 0; // index of the first line of the current block
  let fence: string | null = null; // the open fence's marker character, repeated to its length
  let lastText = ''; // the last non-blank line seen in the current block

  const cutBefore = (line: number) => {
    // Lines [blockStart, line) with their newlines (the split dropped one after each line but the last).
    blocks.push(lines.slice(blockStart, line).join('\n') + '\n');
    blockStart = line;
    lastText = '';
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const marker = FENCE.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length && isBlank(line.replace(FENCE, ''))) fence = null;
    }
    if (fence || !isBlank(line)) {
      if (!isBlank(line)) lastText = line;
      continue;
    }
    // A blank line outside a fence: is the next non-blank line the start of a new block?
    let next = i + 1;
    while (next < lines.length && isBlank(lines[next]!)) next++;
    // It must be complete (followed by a newline): a half-arrived line's type is not known yet.
    if (next >= lines.length - 1 || !lastText) continue;
    const following = lines[next]!;
    if (isIndented(following)) continue;
    const inList = LIST_ITEM.test(lastText.trimStart()) || isIndented(lastText);
    if (LIST_ITEM.test(following) && inList) continue;
    if (following.startsWith('>') && lastText.trimStart().startsWith('>')) continue;
    cutBefore(next);
    i = next - 1;
  }
  blocks.push(lines.slice(blockStart).join('\n'));
  return blocks;
}
