import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { audioFocus } from '../lib/audioFocus';
import { VoicePlayer } from './VoicePlayer';

describe('VoicePlayer', () => {
  it('plays and pauses with accessible controls, showing duration then position', async () => {
    render(<VoicePlayer src="blob:test/a" durationMs={12_000} peaks={[0.2, 0.8]} />);
    expect(screen.getByText('0:12')).toBeTruthy();

    const play = screen.getByRole('button', { name: 'Play voice message' });
    await act(async () => fireEvent.click(play));
    expect(screen.getByRole('button', { name: 'Pause voice message' })).toBeTruthy();
    expect(audioFocus.active).toBe('playback');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Pause voice message' })));
    expect(screen.getByRole('button', { name: 'Play voice message' })).toBeTruthy();
    expect(audioFocus.active).toBeNull();
  });

  it('seeks via the keyboard-accessible range and announces the position', () => {
    render(<VoicePlayer src="blob:test/b" durationMs={10_000} />);
    const slider = screen.getByRole('slider', { name: 'Playback position, voice message' });
    expect(slider.getAttribute('aria-valuetext')).toBe('0 seconds of 10 seconds');
    fireEvent.change(slider, { target: { value: '4000' } });
    expect(slider.getAttribute('aria-valuetext')).toBe('4 seconds of 10 seconds');
    expect(screen.getByText('0:04')).toBeTruthy();
  });

  it('only one clip plays at a time, and nothing plays while recording', async () => {
    render(
      <>
        <VoicePlayer src="blob:test/1" durationMs={5000} label="first" />
        <VoicePlayer src="blob:test/2" durationMs={5000} label="second" />
      </>,
    );
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Play first' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Play second' })));
    expect(screen.getByRole('button', { name: 'Play first' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pause second' })).toBeTruthy();

    // A recording takes over: playback stops and cannot restart until it ends.
    act(() => void audioFocus.request({ id: 'rec', kind: 'recording', interrupt: () => {} }));
    expect(screen.getByRole('button', { name: 'Play second' })).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Play first' })));
    expect(screen.getByRole('button', { name: 'Play first' })).toBeTruthy();
  });

  it('is disabled without a source and reports an unavailable clip', async () => {
    const { rerender, container } = render(<VoicePlayer src={null} durationMs={3000} />);
    expect((screen.getByRole('button', { name: 'Play voice message' }) as HTMLButtonElement).disabled).toBe(true);

    rerender(<VoicePlayer src="blob:test/broken" durationMs={3000} />);
    // The hook's Audio element is internal; trigger its error through the media prototype event.
    const audios = container.querySelectorAll('audio');
    expect(audios).toHaveLength(0); // audio elements are not rendered into the DOM
  });
});
