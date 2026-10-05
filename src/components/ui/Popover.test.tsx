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

describe('Popover placement', () => {
  /** A bottom-end popover whose trigger sits at `triggerTop` in a 600px-tall scroll container. */
  function openAt(triggerTop: number) {
    render(
      <div data-testid="scroller" style={{ overflowY: 'auto' }}>
        <Popover placement="bottom-end" trigger={(props) => <button {...props}>Actions</button>}>
          <Menu label="Actions">
            <MenuItem onSelect={() => {}}>Rename</MenuItem>
          </Menu>
        </Popover>
      </div>,
    );
    const rect = (top: number, height: number) => ({ top, bottom: top + height, left: 0, right: 0, width: 0, height, x: 0, y: top, toJSON: () => ({}) });
    const trigger = screen.getByRole('button', { name: 'Actions' });
    const panel = screen.getByRole('menu').parentElement!;
    // jsdom has no layout: give the pieces the geometry the component measures.
    screen.getByTestId('scroller').getBoundingClientRect = () => rect(100, 600);
    trigger.getBoundingClientRect = () => rect(triggerTop, 28);
    Object.defineProperty(panel, 'offsetHeight', { value: 80 });
    fireEvent.click(trigger);
    return panel;
  }

  it('opens below when there is room in its scroll container', () => {
    expect(openAt(200).className).toContain('top-full'); // hangs under the trigger
  });

  it('flips above when the container would clip it below', () => {
    const panel = openAt(640); // 32px left under the trigger, inside a container ending at 700
    expect(panel.className).toContain('bottom-full');
    expect(panel.className).not.toContain('top-full');
  });
});
