/**
 * Deterministic "model" for the mock backend: picks a board-ready Markdown template by topic.
 * `variant` changes the framing so regenerated answers differ.
 */

const FRAMINGS = [
  'Here is a structured starting point',
  'A sharper way to frame this',
  'An alternative, delivery-first view',
];

function topicOf(prompt: string): string {
  const cleaned = prompt
    .replace(/\/(error|fail)\b/g, '')
    .replace(/[?.!]+$/g, '')
    .trim();
  return cleaned.length > 70 ? `${cleaned.slice(0, 67)}…` : cleaned || 'your question';
}

/** Short conversation title from the first prompt (backend auto-title). */
export function deriveTitle(prompt: string): string {
  const words = topicOf(prompt).replace(/…$/, '').split(/\s+/).slice(0, 6).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function composeReply(prompt: string, variant = 0): string {
  const topic = topicOf(prompt);
  const framing = FRAMINGS[variant % FRAMINGS.length];
  const p = prompt.toLowerCase();

  if (/\b(kpi|kpis|metric|metrics|indicator|measure)\b/.test(p)) {
    return `## Proposed KPI Framework

${framing} for **${topic}**. Keep the headline set small, outcome-focused, and owned:

| KPI | Definition | Target direction |
| --- | --- | --- |
| Adoption | Share of eligible users completing the journey digitally. | Increase |
| Time to outcome | Median days from request to resolution. | Decrease |
| Satisfaction | Post-journey satisfaction score (1–5). | Increase |
| Cost to serve | Fully loaded cost per completed transaction. | Decrease |

1. **Baseline first:** Measure each KPI for one quarter before setting targets.
2. **One owner per KPI:** Named at director level, reviewed quarterly.
3. **Publish progress:** A public dashboard builds trust and accountability.

Which of these indicators already has reliable data today?`;
  }

  if (/\b(slide|slides|deck|board|presentation)\b/.test(p)) {
    return `## Board-Ready Slide Narrative

${framing} for **${topic}** — a storyline that leads with the decision:

1. **The ask:** The single decision the board must take, stated on slide one.
2. **Why now:** Three facts that make delay costly.
3. **The plan on a page:** Pillars, flagship initiatives, and outcomes.
4. **Roadmap:** Phasing across 24 months with clear gates.
5. **Risks and mitigations:** The top five, each with an owner.
6. **Resourcing:** Budget envelope and delivery capacity.

Should the deck follow your organisation's template, or the Lam13 strategy layouts?`;
  }

  if (/\b(api|json|schema|data model|code)\b/.test(p)) {
    return `## Data Contract Sketch

${framing} for **${topic}**. Start with a minimal, versioned record so every agency reports the same way:

\`\`\`json
{
  "initiative_id": "INIT-042",
  "pillar": "public-sector-adoption",
  "status": "on_track",
  "kpi": { "name": "digital_uptake", "baseline": 0.41, "target": 0.75 }
}
\`\`\`

- **Version it:** Add a \`schema_version\` field from day one.
- **Validate at the edge:** Reject malformed submissions before they reach the dashboard.
- **Document it:** Publish the schema alongside examples.

Who will own the schema once it is live?`;
  }

  if (/\b(stress|risk|risks|test|review|assess)\b/.test(p)) {
    return `## Stress-Test Summary

${framing} for **${topic}**. Test it across four lenses:

1. **Logic:** Do objectives, pillars and initiatives connect without overlap?
2. **Evidence:** Is the baseline current and the benchmark set comparable?
3. **Feasibility:** Can institutions deliver the first-year portfolio?
4. **Governance:** Are owners, deadlines and escalation paths explicit?

| Lens | Red flag |
| --- | --- |
| Logic | Objectives framed as outputs rather than outcomes. |
| Evidence | Benchmarks older than three years. |
| Feasibility | More than eight Phase 1 initiatives. |
| Governance | No named owner for cross-cutting risks. |

Share the current draft and I will mark each red flag against it.`;
  }

  return `## Strategic Response

${framing} for **${topic}**.

1. **Define the outcome:** State the change you want to see in three years, in one measurable sentence.
2. **Diagnose the gap:** Benchmark against two or three comparable peers and isolate the binding constraints.
3. **Choose the pillars:** Three to five priorities, each with a flagship initiative and an owner.
4. **Phase delivery:** Quick wins in the first 6 months, structural reforms over 24 months.
5. **Govern and measure:** A steering board, a quarterly review cadence, and a small KPI set.

For comparable examples, the [OECD AI Policy Observatory](https://oecd.ai/en/dashboards/overview) tracks national strategies. What constraints — budget, timeline, or mandate — should shape the plan?`;
}
