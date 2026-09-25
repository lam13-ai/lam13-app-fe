import { render, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnchoredScroll } from './useAnchoredScroll';
import { useLogScroll } from './useLogScroll';

/**
 * jsdom has no layout, so element metrics come from data-* attributes:
 * data-top → offsetTop, data-height → offsetHeight, data-client → clientHeight, data-scroll-height → scrollHeight.
 */
beforeEach(() => {
  const metric = (attr: string) =>
    function (this: HTMLElement) {
      return Number(this.dataset[attr] ?? 0);
    };
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(metric('top'));
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(metric('height'));
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(metric('client'));
  vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(metric('scrollHeight'));
});

afterEach(() => vi.restoreAllMocks());

function AnchorHarness({ anchorId, anchorTop }: { anchorId: string; anchorTop: number }) {
  const logRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useAnchoredScroll({ logRef, contentRef, anchorId });
  return (
    <div ref={logRef} data-testid="log" style={{ paddingTop: '20px', paddingBottom: '20px' }}>
      <div ref={contentRef}>
        <div data-message-id={anchorId} data-top={anchorTop} />
      </div>
    </div>
  );
}

describe('anchored scrolling', () => {
  it('pins the latest user message to the top of the log', async () => {
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo;
    const { rerender } = render(<AnchorHarness anchorId="u1" anchorTop={300} />);

    // First pin is instant, to the anchor minus top padding.
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 280, behavior: 'auto' }));

    // A newly sent message becomes the anchor: smooth scroll.
    rerender(<AnchorHarness anchorId="u2" anchorTop={380} />);
    await waitFor(() => expect(scrollTo).toHaveBeenLastCalledWith({ top: 360, behavior: 'smooth' }));
  });
});

function PrependHarness({ firstKey, onLoadOlder }: { firstKey: string; onLoadOlder: () => void }) {
  const logRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { onScroll, jumpToLatest } = useLogScroll({ logRef, contentRef, firstKey, canLoadOlder: true, onLoadOlder });
  const height = firstKey === 'm1' ? 1000 : 1600;
  return (
    <div ref={logRef} data-testid="log" data-client="500" data-scroll-height={height} onScroll={onScroll}>
      <div ref={contentRef} data-height={height} />
      <button type="button" onClick={jumpToLatest}>
        Jump
      </button>
    </div>
  );
}

describe('loading older messages', () => {
  it('requests the older page near the top and keeps the viewport steady after prepending', () => {
    const onLoadOlder = vi.fn();
    const { getByTestId, rerender } = render(<PrependHarness firstKey="m1" onLoadOlder={onLoadOlder} />);
    const log = getByTestId('log');

    log.scrollTop = 40;
    log.dispatchEvent(new Event('scroll'));
    expect(onLoadOlder).toHaveBeenCalledOnce();

    // Older page arrives: content grows by 600px above the viewport.
    rerender(<PrependHarness firstKey="m0" onLoadOlder={onLoadOlder} />);
    expect(log.scrollTop).toBe(640);
  });
});

describe('jump to latest', () => {
  it('resumes a jump that an older page interrupted by landing mid-scroll', () => {
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo;
    const onLoadOlder = vi.fn();
    const { getByTestId, getByRole, rerender } = render(<PrependHarness firstKey="m1" onLoadOlder={onLoadOlder} />);
    const log = getByTestId('log');

    log.scrollTop = 40;
    log.dispatchEvent(new Event('scroll')); // near the top: an older page starts loading
    getByRole('button', { name: 'Jump' }).click();
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 500, behavior: 'smooth' });

    // The page lands mid-jump; restoring the offset would cancel the smooth scroll, so the jump restarts.
    rerender(<PrependHarness firstKey="m0" onLoadOlder={onLoadOlder} />);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1100, behavior: 'smooth' });
  });
});
