import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';
import { audioFocus } from '@/features/voice';
import { useComposerStore } from '@/stores/composerStore';
import { initialStreamState, useStreamStore } from '@/stores/streamStore';

// Lazy routes and simulated latency: allow for a cold module import on the first render.
configure({ asyncUtilTimeout: 4000 });

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  // Global stores outlive a render; reset them between tests.
  useStreamStore.setState(initialStreamState);
  useComposerStore.setState({ drafts: {} });
  audioFocus.reset();
});

// jsdom gaps used by layout code.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function scrollTo() {};
}

// Media/URL gaps used by voice code (jsdom has no media playback, canvas or blob URLs).
// (Node's own URL.createObjectURL only accepts Node Blobs, so always replace it.)
let blobUrlCounter = 0;
URL.createObjectURL = () => `blob:test/${++blobUrlCounter}`;
URL.revokeObjectURL = () => {};

Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value(this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  },
});
Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  value(this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
    this.dispatchEvent(new Event('pause'));
  },
});
Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value() {} });
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => null });
