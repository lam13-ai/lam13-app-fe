import type { Conversation, Message, ModelOption } from '@/types/api';

/** Seed data for the in-memory mock backend. Timestamps are relative to `now`. */

const MINUTE = 60_000;
const DAY = 86_400_000;

export const MOCK_MODELS: ModelOption[] = [
  { id: 'lam13', label: 'LAM13', efforts: ['low', 'medium', 'high'], default_effort: 'medium' },
];

interface Turn {
  user: string;
  assistant: string;
}

interface SeedConversation {
  id: string;
  title: string;
  ageMs: number;
  turns: Turn[];
}

const NATIONAL_AI_EARLIER: Turn[] = [
  'talent pipeline',
  'compute capacity',
  'public data access',
  'regulatory sandbox',
  'research funding',
  'SME adoption',
  'digital skills',
  'international partnerships',
  'procurement reform',
  'AI assurance',
  'cyber resilience',
  'impact measurement',
].map((topic, i) => ({
  user: `What should the ${topic} workstream prioritise?`,
  assistant: `**Workstream ${i + 1} — ${topic}.** Prioritise one flagship initiative with a named owner, a 12-month milestone, and a KPI the steering board reviews quarterly.`,
}));

const SEED: SeedConversation[] = [
  {
    id: 'national-ai-strategy',
    title: 'National AI strategy outline',
    ageMs: 25 * MINUTE,
    turns: [
      ...NATIONAL_AI_EARLIER,
      {
        user: 'Design a national AI strategy for a mid-sized economy.',
        assistant: `## How a National AI Strategy Is Structured

A credible national AI strategy for a mid-sized economy usually moves through five stages:

1. **Case for action:** Quantify the economic upside, the productivity gap to peers, and the cost of waiting.
2. **Strategic pillars:** Set three to five pillars — talent, compute and data, public sector adoption, industry uptake, and trustworthy AI.
3. **Evidence base:** Benchmark comparable economies, assess current readiness, and isolate the binding constraints.
4. **Initiative portfolio:** Phase initiatives from quick wins to long-term bets, each with an owner, budget, and KPI.
5. **Governance:** Assign a delivery unit, a cross-ministry steering board, and a quarterly review cadence.

Which country is this for, and where does it stand today on talent, compute, data access and regulation?`,
      },
      {
        user: 'Focus on public sector adoption first.',
        assistant: `## Public Sector Adoption: First 24 Months

Lead with a small number of high-volume, low-risk use cases that build capability and trust:

- **Citizen services:** Assisted drafting and triage for permits, benefits and tax enquiries.
- **Internal productivity:** Document summarisation and policy research for civil servants.
- **Enablers:** A shared model platform, procurement templates, and an AI assurance framework.

Should the roadmap assume a central AI platform, or ministry-led procurement?`,
      },
    ],
  },
  {
    id: 'growth-plan-stress-test',
    title: 'Stress-test 5-year growth plan',
    ageMs: 1 * DAY + 2 * 60 * MINUTE,
    turns: [
      {
        user: 'Stress-test our 5-year economic growth plan.',
        assistant: `## Stress-Testing a 5-Year Growth Plan

A rigorous stress-test evaluates the plan across five lenses:

1. **Logic integrity:** Do objectives, pillars and initiatives connect without overlap or gaps?
2. **Evidence validity:** Is the baseline current, and are the benchmarks genuinely comparable?
3. **Ambition realism:** Are targets grounded in a credible growth model?
4. **Delivery feasibility:** Can the institutions deliver the Phase 1 portfolio on time?
5. **Governance and risk:** Are owners, deadlines and escalation paths explicit?

| Fault line | Most common failure |
| --- | --- |
| Logic integrity | Overlapping pillars, or objectives framed as outputs rather than outcomes. |
| Evidence validity | Outdated data, weak benchmarks, or assumed pain points. |
| Ambition realism | Targets set without a methodology or sensitivity analysis. |
| Delivery feasibility | Too many Phase 1 initiatives with no prioritisation. |
| Governance and risk | A steering board exists, but owners and deadlines are missing. |

Which country is the plan for, and is its primary goal diversification or headline GDP growth?`,
      },
    ],
  },
  {
    id: 'digital-services-roadmap',
    title: 'Digital services roadmap',
    ageMs: 3 * DAY,
    turns: [
      {
        user: 'Sequence a digital public services roadmap for the next three years.',
        assistant: `## Three-Year Digital Services Roadmap

1. **Year 1 — Foundations:** Digital identity, a shared payments layer, and a service standard.
2. **Year 2 — Top 20 journeys:** Redesign the highest-volume citizen journeys end to end.
3. **Year 3 — Proactive services:** Life-event bundles triggered by data the state already holds.

Each journey should expose a \`service_status\` endpoint so performance is visible on the public dashboard:

\`\`\`json
{ "service": "renew-passport", "median_days": 6, "digital_uptake": 0.82 }
\`\`\`

See the [GOV.UK Service Standard](https://www.gov.uk/service-manual/service-standard) for a proven reference. Do you want the roadmap costed, or sequenced by citizen impact first?`,
      },
    ],
  },
  {
    id: 'health-reform-board-deck',
    title: 'Board deck: health reform',
    ageMs: 12 * DAY,
    turns: [
      {
        user: 'Turn the health reform strategy into board-ready slides.',
        assistant: `## Proposed Slide Narrative

A 10-slide storyline that leads with the decision the board needs to make:

1. **The ask:** Approve Phase 1 funding and the delivery governance model.
2. **Why now:** Demand growth, workforce gaps, and the cost of inaction.
3. **The reform in one page:** Three pillars, eight initiatives, one outcome framework.
4. **Roadmap and risks:** Sequencing, dependencies, and mitigations.

Should the deck follow your organisation's template, or the Lam13 strategy layouts?`,
      },
    ],
  },
  {
    id: 'water-security-kpis',
    title: 'Water security KPIs',
    ageMs: 41 * DAY,
    turns: [
      {
        user: 'Propose KPIs for a national water security strategy.',
        assistant: `## Water Security KPI Set

Keep the headline set small and outcome-focused:

| KPI | Definition | Direction |
| --- | --- | --- |
| Non-revenue water | Share of treated water lost before reaching customers. | Decrease |
| Supply resilience | Days of demand covered by storage during drought. | Increase |
| Reuse rate | Treated wastewater reused for agriculture or industry. | Increase |

Do you have a 2025 baseline for each indicator?`,
      },
    ],
  },
];

export interface MockSeed {
  conversations: Conversation[];
  messages: Map<string, Message[]>;
}

export function createSeed(now: number): MockSeed {
  const conversations: Conversation[] = [];
  const messages = new Map<string, Message[]>();

  for (const seed of SEED) {
    const updatedAt = now - seed.ageMs;
    const list: Message[] = [];
    // Space turns 2 minutes apart, ending at the conversation's updated_at.
    seed.turns.forEach((turn, i) => {
      const at = updatedAt - (seed.turns.length - 1 - i) * 2 * MINUTE;
      const base = { conversation_id: seed.id, kind: 'text' as const, audio: null, call: null, status: 'complete' as const };
      list.push(
        { ...base, id: `${seed.id}-u${i}`, client_message_id: null, role: 'user', content: turn.user, created_at: new Date(at - 30_000).toISOString() },
        { ...base, id: `${seed.id}-a${i}`, client_message_id: null, role: 'assistant', content: turn.assistant, created_at: new Date(at).toISOString() },
      );
    });

    const last = seed.turns.at(-1);
    conversations.push({
      id: seed.id,
      title: seed.title,
      created_at: new Date(updatedAt - seed.turns.length * 2 * MINUTE).toISOString(),
      updated_at: new Date(updatedAt).toISOString(),
      last_message_preview: last ? last.user.slice(0, 80) : null,
    });
    messages.set(seed.id, list);
  }

  return { conversations, messages };
}
