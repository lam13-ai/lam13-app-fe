// Runs before React loads: React only listens for unprefixed `animationend` when AnimationEvent exists.
if (typeof globalThis.AnimationEvent === 'undefined') {
  globalThis.AnimationEvent = class AnimationEvent extends Event {} as typeof globalThis.AnimationEvent;
}
