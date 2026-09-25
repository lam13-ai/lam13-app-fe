import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Menu, MenuItem } from './Menu';
import { Popover } from './Popover';

function renderMenu(onSelect = vi.fn()) {
  render(
    <Popover trigger={(props) => <button {...props}>Effort</button>}>
      <Menu label="Effort">
        <MenuItem checked={false} onSelect={() => onSelect('low')}>
          Low
        </MenuItem>
        <MenuItem checked onSelect={() => onSelect('medium')}>
          Medium
        </MenuItem>
      </Menu>
    </Popover>,
  );
  return { onSelect, trigger: screen.getByRole('button', { name: 'Effort' }) };
}

describe('Popover + Menu', () => {
  it('toggles aria-expanded and exposes radio menu items', () => {
    const { trigger } = renderMenu();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('menuitemradio', { name: 'Medium' }).getAttribute('aria-checked')).toBe('true');
  });

  it('selecting an item calls onSelect, closes, and returns focus to the trigger', () => {
    const { trigger, onSelect } = renderMenu();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Low' }));

    expect(onSelect).toHaveBeenCalledWith('low');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Escape and on outside pointer-down', () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('moves focus with arrow keys', () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);
    const low = screen.getByRole('menuitemradio', { name: 'Low' });
    const medium = screen.getByRole('menuitemradio', { name: 'Medium' });

    low.focus();
    fireEvent.keyDown(low, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(medium);
    fireEvent.keyDown(medium, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(low);
  });
});
