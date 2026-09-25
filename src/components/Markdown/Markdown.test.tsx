import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown } from './Markdown';

const content = `## Plan Title

A lead paragraph with **bold** text and \`inline_code\`.

1. **First:** ordered item
2. Second item

- unordered item

| Lens | Red flag |
| --- | --- |
| Logic | Outputs, not outcomes |

\`\`\`json
{ "ok": true }
\`\`\`

See the [OECD observatory](https://oecd.ai) and [bad](javascript:alert(1)). <b>raw html</b>
`;

describe('Markdown', () => {
  it('renders GFM structure with document typography', () => {
    const { container } = render(<Markdown content={content} />);

    expect(container.firstElementChild?.classList.contains('md-content')).toBe(true);
    expect(screen.getByRole('heading', { level: 2, name: 'Plan Title' })).toBeTruthy();
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('inline_code').tagName).toBe('CODE');
    expect(container.querySelectorAll('ol > li')).toHaveLength(2);
    expect(container.querySelectorAll('ul > li')).toHaveLength(1);
    expect(container.querySelector('pre code')?.textContent).toContain('"ok": true');
  });

  it('wraps tables for horizontal scrolling', () => {
    const { container } = render(<Markdown content={content} />);
    const table = screen.getByRole('table');
    expect(table.parentElement?.classList.contains('md-table')).toBe(true);
    expect(within(table).getByRole('columnheader', { name: 'Red flag' })).toBeTruthy();
    expect(container.querySelectorAll('td')).toHaveLength(2);
  });

  it('opens links in a new tab, neutralises unsafe URLs, and does not render raw HTML', () => {
    const { container } = render(<Markdown content={content} />);
    const link = screen.getByRole('link', { name: 'OECD observatory' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByText('bad').getAttribute('href') ?? '').not.toContain('javascript');
    expect(container.querySelector('b')).toBeNull();
  });
});
