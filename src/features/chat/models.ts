import type { Brand } from '@/components/BrandLogo';

/**
 * The model choices shown in the composer, grouped by provider.
 * TODO(backend): UI only — a sample catalogue. There is no model-switching endpoint, so the choice is
 * kept in the UI and every message is still answered by Lam's own backend model. Replace with the real list.
 */
export interface AssistantModel {
  id: string;
  name: string;
  /** One short line on what the model is for. */
  note?: string;
}

export interface ModelProvider {
  id: string;
  name: string;
  /** Third-party logo; absent for Lam (its own sparkle). */
  brand?: Brand;
  models: AssistantModel[];
}

export const DEFAULT_MODEL_ID = 'lam';

export const MODEL_PROVIDERS: ModelProvider[] = [
  { id: 'lam', name: 'Lam', models: [{ id: 'lam', name: 'Lam', note: 'Default · tuned for strategy work' }] },
  {
    id: 'openai',
    name: 'OpenAI',
    brand: 'openai',
    models: [
      { id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol' },
      { id: 'gpt-6-astra', name: 'GPT-6 Astra' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    brand: 'anthropic',
    models: [
      { id: 'claude-opus-5.5', name: 'Claude Opus 5.5' },
      { id: 'claude-sonnet-5.5', name: 'Claude Sonnet 5.5' },
      { id: 'claude-fable-5.1', name: 'Claude Fable 5.1' },
    ],
  },
  {
    id: 'google',
    name: 'Google',
    brand: 'google',
    models: [
      { id: 'gemini-3.8-pro', name: 'Gemini 3.8 Pro' },
      { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
    ],
  },
  { id: 'moonshot', name: 'Moonshot AI', brand: 'moonshot', models: [{ id: 'kimi-k3', name: 'Kimi K3' }] },
  { id: 'zai', name: 'Z.ai', brand: 'zai', models: [{ id: 'glm-5.3', name: 'GLM 5.3' }] },
];

/** The model with `id` and its provider; Lam when the id is unknown. */
export function findModel(id: string): { provider: ModelProvider; model: AssistantModel } {
  for (const provider of MODEL_PROVIDERS) {
    const model = provider.models.find((m) => m.id === id);
    if (model) return { provider, model };
  }
  return { provider: MODEL_PROVIDERS[0]!, model: MODEL_PROVIDERS[0]!.models[0]! };
}
