import type { Effort } from '@/types/api';

export const AGENT_NAME = 'Lam13 Strategy Agent';
export const AGENT_TAGLINE = 'Agentic reasoning • public sector';

export const EFFORT_LABELS: Record<Effort, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const SUGGESTED_PROMPTS = [
  'Design a national AI strategy',
  'Stress-test a 5-year growth plan',
  'Draft KPIs for digital services',
  'Outline a board-ready slide narrative',
];
