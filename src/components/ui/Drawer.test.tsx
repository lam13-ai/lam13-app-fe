import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
