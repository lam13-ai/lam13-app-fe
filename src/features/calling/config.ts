import type { Env } from '@/lib/env';
import type { CallingConfig } from './types';

/** Missing public Vapi settings, by variable NAME only (values are never surfaced). */
export type CallingConfigResult = { ok: true; config: CallingConfig } | { ok: false; missing: string[] };

export function resolveCallingConfig(vapi: Env['vapi']): CallingConfigResult {
  const missing = [
    !vapi.publicKey && 'VITE_VAPI_PUBLIC_KEY',
    !vapi.assistantId && 'VITE_VAPI_ASSISTANT_ID',
  ].filter((name): name is string => Boolean(name));
  if (missing.length > 0 || !vapi.publicKey || !vapi.assistantId) return { ok: false, missing };
  return { ok: true, config: { publicKey: vapi.publicKey, assistantId: vapi.assistantId } };
}
