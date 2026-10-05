import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { splitMarkdownBlocks } from './blocks';
import { Markdown } from './Markdown';

const DOC = [
  '# Building a strategy',
  '',
  'A **baseline** is the measured starting point. It matters because',
  'later numbers are compared with it.',
  '',
  '## Steps',
  '',
  '1. Measure the indicator.',
  '',
  '2. Diagnose the gap.',
  '',
  '   A continuation paragraph inside item two.',
  '',
  '3. Choose the moves.',
  '',
  'After the list.',
  '',
  '- tight one',
  '- tight two',
  '',
  '| Step | Output |',
  '| --- | --- |',
  '| Measure | A value |',
  '',
  '```text',
  'baseline = value(source, year)',
  '',
  'gap = target - baseline',
  '```',
  '',
  '> A quote, first paragraph.',
  '>',
  '> Second paragraph of the quote.',
  '',
  'Which one first?',
].join('\n');

describe('splitMarkdownBlocks', () => {
  it('always joins back to the original text, for every prefix of a document', () => {
    for (let end = 0; end <= DOC.length; end++) {
      const prefix = DOC.slice(0, end);
      expect(splitMarkdownBlocks(prefix).join('')).toBe(prefix);
    }
  });

  it('cuts between top-level blocks, but never inside a code fence, a loose list or a quote', () => {
    // With the last line complete (a trailing newline), every block is closed.
    const blocks = splitMarkdownBlocks(`${DOC}\n`)
      .map((b) => b.trim().split('\n')[0])
      .filter(Boolean);
    expect(blocks).toEqual([
      '# Building a strategy',
      'A **baseline** is the measured starting point. It matters because',
      '## Steps',
      '1. Measure the indicator.', // the whole loose list, with its indented continuation
      'After the list.',
      '- tight one',
      '| Step | Output |',
      '```text', // blank line inside the fence did not cut it
      '> A quote, first paragraph.',
      'Which one first?',
    ]);
    expect(splitMarkdownBlocks(DOC).find((b) => b.startsWith('1.'))).toContain('3. Choose the moves.');
    expect(splitMarkdownBlocks(DOC).find((b) => b.startsWith('```'))).toContain('gap = target - baseline');
  });

  it('does not close a block until the next line is complete (its type is not known yet)', () => {
    expect(splitMarkdownBlocks('Intro.\n\n-')).toEqual(['Intro.\n\n-']); // "-": a list? a rule? plain text?
    expect(splitMarkdownBlocks('Intro.\n\n- item\n')).toEqual(['Intro.\n\n', '- item\n']);
    expect(splitMarkdownBlocks('- a\n\n- b\n')).toEqual(['- a\n\n- b\n']); // same loose list
    expect(splitMarkdownBlocks('')).toEqual(['']);
  });

  it('finished blocks never change as more text arrives', () => {
    let previous: string[] = [];
    for (let end = 1; end <= DOC.length; end++) {
      const blocks = splitMarkdownBlocks(DOC.slice(0, end));
      // Every block but the previous tail is still there, unchanged.
      expect(blocks.slice(0, Math.max(0, previous.length - 1))).toEqual(previous.slice(0, -1));
      previous = blocks;
    }
  });
});

describe('<Markdown streaming>', () => {
  const html = (content: string, streaming: boolean) => {
    const { container, unmount } = render(<Markdown content={content} streaming={streaming} />);
    const out = container.querySelector('.md-content')!.innerHTML;
    unmount();
    return out;
  };

  it('renders the same HTML block by block as it does as one document', () => {
    // Whitespace between top-level elements is where the two differ (one text node per block boundary).
    const normal = (s: string) => s.replace(/>\s+</g, '><').trim();
    expect(normal(html(DOC, true))).toBe(normal(html(DOC, false)));
  });

  it('keeps finished blocks’ DOM while the last block grows', () => {
    const first = '# Title\n\nFirst paragraph is done.\n\nSecond para';
    const { container, rerender } = render(<Markdown content={first} streaming />);
    const heading = container.querySelector('h1')!;
    const paragraph = container.querySelectorAll('p')[0]!;
    rerender(<Markdown content={`${first}graph keeps growing`} streaming />);
    rerender(<Markdown content={`${first}graph keeps growing.\n\n- and a list\n`} streaming />);
    expect(container.querySelector('h1')).toBe(heading); // the very same nodes: not re-rendered
    expect(container.querySelectorAll('p')[0]).toBe(paragraph);
    expect(container.querySelectorAll('p')[1]!.textContent).toBe('Second paragraph keeps growing.');
    expect(container.querySelector('li')!.textContent).toBe('and a list');
  });

  it('shows partial text immediately — no waiting for a block to finish', () => {
    const { container, rerender } = render(<Markdown content="Hel" streaming />);
    expect(container.textContent).toBe('Hel');
    rerender(<Markdown content="Hello **wor" streaming />);
    expect(container.textContent).toContain('Hello');
    rerender(<Markdown content="Hello **world**!" streaming />);
    expect(container.querySelector('strong')!.textContent).toBe('world');
  });
});
