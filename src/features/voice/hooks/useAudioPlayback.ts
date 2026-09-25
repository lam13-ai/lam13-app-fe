import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { audioFocus } from '../lib/audioFocus';

export interface AudioPlayback {
  playing: boolean;
  positionMs: number;
  durationMs: number;
  status: 'loading' | 'ready' | 'error';
  toggle: () => Promise<void>;
  seek: (ms: number) => void;
}

/**
 * Wraps an HTMLAudioElement for a single clip. Only one clip plays at a time (audio focus),
 * and playback never starts while the microphone is recording.
 * `fallbackDurationMs` covers MediaRecorder WebM files, which often report an unknown duration.
 */
export function useAudioPlayback(src: string | null, fallbackDurationMs: number): AudioPlayback {
  const id = useId();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [mediaDurationMs, setMediaDurationMs] = useState<number | null>(null);
  const [status, setStatus] = useState<AudioPlayback['status']>('loading');

  useEffect(() => {
    if (!src) return;
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.src = src;
    audioRef.current = audio;

    const onMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setMediaDurationMs(audio.duration * 1000);
      setStatus('ready');
    };
    const onTime = () => setPositionMs(audio.currentTime * 1000);
    const onPlay = () => setPlaying(true);
    const onPause = () => {
      setPlaying(false);
      audioFocus.release(id);
    };
    const onEnded = () => {
      setPlaying(false);
      setPositionMs(0);
      audioFocus.release(id);
    };
    const onError = () => {
      setPlaying(false);
      setStatus('error');
      audioFocus.release(id);
    };

    const listeners: Array<[string, () => void]> = [
      ['loadedmetadata', onMetadata],
      ['canplay', onMetadata],
      ['timeupdate', onTime],
      ['play', onPlay],
      ['pause', onPause],
      ['ended', onEnded],
      ['error', onError],
    ];
    listeners.forEach(([type, fn]) => audio.addEventListener(type, fn));

    return () => {
      listeners.forEach(([type, fn]) => audio.removeEventListener(type, fn));
      audio.pause();
      audio.removeAttribute('src');
      audioRef.current = null;
      audioFocus.release(id);
    };
  }, [src, id]);

  const toggle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (!audioFocus.request({ id, kind: 'playback', interrupt: () => audio.pause() })) return;
    try {
      await audio.play();
    } catch {
      audioFocus.release(id);
      setPlaying(false);
    }
  }, [id]);

  const seek = useCallback((ms: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = ms / 1000;
    setPositionMs(ms);
  }, []);

  return {
    playing,
    positionMs,
    durationMs: mediaDurationMs ?? fallbackDurationMs,
    status: src ? status : 'loading',
    toggle,
    seek,
  };
}
