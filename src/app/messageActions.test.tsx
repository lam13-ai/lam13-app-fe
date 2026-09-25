import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MockTiming } from '@/api';
import { renderApp } from './testUtils';

const log = () => screen.getByRole('log', { name: 'Conversation' });
const answers = () => within(log()).getAllByRole('article');

function mockClipboard(writeText?: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: writeText ? { writeText } : undefined });
}

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
});

async function openWaterConversation(timing?: MockTiming) {
  renderApp('/c/water-security-kpis', timing ? { timing } : undefined);
  await screen.findByRole('log', { name: 'Conversation' }, { timeout: 8000 });
}

describe('message actions', () => {
  it('copies the raw Markdown of an answer and announces it', async () => {
    const writeText = vi.fn(async (_text: string) => {});
    mockClipboard(writeText);
    await openWaterConversation();

    const answer = answers().at(-1)!;
    await act(async () => fireEvent.click(within(answer).getByRole('button', { name: 'Copy message' })));

    const copied = writeText.mock.calls[0]![0] ?? '';
    expect(copied.startsWith('## Water Security KPI Set')).toBe(true); // Markdown source, not rendered text
    expect(copied).not.toContain('Lam13 replied:'); // no hidden labels
    expect(copied).toContain('| Non-revenue water |');
    expect(within(answer).getByRole('button', { name: 'Copied' })).toBeTruthy();
    expect(within(answer).getByRole('status').textContent).toBe('Copied to clipboard.');
  });

  it('copies a user message as plain text', async () => {
    const writeText = vi.fn(async (_text: string) => {});
    mockClipboard(writeText);
    await openWaterConversation();

    const question = within(log()).getByText('Propose KPIs for a national water security strategy.').closest('[data-message-id]')!;
    await act(async () => fireEvent.click(within(question as HTMLElement).getByRole('button', { name: 'Copy message' })));
    expect(writeText).toHaveBeenCalledWith('Propose KPIs for a national water security strategy.');
  });

  it('reports a blocked or missing clipboard instead of failing silently', async () => {
    mockClipboard(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    await openWaterConversation();
    await act(async () => fireEvent.click(within(answers().at(-1)!).getByRole('button', { name: 'Copy message' })));
    expect(await screen.findByText("Couldn't copy. Select the text to copy it manually.")).toBeTruthy();

    mockClipboard(undefined);
    await act(async () => fireEvent.click(within(answers().at(-1)!).getByRole('button', { name: 'Copy message' })));
    await waitFor(() => expect(screen.getAllByText("Couldn't copy. Select the text to copy it manually.").length).toBeGreaterThan(0));
  });

  it('shows each message time from created_at, with the full date for assistive tech', async () => {
    await openWaterConversation();
    const times = log().querySelectorAll('time');
    expect(times.length).toBe(2); // the seeded question and answer
    for (const time of times) {
      expect(Number.isNaN(Date.parse(time.getAttribute('datetime')!))).toBe(false);
      expect(time.textContent).toMatch(/\d{1,2}:\d{2}/);
      expect(time.getAttribute('title')).toBeTruthy();
    }
  });

  it('does not offer Regenerate (not supported by the backend yet)', async () => {
    renderApp('/c/national-ai-strategy');
    await screen.findByRole('log', { name: 'Conversation' }, { timeout: 8000 });
    const all = answers();
    expect(all.length).toBeGreaterThan(1);
    for (const older of all) {
      expect(within(older).queryByRole('button', { name: 'Regenerate response' })).toBeNull();
      expect(within(older).getByRole('button', { name: 'Copy message' })).toBeTruthy();
    }
  });
});
