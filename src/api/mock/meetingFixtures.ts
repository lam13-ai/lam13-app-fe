import type { Meeting, MeetingParticipant } from '@/types/api';

/**
 * Local meetings for the Meetings workspace until the backend has meeting routes. Dates are relative to
 * `now` so the list always looks recent. The set deliberately varies: every section, summary only, long
 * notes, action items only, notes only, a 1:1, and a meeting with no sections at all.
 */

const people = {
  hannah: { id: 'mp_hannah', name: 'Hannah Lee', email: 'hannah@lam13.ai', role: 'Chief of Staff, Lam13' },
  saqlain: { id: 'mp_saqlain', name: 'Saqlain Haider', email: 'saqlain@northwind.example', role: 'Product Manager, Northwind Labs' },
  maya: { id: 'mp_maya', name: 'Maya Okafor', email: 'maya.okafor@civictech.example', role: 'Director of Digital Services, Civic Technology Office' },
  daniel: { id: 'mp_daniel', name: 'Daniel Brandt', email: 'dbrandt@harborfinch.example', role: 'CFO, Harbor & Finch Capital' },
  priya: { id: 'mp_priya', name: 'Priya Raman', role: 'Head of Data Platforms, Meridian Health' },
  tomas: { id: 'mp_tomas', name: 'Tomás Alvarez', role: 'Partner, Alvarez Strategy Group' },
  omar: { id: 'mp_omar', name: 'Omar Siddiqui', role: 'Programme Director, Ministry of Water' },
  lena: { id: 'mp_lena', name: 'Lena Fischer' },
} satisfies Record<string, MeetingParticipant>;

const LONG_NOTES = `## Context
The ministry wants a single KPI set for the national water security strategy before the budget round. Three agencies report today, each with its own definitions.

## Current state
- **Non-revenue water** is reported quarterly, but two regions still estimate it from billing gaps rather than metering.
- **Supply resilience** has no agreed definition; the utilities use days of storage, the ministry uses drought-year yield.
- **Reuse** is tracked only for agriculture; industrial reuse is not measured at all.

## Discussion
Omar stressed that ministers need **five headline indicators at most**, with the rest kept as diagnostic measures underneath. Priya offered the Meridian data platform pattern: one governed metric catalogue, owners per metric, and automated freshness checks.

Tomás questioned whether 2025 can serve as the baseline year, given the drought. The group agreed to test both 2023 and 2025 and show the difference to the steering board rather than choose now.

## Risks
1. Regional utilities may resist metering targets without capital funding attached.
2. The data-sharing agreement between agencies expires in March.
3. A 2025 baseline would flatter every trend line.

## Next session
Walk through the draft catalogue metric by metric, with each proposed owner in the room.`;

export function createMeetingSeed(now: number): Meeting[] {
  const ago = (hours: number) => new Date(now - hours * 3_600_000).toISOString();
  return [
    {
      id: 'mtg_product_strategy',
      title: 'Product strategy review',
      started_at: ago(2),
      duration_seconds: 50 * 60,
      participants: [people.hannah, people.saqlain, people.lena, people.tomas],
      summary:
        'Reviewed the Q4 roadmap against the three strategic bets. The team agreed to narrow the pilot to two public-sector clients and to postpone the self-serve tier until the onboarding flow is proven.',
      decisions: [
        'Pilot with two public-sector clients only in Q4.',
        'Self-serve tier moves to Q1, pending onboarding results.',
        'Weekly product review moves to Tuesdays.',
      ],
      action_items: [
        { id: 'ai_1', text: 'Draft the pilot success criteria and circulate them.', assignee: 'Saqlain Haider' },
        { id: 'ai_2', text: 'Confirm the two pilot clients.', assignee: 'Hannah Lee', completed: true },
        { id: 'ai_3', text: 'Share the onboarding funnel data from September.', assignee: 'Lena Fischer' },
      ],
      notes:
        'Tomás pushed for a sharper story on **why now**. Lena will bring funnel data so the self-serve decision is grounded in numbers rather than intuition.',
    },
    {
      id: 'mtg_budget_sync',
      title: 'Budget sync with Harbor & Finch',
      started_at: ago(26),
      duration_seconds: 30 * 60,
      participants: [people.hannah, people.daniel],
      summary:
        'Daniel confirmed the fund can bridge the programme through March if the milestone plan is signed off this month. He wants the cost model split by workstream before the next board.',
    },
    {
      id: 'mtg_water_kpis',
      title: 'National water security KPI workshop',
      started_at: ago(50),
      duration_seconds: 95 * 60,
      participants: [people.hannah, people.omar, people.priya, people.tomas, people.maya, people.lena],
      summary:
        'Working session to converge on one KPI set for the national water security strategy. The group agreed on five headline indicators with diagnostic measures underneath, and on testing two baseline years before choosing one.',
      decisions: [
        'Five headline KPIs at most; everything else becomes a diagnostic measure.',
        'Each metric gets a named owner and a published definition.',
        'Show the steering board both a 2023 and a 2025 baseline before choosing.',
      ],
      action_items: [
        { id: 'ai_4', text: 'Draft the metric catalogue with definitions and owners.', assignee: 'Priya Raman' },
        { id: 'ai_5', text: 'Model the 2023 vs 2025 baseline difference for each headline KPI.', assignee: 'Tomás Alvarez' },
        { id: 'ai_6', text: 'Start renewing the inter-agency data-sharing agreement.', assignee: 'Omar Siddiqui' },
        { id: 'ai_7', text: 'Book the catalogue walkthrough with every metric owner.', assignee: 'Hannah Lee' },
      ],
      notes: LONG_NOTES,
    },
    {
      id: 'mtg_digital_services',
      title: 'Digital services roadmap check-in',
      started_at: ago(74),
      duration_seconds: 25 * 60,
      participants: [people.maya, people.hannah, people.saqlain],
      summary: 'Quick check on the citizen identity rollout. The login redesign is on track; the payments integration slips by two weeks.',
      action_items: [
        { id: 'ai_8', text: 'Send the revised payments timeline to the minister’s office.', assignee: 'Maya Okafor' },
        { id: 'ai_9', text: 'Review the accessibility audit findings.' },
      ],
    },
    {
      id: 'mtg_priya_1on1',
      title: 'Priya / Hannah 1:1',
      started_at: ago(6 * 24 + 3),
      duration_seconds: 45 * 60,
      participants: [people.hannah, people.priya],
      notes:
        '- Priya is open to a shared data governance playbook across Meridian and the ministry work.\n- She would like an intro to Omar before the catalogue walkthrough.\n- Follow up after the Meridian board on the 14th.',
    },
    {
      id: 'mtg_board_prep',
      title: 'Board deck: health reform narrative',
      started_at: ago(9 * 24 + 5),
      duration_seconds: 60 * 60,
      participants: [people.hannah, people.tomas, people.daniel, people.lena, people.priya],
      summary:
        'Shaped the storyline for the health reform board deck: start from patient outcomes, then the funding gap, then the three reform options.',
      decisions: ['Lead with patient outcomes, not cost.', 'Present three options with a clear recommendation.'],
    },
    {
      id: 'mtg_intro_call',
      title: 'Intro call — Alvarez Strategy Group',
      started_at: ago(15 * 24 + 1),
      duration_seconds: 20 * 60,
      participants: [people.hannah, people.tomas],
    },
  ];
}
