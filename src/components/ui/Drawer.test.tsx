import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Drawer } from './Drawer';

describe('Drawer', () => {
  it('is inert while closed', () => {
    render(
      <Drawer open={false} onClose={() => {}} label="Sidebar">
        <button>Inside</button>
      </Drawer>,
    );
    // jsdom does not apply `inert` to the accessibility tree, so assert the attribute itself.
    const dialog = screen.getByRole('dialog', { name: 'Sidebar', hidden: true });
    expect(dialog.closest('[inert]')).not.toBeNull();
  });

  it('opens as a modal dialog, takes focus, and closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} label="Sidebar">
        <button>Inside</button>
      </Drawer>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Sidebar' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(dialog);
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('Drawer resize (right sheet)', () => {
  const desktop = (matches: boolean) =>
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({ matches: matches && query === '(min-width: 768px)', addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
    );
  afterEach(() => vi.restoreAllMocks());

  /** A right sheet whose width lives in the test (like the contact sheet's store). */
  function Sheet({ onClose = () => {}, initial = 480, side = 'right' as const }: { onClose?: () => void; initial?: number; side?: 'left' | 'right' }) {
    const [width, setWidth] = useState(initial);
    return (
      <Drawer open onClose={onClose} label="Contact" side={side} resize={{ width, onWidthChange: setWidth, min: 360, max: 960, label: 'Resize contact panel' }}>
        <button>Inside</button>
      </Drawer>
    );
  }
  const handle = () => screen.getByRole('separator', { name: 'Resize contact panel' });
  const panelWidth = () => screen.getByRole('dialog', { name: 'Contact' }).style.width;

  it('has no resize handle on phones (full-screen sheet) or on the left drawer', () => {
    desktop(false);
    const { unmount } = render(<Sheet />);
    expect(screen.queryByRole('separator')).toBeNull();
    expect(panelWidth()).toBe('');
    unmount();
    desktop(true);
    render(<Sheet side="left" />);
    expect(screen.queryByRole('separator')).toBeNull();
  });

  it('is a labelled, focusable vertical separator reporting the width and its bounds', () => {
    desktop(true);
    render(<Sheet />);
    const h = handle();
    expect(h.getAttribute('aria-orientation')).toBe('vertical');
    expect(h.tabIndex).toBe(0);
    expect(h.getAttribute('aria-valuenow')).toBe('480');
    expect(h.getAttribute('aria-valuemin')).toBe('360');
    // jsdom's window is 1024px wide: the maximum is 75% of it (768), below the 960 cap.
    expect(h.getAttribute('aria-valuemax')).toBe('768');
    expect(panelWidth()).toBe('480px');
  });

  it('resizes with the keyboard: ← wider, → narrower (Shift: larger steps), Home/End = min/max', () => {
    desktop(true);
    render(<Sheet />);
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
    expect(panelWidth()).toBe('496px');
    fireEvent.keyDown(handle(), { key: 'ArrowRight', shiftKey: true });
    expect(panelWidth()).toBe('432px');
    fireEvent.keyDown(handle(), { key: 'Home' });
    expect(panelWidth()).toBe('360px');
    fireEvent.keyDown(handle(), { key: 'ArrowRight' });
    expect(panelWidth()).toBe('360px'); // never below the minimum
    fireEvent.keyDown(handle(), { key: 'End' });
    expect(panelWidth()).toBe('768px');
    fireEvent.keyDown(handle(), { key: 'ArrowLeft' });
    expect(panelWidth()).toBe('768px'); // never past the maximum
  });

  it('resizes by dragging the left edge (anchored right), clamps, and blocks text selection while dragging', () => {
    desktop(true);
    render(<Sheet />);
    fireEvent.pointerDown(handle(), { button: 0, pointerId: 1, clientX: 544 });
    expect(document.body.style.userSelect).toBe('none');
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 424 }); // drag left
    expect(panelWidth()).toBe('600px'); // 1024 − 424
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 900 }); // far right
    expect(panelWidth()).toBe('360px');
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 0 }); // far left
    expect(panelWidth()).toBe('768px');
    fireEvent.pointerUp(handle(), { pointerId: 1 });
    expect(document.body.style.userSelect).toBe('');
    fireEvent.pointerMove(handle(), { pointerId: 1, clientX: 500 }); // not dragging any more
    expect(panelWidth()).toBe('768px');
  });

  it('keeps Escape-to-close while the handle has focus', () => {
    desktop(true);
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} />);
    handle().focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('Drawer resize — window changes', () => {
  afterEach(() => vi.restoreAllMocks());

  it('re-applies the 75%-of-window limit when the window narrows (e.g. while expanded)', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) => ({ matches: query === '(min-width: 768px)', addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
    );
    render(
      <Drawer open onClose={() => {}} label="Contact" side="right" resize={{ width: Number.POSITIVE_INFINITY, onWidthChange: () => {}, min: 360, max: 960, label: 'Resize contact panel' }}>
        <button>Inside</button>
      </Drawer>,
    );
    const panel = screen.getByRole('dialog', { name: 'Contact' });
    expect(panel.style.width).toBe('768px'); // 75% of jsdom's 1024
    const original = window.innerWidth;
    try {
      act(() => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
        window.dispatchEvent(new Event('resize'));
      });
      expect(panel.style.width).toBe('600px');
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: original });
    }
  });
});
