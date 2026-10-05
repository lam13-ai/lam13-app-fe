import { memo, useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/cn';
import { splitMarkdownBlocks } from './blocks';

const remarkPlugins = [remarkGfm];

const components: Components = {
  // Tables scroll inside their own wrapper on narrow screens.
  table: ({ node, ...props }) => (
    <div className="md-table">
      <table {...props} />
    </div>
  ),
  // External links open in a new tab. react-markdown already strips unsafe URLs (e.g. javascript:).
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};

/** One piece of Markdown; memoized, so an unchanged block is neither re-parsed nor re-rendered. */
const Block = memo(function Block({ source }: { source: string }) {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
      {source}
    </ReactMarkdown>
  );
});

/**
 * Assistant message body: GFM Markdown (headings, lists, tables, code, links) with the
 * reference's document typography (styles/markdown.css). Raw HTML is not rendered.
 *
 * `streaming`: the text is still growing. It is then rendered block by block — finished blocks keep their
 * DOM and only the last one is re-parsed for each new token — so the cost of an update does not grow with
 * the length of the answer. The finished text is rendered as one document.
 */
export const Markdown = memo(function Markdown({
  content,
  className,
  streaming = false,
}: {
  content: string;
  className?: string;
  streaming?: boolean;
}) {
  const blocks = useMemo(() => (streaming ? splitMarkdownBlocks(content) : [content]), [content, streaming]);
  return (
    <div className={cn('md-content', className)}>
      {blocks.map((source, index) => (
        // A finished block never changes, so its position is a stable key.
        <Block key={index} source={source} />
      ))}
    </div>
  );
});
