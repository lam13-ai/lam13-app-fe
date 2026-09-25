import { describe, expect, it } from 'vitest';
import { resolveCallingConfig } from '../config';
import { callError } from '../types';
import { callReducer, initialCallState, isInCall, type CallEvent, type CallState } from './callMachine';
import { transcriptReducer, type TranscriptEntry } from './transcript';

const run = (events: CallEvent[], from: CallState = initialCallState) => events.reduce(callReducer, from);

describe('callReducer', () => {
  it('idle → connecting → active → ending → idle', () => {
    expect(run([{ type: 'START' }])).toEqual({ status: 'connecting' });
    expect(run([{ type: 'START' }, { type: 'CONNECTED', at: 5 }])).toEqual({ status: 'active', startedAt: 5 });
    const ending = run([{ type: 'START' }, { type: 'CONNECTED', at: 5 }, { type: 'END_REQUESTED' }]);
    expect(ending).toEqual({ status: 'ending', startedAt: 5 });
    expect(run([{ type: 'ENDED' }], ending)).toEqual(initialCallState);
  });

  it('never stays connecting/active after the provider goes away', () => {
    expect(run([{ type: 'START' }, { type: 'ENDED' }])).toMatchObject({ status: 'error', error: { code: 'connection-failed' } });
    expect(run([{ type: 'START' }, { type: 'CONNECTED', at: 1 }, { type: 'ENDED' }])).toMatchObject({
      status: 'error',
      error: { code: 'ended-unexpectedly' },
    });
    expect(run([{ type: 'START' }, { type: 'FAIL', error: callError('permission-denied') }])).toMatchObject({
      status: 'error',
      error: { code: 'permission-denied' },
    });
    // A normal remote completion of a live call is not an error; while connecting it still is.
    expect(run([{ type: 'START' }, { type: 'CONNECTED', at: 1 }, { type: 'ENDED', completed: true }])).toEqual(initialCallState);
    expect(run([{ type: 'START' }, { type: 'ENDED', completed: true }])).toMatchObject({ error: { code: 'connection-failed' } });
    // A failure while hanging up still ends the call.
    expect(run([{ type: 'FAIL', error: callError('call-failed') }], { status: 'ending', startedAt: 1 })).toEqual(initialCallState);
  });

  it('retries from error, dismisses to idle, and ignores invalid events', () => {
    const failed = run([{ type: 'START' }, { type: 'FAIL', error: callError('connection-failed') }]);
    expect(run([{ type: 'START' }], failed)).toEqual({ status: 'connecting' });
    expect(run([{ type: 'RESET' }], failed)).toEqual(initialCallState);
    expect(run([{ type: 'CONNECTED', at: 1 }, { type: 'END_REQUESTED' }, { type: 'ENDED' }])).toEqual(initialCallState);
    const active: CallState = { status: 'active', startedAt: 1 };
    expect(run([{ type: 'START' }], active)).toBe(active); // no second call
    expect([isInCall(active), isInCall(initialCallState), isInCall(failed)]).toEqual([true, false, false]);
  });
});

describe('transcriptReducer', () => {
  const apply = (updates: [TranscriptEntry['role'], string, boolean][]) =>
    updates.reduce<TranscriptEntry[]>((acc, [role, text, final]) => transcriptReducer(acc, { type: 'update', update: { role, text, final } }), []);

  it('replaces interim text in place, closes on final, and starts new lines per utterance/speaker', () => {
    const entries = apply([
      ['assistant', 'Hello', false],
      ['assistant', 'Hello, how can', false],
      ['assistant', 'Hello, how can I help?', true],
      ['user', 'Draft', false],
      ['user', 'Draft KPIs', true],
      ['user', 'For water.', true],
      ['assistant', '   ', true],
    ]);
    expect(entries.map((e) => [e.role, e.text, e.final])).toEqual([
      ['assistant', 'Hello, how can I help?', true],
      ['user', 'Draft KPIs', true],
      ['user', 'For water.', true],
    ]);
    expect(new Set(entries.map((e) => e.id)).size).toBe(3);
    expect(transcriptReducer(entries, { type: 'clear' })).toEqual([]);
  });
});

describe('resolveCallingConfig', () => {
  it('reports missing public settings by name only', () => {
    expect(resolveCallingConfig({ publicKey: undefined, assistantId: undefined })).toEqual({
      ok: false,
      missing: ['VITE_VAPI_PUBLIC_KEY', 'VITE_VAPI_ASSISTANT_ID'],
    });
    const partial = resolveCallingConfig({ publicKey: 'pk-secretish-value', assistantId: undefined });
    expect(partial).toEqual({ ok: false, missing: ['VITE_VAPI_ASSISTANT_ID'] });
    expect(JSON.stringify(partial)).not.toContain('pk-secretish-value');
    expect(resolveCallingConfig({ publicKey: 'pk', assistantId: 'a1' })).toEqual({ ok: true, config: { publicKey: 'pk', assistantId: 'a1' } });
  });
});
