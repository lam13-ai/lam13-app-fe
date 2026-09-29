import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { initials } from '@/lib/initials';
import { UserAvatar } from './UserAvatar';

describe('initials', () => {
  it('takes the first and last word, uppercased; one word gives one letter', () => {
    expect(initials('Aashir Aqeel')).toBe('AA');
    expect(initials('Mudassir Aqeel')).toBe('MA');
    expect(initials('John Smith')).toBe('JS');
    expect(initials('John Michael Smith')).toBe('JS');
    expect(initials('Aashir')).toBe('A');
    expect(initials('  aashir   aqeel  ')).toBe('AA');
  });
});

describe('UserAvatar', () => {
  const tile = (container: HTMLElement) => container.firstElementChild as HTMLElement;

  it('shows the profile picture when there is one', () => {
    const { container } = render(<UserAvatar name="Aashir Aqeel" src="https://example.com/me.png" />);
    expect(tile(container).tagName).toBe('IMG');
    expect(tile(container).getAttribute('src')).toBe('https://example.com/me.png');
  });

  it('shows initials when there is no picture', () => {
    const { container, rerender } = render(<UserAvatar name="Aashir Aqeel" src={null} />);
    expect(tile(container).textContent).toBe('AA');
    rerender(<UserAvatar name="Mudassir Aqeel" />);
    expect(tile(container).textContent).toBe('MA');
    rerender(<UserAvatar name="Aashir" />);
    expect(tile(container).textContent).toBe('A');
    rerender(<UserAvatar name="John Michael Smith" />);
    expect(tile(container).textContent).toBe('JS');
  });

  it('falls back to initials when the picture fails to load, and retries a new picture', () => {
    const { container, rerender } = render(<UserAvatar name="John Smith" src="https://example.com/broken.png" />);
    fireEvent.error(tile(container));
    expect(tile(container).tagName).toBe('SPAN');
    expect(tile(container).textContent).toBe('JS');
    rerender(<UserAvatar name="John Smith" src="https://example.com/new.png" />);
    expect(tile(container).tagName).toBe('IMG');
  });

  it('keeps a generic icon when there is no usable name', () => {
    for (const name of [null, undefined, '', '   ']) {
      const { container, unmount } = render(<UserAvatar name={name} />);
      expect(tile(container).textContent).toBe('');
      expect(tile(container).querySelector('svg')).toBeTruthy();
      unmount();
    }
  });
});
