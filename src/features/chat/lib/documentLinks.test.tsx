import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui';
import type { Artifact } from '@/types/api';
import type { MessageView } from '@/types/chat';
import { AssistantMessage } from '../components/AssistantMessage';
import { separateDocumentLinks } from './documentLinks';

const PDF = 'https://files.example/reports/uae-ai-strategy.pdf';
const answer = `Got it — the full document is ready.

## Public sector priorities

The brief recommends a [national baseline](https://example.org/baseline) first.

- Delivery priorities
- Accountability

---

[Download PDF](${PDF})`;

const message = (patch: Partial<MessageView> = {}): MessageView => ({
  id: 'a1',
  conversation_id: 'c1',
  client_message_id: null,
  role: 'assistant',
  kind: 'text',
  content: answer,
  audio: null,
  call: null,
  status: 'complete',
  created_at: '2026-09-28T10:00:00Z',
  ...patch,
});

const report = (url = PDF): Artifact => ({
  id: 'a1:report',
  conversation_id: 'c1',
  message_id: 'a1',
  type: 'report',
  filename: 'Strategy report.pdf',
  status: 'ready',
  progress: null,
  download: { url, expires_at: null },
  error: null,
  created_at: '',
  updated_at: '',
});

afterEach(cleanup);

describe('separateDocumentLinks', () => {
  it('takes the trailing download link and its separator out of the text; prose links stay', () => {
    const { content, artifacts } = separateDocumentLinks(message({ artifacts: [report()] }));
    expect(content.endsWith('- Accountability')).toBe(true);
    expect(content).not.toContain('Download PDF');
    expect(content).not.toMatch(/---\s*$/);
    expect(content).toContain('[national baseline](https://example.org/baseline)');
    // Same file as the message's own artifact: merged, not doubled.
    expect(artifacts).toEqual([report()]);
  });

  it('a link with no matching artifact (e.g. an older answer) becomes the document card itself', () => {
    const { artifacts } = separateDocumentLinks(message());
    expect(artifacts).toEqual([expect.objectContaining({ type: 'report', status: 'ready', download: { url: PDF, expires_at: null } })]);
  });

  it('leaves the text alone when it has no trailing document link, or the link is not http(s)', () => {
    const plain = message({ content: 'Read the [guide](https://example.org/guide) first.\n\nThat is all.' });
    expect(separateDocumentLinks(plain).content).toBe(plain.content);
    const unsafe = message({ content: 'Done.\n\n[Download PDF](javascript:alert(1))' });
    expect(separateDocumentLinks(unsafe)).toEqual({ content: unsafe.content, artifacts: [] });
  });

  it('handles several trailing document links (PDF and deck)', () => {
    const both = message({ content: `Done.\n\n---\n\n[Download PDF](${PDF})\n\n**[Download deck](https://files.example/deck.pptx)**` });
    const { content, artifacts } = separateDocumentLinks(both);
    expect(content).toBe('Done.');
    expect(artifacts.map((a) => a.type)).toEqual(['report', 'pptx']);
  });
});

describe('AssistantMessage document card', () => {
  const renderAnswer = (patch: Partial<MessageView>) =>
    render(
      <ToastProvider>
        <AssistantMessage message={message(patch)} anchorKey="a1" />
      </ToastProvider>,
    );

  it('shows ONE download for the report: a keyboard-reachable card, no separate "Download PDF" link', () => {
    renderAnswer({ artifacts: [report()] });
    expect(screen.queryByText('Download PDF')).toBeNull();
    const files = screen.getByRole('list', { name: 'Generated files' });
    const card = within(files).getByRole('link', { name: 'Download Strategy report (PDF document)' });
    expect(card.getAttribute('href')).toBe(PDF);
    expect(card.getAttribute('target')).toBe('_blank');
    expect(card.getAttribute('rel')).toBe('noopener noreferrer');
    expect(card.textContent).toContain('PDF document · Download');
    expect(screen.getAllByRole('link', { name: /download/i })).toHaveLength(1);
    // The rest of the answer still renders as Markdown.
    expect(screen.getByRole('heading', { name: 'Public sector priorities' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'national baseline' })).toBeTruthy();
  });

  it('keeps the building state in the same card shape', () => {
    renderAnswer({ content: 'Working on the document.', artifacts: [{ ...report(), status: 'processing', download: null }] });
    expect(within(screen.getByRole('list', { name: 'Generated files' })).getByRole('status').textContent).toContain('Building pdf document…');
  });
});
