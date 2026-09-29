import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { initials } from '@/lib/initials';
import { avatarSource, UserAvatar } from './UserAvatar';

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

describe('avatarSource', () => {
  it('keeps real pictures, drops missing / empty / non-https ones, and makes Gravatar placeholders fail instead of blank', () => {
    expect(avatarSource('https://lh3.googleusercontent.com/a/photo')).toBe('https://lh3.googleusercontent.com/a/photo');
    expect(avatarSource(null)).toBeNull();
    expect(avatarSource(undefined)).toBeNull();
    expect(avatarSource('')).toBeNull();
    expect(avatarSource('   ')).toBeNull();
    expect(avatarSource('not a url')).toBeNull();
    expect(avatarSource('http://example.com/me.png')).toBeNull();
    expect(avatarSource('https://gravatar.com/avatar/abc123?d=blank&size=200')).toBe('https://gravatar.com/avatar/abc123?d=404&size=200');
    expect(avatarSource('https://secure.gravatar.com/avatar/abc123?default=mp')).toBe('https://secure.gravatar.com/avatar/abc123?d=404');
  });
});

describe('UserAvatar', () => {
  const img = (container: HTMLElement) => container.querySelector('img');
  const tile = (container: HTMLElement) => container.firstElementChild as HTMLElement;

  it('shows a real profile picture (over the initials)', () => {
    const { container } = render(<UserAvatar name="Aashir Aqeel" src="https://example.com/me.png" />);
    expect(img(container)?.getAttribute('src')).toBe('https://example.com/me.png');
    // The initials sit underneath: a transparent or still-loading picture never leaves an empty square.
    expect(tile(container).textContent).toBe('AA');
  });

  it('shows initials alone when the picture is missing or empty', () => {
    for (const src of [null, undefined, '', '  ']) {
      const { container, unmount } = render(<UserAvatar name="Mudassir Aqeel" src={src} />);
      expect(img(container)).toBeNull();
      expect(tile(container).textContent).toBe('MA');
      unmount();
    }
    const { container } = render(<UserAvatar name="Aashir" />);
    expect(tile(container).textContent).toBe('A');
  });

  it('a placeholder (Gravatar default) picture falls back to initials', () => {
    const { container } = render(<UserAvatar name="Mudassir Aqeel" src="https://gravatar.com/avatar/abc123?d=blank" />);
    expect(img(container)?.getAttribute('src')).toBe('https://gravatar.com/avatar/abc123?d=404');
    fireEvent.error(img(container)!); // no Gravatar for this person: 404
    expect(img(container)).toBeNull();
    expect(tile(container).textContent).toBe('MA');
  });

  it('a broken picture falls back to initials, and a new picture gets its own chance', () => {
    const { container, rerender } = render(<UserAvatar name="John Smith" src="https://example.com/broken.png" />);
    fireEvent.error(img(container)!);
    expect(img(container)).toBeNull();
    expect(tile(container).textContent).toBe('JS');
    rerender(<UserAvatar name="John Smith" src="https://example.com/new.png" />);
    expect(img(container)?.getAttribute('src')).toBe('https://example.com/new.png');
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
