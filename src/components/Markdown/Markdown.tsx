import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/cn';

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

/**
 * Assistant message body: GFM Markdown (headings, lists, tables, code, links) with the
 * reference's document typography (styles/markdown.css). Raw HTML is not rendered.
 */
export const Markdown = memo(function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn('md-content', className)}>
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
