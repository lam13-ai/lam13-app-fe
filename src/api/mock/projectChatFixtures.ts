import type { ProjectChat } from '@/types/api';

/**
 * DEMO DATA: the sample conversations inside the sample projects (workspace.ts), with their message
 * histories. They exist only in the frontend: both adapters serve them locally, so they open — and
 * reopen after a refresh — without a backend. Nothing here is sent to or saved by a server.
 */
export interface ProjectChatSeed {
  projectId: string;
  id: string;
  title: string;
  ageMs: number;
  turns: { user: string; assistant: string }[];
}

const HOUR = 3600e3;
const DAY = 24 * HOUR;

export const PROJECT_CHAT_SEEDS: ProjectChatSeed[] = [
  {
    projectId: 'water-security',
    id: 'ws-c1',
    title: 'Water security baseline',
    ageMs: 2 * HOUR,
    turns: [
      {
        user: 'Which year should we use as the baseline for the water security strategy, 2022 or 2023?',
        assistant:
          '**Recommendation: use 2022.**\n\nMetering coverage passed 80% in 2022, so it is the first year in which supply, demand and loss figures are measured rather than estimated. The 2023 data is more recent, but its audit is not finished.\n\n| Criterion | 2022 | 2023 |\n| --- | --- | --- |\n| Metering coverage | 81% | 86% |\n| Audited | Yes | In progress |\n| Regional breakdown | Complete | Two regions missing |\n\nSource: *Baseline Assessment 2022.pdf*, section 2. If the 2023 audit lands before June, it is worth re-running the comparison.',
      },
      {
        user: 'What are the three numbers leadership should remember from that baseline?',
        assistant:
          'From the 2022 baseline:\n\n1. **Supply gap: 14%** — demand exceeds sustainable supply in a normal year.\n2. **Network losses: 31%** — water treated but never billed, concentrated in three regions.\n3. **Storage cover: 9 days** — against a resilience target of 21.\n\nEach has an owner in the KPI framework except storage cover, which is still unassigned. I would flag that before the steering committee.',
      },
    ],
  },
  {
    projectId: 'water-security',
    id: 'ws-c2',
    title: 'Drafting KPIs for the 2030 targets',
    ageMs: 1 * DAY,
    turns: [
      {
        user: 'Draft a headline KPI set for the 2030 water security targets. Keep it to five.',
        assistant:
          '## Headline KPIs\n\n| KPI | Baseline (2022) | 2030 target | Owner |\n| --- | --- | --- | --- |\n| Non-revenue water | 31% | 18% | Utilities directorate |\n| Supply–demand gap | 14% | 0% | Planning |\n| Storage cover | 9 days | 21 days | *Unassigned* |\n| Reuse rate | 12% | 35% | Wastewater authority |\n| Service continuity | 19 h/day | 24 h/day | Utilities directorate |\n\nEach headline indicator should carry two diagnostic measures underneath, so a miss can be explained, not only reported.',
      },
      {
        user: 'Storage cover has no owner. Who should take it?',
        assistant:
          'Two realistic options:\n\n- **Planning** — owns the capital programme that builds storage, so it controls the main lever.\n- **Utilities directorate** — operates the reservoirs and reports the figure today.\n\nI would assign it to **Planning**, with Utilities responsible for the monthly data. The target moves only if new capacity is funded and built, and that decision sits with Planning.',
      },
    ],
  },
  {
    projectId: 'water-security',
    id: 'ws-c3',
    title: 'Stress-testing the 5-year roadmap',
    ageMs: 3 * DAY,
    turns: [
      {
        user: 'Stress-test the five-year delivery roadmap. Where is it most likely to slip?',
        assistant:
          'Three assumptions carry most of the risk:\n\n1. **Tariff reform in year 1.** The funding model depends on it, and the options paper has not been to cabinet.\n2. **Desalination capacity by year 3.** Procurement alone has taken 18–24 months on comparable projects.\n3. **Loss reduction of 3 points a year.** The best regional programme so far achieved 2.\n\nIf tariff reform slips by a year, roughly a third of the year-2 capital programme is unfunded.',
      },
      {
        user: 'What would you change in the plan to make it more robust?',
        assistant:
          '- **Sequence around the funding risk:** move the two initiatives that do not depend on tariff income into year 1.\n- **Start desalination procurement now**, in parallel with the feasibility work.\n- **Reset the loss target to 2 points a year** and treat a third point as stretch.\n- **Add a decision gate at month 9**: if tariff reform is not approved, the fallback plan is triggered instead of discovered.',
      },
    ],
  },
  {
    projectId: 'water-security',
    id: 'ws-c4',
    title: 'Board deck narrative',
    ageMs: 6 * DAY,
    turns: [
      {
        user: 'Outline the narrative for the board deck. Ten slides at most.',
        assistant:
          '1. **The decision we need today**\n2. The supply gap, in one chart\n3. Why it widens without action\n4. Three levers: reduce losses, add supply, manage demand\n5. What each lever delivers by 2030\n6. The five headline KPIs\n7. The roadmap and its decision gates\n8. Funding: the ask and what it depends on\n9. Top three risks and mitigations\n10. Next 90 days\n\nOpen with the decision, not the context: the board should know what it is being asked within the first minute.',
      },
      {
        user: 'Write the speaker note for slide 1.',
        assistant:
          '> "We are asking the board for two things today: approval of the 2030 targets, and a mandate to take tariff reform to cabinet this quarter. Everything else in this deck explains why those two decisions, taken now, close a 14% supply gap by 2030 — and what happens if they wait a year."',
      },
    ],
  },
  {
    projectId: 'ai-strategy',
    id: 'ai-c1',
    title: 'Building a national AI strategy',
    ageMs: 1 * DAY,
    turns: [
      {
        user: 'What should the pillars of the national AI strategy be?',
        assistant:
          '## Four pillars\n\n1. **Talent** — skills pipeline, from schools to senior specialists.\n2. **Compute and data** — shared infrastructure and governed access to public data.\n3. **Adoption in public services** — a small number of flagship use cases with measurable outcomes.\n4. **Governance and assurance** — rules, oversight and a way to test systems before deployment.\n\nWhat is *decided* so far is the scope: public-sector adoption first. The pillar structure itself is still a proposal.',
      },
      {
        user: 'Which pillar should we fund first?',
        assistant:
          '**Adoption in public services**, with governance alongside it.\n\nTwo or three visible use cases build the case for the larger talent and compute investments, and they force the governance questions to be answered on real systems. Funding compute first risks capacity nobody is ready to use.',
      },
    ],
  },
  {
    projectId: 'ai-strategy',
    id: 'ai-c2',
    title: 'Governance model options',
    ageMs: 4 * DAY,
    turns: [
      {
        user: 'Compare a central AI office with a federated model across ministries.',
        assistant:
          '| | Central office | Federated |\n| --- | --- | --- |\n| Speed of standards | Fast | Slow |\n| Fit to each ministry | Weaker | Strong |\n| Scarce expertise | Pooled | Spread thin |\n| Accountability | Clear | Diffuse |\n\nThe workshop leaned towards a **small central office with named ministry leads**: standards and assurance are set once, delivery stays with the ministries.',
      },
      {
        user: 'What are the first three things that office should do?',
        assistant:
          '1. Publish a short **assurance checklist** every public-sector AI project must pass.\n2. Create a **register of AI use cases** across ministries, so duplication is visible.\n3. Agree the **ministry leads** and a monthly forum, before hiring beyond a core team of five.',
      },
    ],
  },
  {
    projectId: 'digital-services',
    id: 'ds-c1',
    title: 'Digital services KPI framework',
    ageMs: 5 * DAY,
    turns: [
      {
        user: 'Propose a KPI framework for citizen-facing digital services.',
        assistant:
          '## Headline set\n\n| KPI | What it shows |\n| --- | --- |\n| Digital adoption | Share of transactions completed online |\n| Completion rate | Started vs finished without help |\n| Time to serve | Request to outcome, end to end |\n| Satisfaction | Rating at the end of the journey |\n\nPrefer outcomes over activity: "licences issued within 3 days" says more than "forms submitted". Every KPI needs a baseline, a target and a named data source.',
      },
      {
        user: 'How often should these be reported, and to whom?',
        assistant:
          '- **Monthly** to service owners: all four, by service.\n- **Quarterly** to the steering board: the headline set with trend and the three weakest services.\n- **Annually** in public: adoption and satisfaction.\n\nCompletion rate is the early-warning signal, so it is the one worth watching weekly during a launch.',
      },
    ],
  },
  {
    projectId: 'digital-services',
    id: 'ds-c2',
    title: 'Targets for the licensing service',
    ageMs: 8 * DAY,
    turns: [
      {
        user: 'Set first-year targets for the online business licensing service.',
        assistant:
          '| KPI | Baseline | Year-1 target |\n| --- | --- | --- |\n| Digital adoption | 38% | 60% |\n| Completion rate | 54% | 75% |\n| Time to serve | 11 days | 5 days |\n| Satisfaction | 3.4 / 5 | 4.0 / 5 |\n\nThe completion target matters most: nearly half of applicants abandon the form today, most of them at document upload.',
      },
      {
        user: 'What single change would move completion the most?',
        assistant:
          'Let applicants **save and return**, and accept a photo of a document instead of a certified scan at the upload step. In comparable services that step alone accounts for most abandonment, and removing it is cheaper than any redesign of the rest of the form.',
      },
    ],
  },
];

const DEMO_IDS = new Set(PROJECT_CHAT_SEEDS.map((s) => s.id));

/** A sample project conversation: served from local demo data, never from the backend. */
export const isDemoConversation = (id: string | null | undefined): id is string => Boolean(id && DEMO_IDS.has(id));

/** Each sample project's conversations, as the project lists them. */
export function demoProjectChats(now: number): Record<string, ProjectChat[]> {
  const byProject: Record<string, ProjectChat[]> = {};
  for (const seed of PROJECT_CHAT_SEEDS) {
    (byProject[seed.projectId] ??= []).push({
      id: seed.id,
      title: seed.title,
      preview: seed.turns.at(-1)?.user ?? '',
      updated_at: new Date(now - seed.ageMs).toISOString(),
    });
  }
  return byProject;
}
