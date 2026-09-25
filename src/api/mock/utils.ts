import { abortError } from '../errors';

export type Range = readonly [min: number, max: number];

/** Resolves after `ms`, or rejects with an AbortError when `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function between(random: () => number, [min, max]: Range): number {
  return min + random() * (max - min);
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}
