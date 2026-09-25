import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useScroll, useTransform } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { ThinkingOrb } from "thinking-orbs";
import { useIsMobile } from "@/hooks/use-mobile";
import { PromptInput } from "@/components/ui/ai-chat-input";
import Eyebrow from "./Eyebrow";
import Reveal from "./Reveal";
import Spark from "./Spark";

interface ChatMsg {
  kind: "assistant" | "user";
  text: string;
}

const GREETING = "Ask me to design, stress-test, or package a strategy.";

/* Scripted demo — each question gets its own tailored static answer. */
interface Suggestion {
  chip: string;
  query: string;
  answer: string;
  answerMobile: string;
}

const suggestions: Suggestion[] = [
  {
    chip: "Design a national AI strategy",
    query: "Design a national AI strategy for a mid-sized economy.",
    answer: `## How a National AI Strategy Is Structured

A strong national AI strategy typically follows five stages:

1. **The Case for AI:** Define national urgency, economic opportunity, security implications, and the cost of inaction.
2. **The Framework:** Establish strategic pillars, cross-cutting enablers, and clear national objectives.
3. **The Evidence Base:** Benchmark leading countries, assess current readiness, and identify priority gaps.
4. **The Action Plan:** Develop phased initiatives, from quick wins to long-term investments, supported by measurable KPIs.
5. **Governance and Execution:** Assign stakeholders, decision-making bodies, owners, timelines, and accountability.

Which country is this for, what is its current AI maturity, and are you targeting a 3-year, 5-year, or 10-year strategy? Would you like to begin with the framework, the case for AI, or country benchmarking?`,
    answerMobile: `A strong national AI strategy follows five stages:

1. **The Case for AI** — urgency and opportunity.
2. **The Framework** — pillars and objectives.
3. **The Evidence Base** — benchmarks and gaps.
4. **The Action Plan** — phased initiatives and KPIs.
5. **Governance** — owners and accountability.

Which country, and a 3-, 5- or 10-year horizon?`,
  },
  {
    chip: "Stress-test a 5-year growth plan",
    query: "Stress-test our 5-year economic growth plan.",
    answer: `## Stress-Testing a 5-Year Economic Growth Plan

A rigorous stress-test evaluates the plan across five critical fault lines:

1. **Logic Integrity:** Confirm the problem remains relevant and the objectives, pillars, and enablers are complete, distinct, and outcome-focused.
2. **Evidence Validity:** Verify current baseline data, relevant country benchmarks, and pain points supported by clear evidence.
3. **Ambition Realism:** Test KPI baselines, target-setting methods, and whether the required growth rates have credible precedent.
4. **Delivery Feasibility:** Prioritize initiatives by impact and feasibility, identify quick wins, and validate funding, dependencies, and phasing.
5. **Governance and Risk:** Confirm decision-making authority, clear ownership, dated actions, and practical risk mitigation.

| Fault Line | Most Common Failure |
| --- | --- |
| Logic integrity | Overlapping pillars or objectives focused on outputs rather than outcomes |
| Evidence validity | Outdated data, weak benchmarks, or assumed pain points |
| Ambition realism | Targets set without credible methodology or growth-rate validation |
| Delivery feasibility | Too many Phase 1 initiatives with no prioritization |
| Governance and risk | Governance exists, but owners, deadlines, and activation are missing |

Which country is the plan for, and is its primary focus exports, FDI, productivity, or diversification? Do you have the plan available for review, or should we build the stress-test framework first?`,
    answerMobile: `A rigorous stress-test covers five fault lines:

1. **Logic Integrity** — outcome-focused objectives.
2. **Evidence Validity** — current data, real benchmarks.
3. **Ambition Realism** — targets with credible precedent.
4. **Delivery Feasibility** — prioritized, funded, phased.
5. **Governance and Risk** — owners, deadlines, mitigation.

Which country, and what's the focus — exports, FDI, productivity or diversification?`,
  },
  {
    chip: "Turn this into board slides",
    query: "Turn our strategy into board-ready PowerPoint slides.",
    answer: `## Turning Strategy into Board-Ready Slides

Our work focuses on strategy substance: strong logic, evidence, priorities, and execution. The slides translate that substance into a clear executive narrative.

A national strategy board deck typically contains **12 to 18 slides** across four acts:

1. **The Case:** Explain the urgency, quantify the cost of inaction, and define success.
2. **The Evidence:** Present the baseline, relevant benchmarks, and priority gaps.
3. **The Plan:** Show the strategic framework, phased initiatives, owners, and KPI targets.
4. **Execution:** Define governance, risks, accountability, and immediate decisions required.

| Principle | What It Means in Practice |
| --- | --- |
| **One idea per slide** | Each slide communicates one clear insight |
| **Pyramid structure** | Present the conclusion before supporting evidence |
| **No orphan data** | Connect every figure to a decision or recommendation |
| **Action-focused close** | End with a specific approval or decision request |
| **Visual over text** | Use diagrams, roadmaps, and scorecards instead of dense paragraphs |

The strongest value comes from making the content airtight before refining the presentation. Which strategy are we converting into board slides: the national AI strategy or the economic growth plan? Who is the audience, and what decision should they make?`,
    answerMobile: `A board deck runs **12–18 slides** across four acts:

1. **The Case** — urgency and cost of inaction.
2. **The Evidence** — baseline, benchmarks, gaps.
3. **The Plan** — framework, initiatives, KPIs.
4. **Execution** — governance and decisions required.

Which strategy are we converting, and who's the audience?`,
  },
];

/* fallback for free-typed questions */
const ANSWER = `Good question — here's how I'd approach it:

•  Frame the objective and the two or three decisions that actually matter.
•  Benchmark against comparable programmes to set a credible ambition.
•  Sequence initiatives into quick wins, structural bets and enablers.
•  Define owners, KPIs and a governance cadence to sustain momentum.

Tell me the sector and constraints and I'll turn this into a board-ready storyline.`;

const ANSWER_MOBILE = `Good question — here's how I'd approach it:

•  Frame the objective and benchmark peer programmes.
•  Sequence initiatives, then set owners and KPIs.

Tell me the sector and I'll draft the storyline.`;

const wait = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

type Phase = null | "thinking" | "solving" | "answering";

const phaseUi: Record<Exclude<Phase, null>, { orb: "working" | "solving" | "composing"; label: string }> = {
  thinking: { orb: "working", label: "Thinking…" },
  solving: { orb: "solving", label: "Solving…" },
  answering: { orb: "composing", label: "Answering…" },
};

const ChatWindow = () => {
  const reduced = false; // animations always on — iOS Reduce Motion must not kill the site
  const isMobile = useIsMobile();
  const [msgs, setMsgs] = useState<ChatMsg[]>([{ kind: "assistant", text: GREETING }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>(null);
  /** blank space below the newest turn so it can always scroll to the top,
   *  the way ChatGPT reserves room for the answer */
  const [spacer, setSpacer] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { once: true, margin: "-15% 0px" });
  const bodyRef = useRef<HTMLDivElement>(null);
  const lastQueryRef = useRef<HTMLDivElement>(null);
  const aliveRef = useRef(true);
  const attractStoppedRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // the auto-demo never stops — user interaction must not interrupt the flow

  /** ChatGPT-style: each new query scrolls to the top of the window; the answer
   *  grows below it and earlier turns stay above, reachable by scrolling up.
   *  Nothing ever forces the scroll position after this, so the user can read
   *  back freely while the answer streams. */
  const pinQueryToTop = () => {
    // double rAF: wait for React to commit the new message before measuring
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const c = bodyRef.current;
        const el = lastQueryRef.current;
        if (!c || !el) return;
        // reserve room below the turn so it can reach the top even before
        // the answer has streamed in
        setSpacer(Math.max(0, c.clientHeight - el.offsetHeight - 34));
        requestAnimationFrame(() => {
          const top = el.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop - 10;
          c.scrollTo({ top, behavior: "smooth" });
        });
      })
    );
  };

  /** Stream the canned answer — one animation frame per chunk, so the text
   *  flows at the display's refresh rate with no timer jitter. */
  const streamAnswer = (q: string) =>
    new Promise<void>((resolve) => {
      const match = suggestions.find((s) => s.query === q);
      const answer = match ? (isMobile ? match.answerMobile : match.answer) : isMobile ? ANSWER_MOBILE : ANSWER;
      setMsgs((prev) => [...prev, { kind: "assistant", text: "" }]);
      let i = 0;
      const step = () => {
        if (!aliveRef.current) return resolve();
        i += 3;
        const slice = answer.slice(0, i);
        setMsgs((prev) => {
          const next = [...prev];
          next[next.length - 1] = { kind: "assistant", text: slice };
          return next;
        });
        if (i >= answer.length) return resolve();
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });

  const send = async (raw: string) => {
    const q = raw.trim();
    if (!q || busy) return;
    setBusy(true);
    setInput("");
    // the greeting belongs to the empty state — drop it once a real conversation starts
    setMsgs((prev) => [
      ...prev.filter((m) => !(m.kind === "assistant" && m.text === GREETING)),
      { kind: "user", text: q },
    ]);
    pinQueryToTop();
    // agent works through its states before the answer: think → solve → answer
    setPhase("thinking");
    await wait(reduced ? 150 : 1400);
    if (!aliveRef.current) return;
    setPhase("solving");
    await wait(reduced ? 150 : 1500);
    if (!aliveRef.current) return;
    setPhase("answering");
    await streamAnswer(q);
    setPhase(null);
    setBusy(false);
    // shrink the reserved space to whatever the answer didn't fill
    requestAnimationFrame(() => {
      const c = bodyRef.current;
      const el = lastQueryRef.current;
      if (!c || !el) return;
      const queryTop = el.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop;
      setSpacer((prev) => Math.max(0, c.clientHeight - (c.scrollHeight - prev - queryTop)));
    });
  };

  /** Idle attract loop: full demo — each query types into the input, sends,
   *  the answer streams; after all three the log resets and the cycle repeats.
   *  Any real user interaction stops it. */
  useEffect(() => {
    if (reduced || !inView) return;
    let cancelled = false;
    const stopped = () => cancelled || !aliveRef.current || attractStoppedRef.current;
    (async () => {
      await wait(1600);
      while (!stopped()) {
        setMsgs([{ kind: "assistant", text: GREETING }]);
        setSpacer(0);
        await wait(600);
        for (const s of suggestions) {
          if (stopped()) return;
          // type the question into the box
          for (let c = 0; c < s.query.length; c++) {
            if (stopped()) return;
            setInput(s.query.slice(0, c + 1));
            await wait(24);
          }
          await wait(350);
          if (stopped()) return;
          // send it — phases run, the answer streams
          await send(s.query);
          await wait(2800);
        }
        // full demo done — pause ~6s before the loop restarts
        await wait(6000);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, inView]);

  const emptyState = msgs.length === 1 && msgs[0].kind === "assistant" && msgs[0].text === GREETING;

  return (
    <div ref={rootRef} className="text-foreground font-display flex flex-col h-[80vh] supports-[height:1dvh]:h-[80dvh] min-h-[520px] bg-white">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-foreground/10 shrink-0">
        <span className="w-[36px] h-[36px] [background:var(--gradient-accent)] flex items-center justify-center shrink-0">
          <Spark size={17} className="text-white" />
        </span>
        <div className="min-w-0">
          <div className="text-[13.5px] font-bold whitespace-nowrap">Lam13 Strategy Agent</div>
          <div className="hidden sm:block text-[11px] text-muted-foreground">Agentic reasoning • public sector</div>
        </div>
        <span className="ml-auto text-[11px] text-muted-foreground flex items-center gap-2">
          {phase ? (
            <ThinkingOrb state={phaseUi[phase].orb} size={20} theme="light" aria-label={phaseUi[phase].label} />
          ) : busy ? (
            <ThinkingOrb state="listening" size={20} theme="light" aria-label="Listening" />
          ) : (
            <ThinkingOrb state="breathing" size={20} theme="light" aria-label="Online" />
          )}
          {phase ? phaseUi[phase].label : busy ? "Listening…" : "Online"}
        </span>
      </div>

      <div
        ref={bodyRef}
        className="p-5 flex flex-col gap-2.5 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="log"
        aria-live="polite"
        aria-label="Chat with the Lam13 strategy agent"
      >
        {emptyState ? (
          <div className="m-auto flex flex-col items-center gap-5 text-center px-6">
            <ThinkingOrb state="listening" size={64} theme="light" aria-label="Agent listening" />
            <p className="text-[14px] text-muted-foreground max-w-[34ch] leading-relaxed">{GREETING}</p>
          </div>
        ) : (
          msgs.map((m, i) => (
            <motion.div
              key={`${m.kind}-${i}`}
              ref={m.kind === "user" && i === msgs.map((x) => x.kind).lastIndexOf("user") ? lastQueryRef : undefined}
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className={
                m.kind === "user"
                  ? "self-end bg-foreground text-background px-4 py-2.5 max-w-[85%] md:max-w-[60%] text-[13px] leading-relaxed"
                  : "self-start w-full text-foreground text-[13.5px] leading-relaxed py-1 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_li]:mb-1.5 [&_h2]:font-display [&_h2]:font-bold [&_h2]:text-[16px] [&_h2]:mb-3 [&_table]:w-full [&_table]:my-3 [&_table]:border-collapse [&_table]:text-[12.5px] [&_th]:border [&_th]:border-foreground/15 [&_th]:bg-black/[0.04] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-bold [&_td]:border [&_td]:border-foreground/15 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top"
              }
            >
              {m.kind === "assistant" ? (
                m.text ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{m.text}</ReactMarkdown>
                ) : (
                  <ThinkingOrb state="composing" size={20} theme="light" aria-label="Answering" />
                )
              ) : (
                m.text
              )}
            </motion.div>
          ))
        )}
        {(phase === "thinking" || phase === "solving") && (
          <motion.div
            key={phase}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="self-start flex items-center gap-2.5 border border-foreground/15 bg-black/[0.03] px-4 py-2.5"
          >
            <ThinkingOrb state={phaseUi[phase].orb} size={20} theme="light" aria-label={phaseUi[phase].label} />
            <span className="text-[12.5px] text-muted-foreground">{phaseUi[phase].label}</span>
          </motion.div>
        )}
        {!emptyState && spacer > 0 && <div style={{ height: spacer }} className="shrink-0" aria-hidden="true" />}
      </div>

      {/* prompt input hides while the agent answers, returns when it's done */}
      <AnimatePresence initial={false}>
        {!busy && (
          <motion.div
            key="prompt"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="shrink-0 overflow-hidden"
          >
            <div className="flex justify-center px-4 pt-2 pb-4">
              <PromptInput
                value={input}
                onChange={setInput}
                onSubmit={(v) => send(v)}
                placeholder={isMobile ? "Ask Lam13 anything…" : "Ask about public sector strategy…"}
                models={["LAM13"]}
                collapsedMaxWidth={520}
                expandedMaxWidth={760}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const DemoPanel = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const reduced = false; // animations always on — iOS Reduce Motion must not kill the site
  const isMobile = useIsMobile();
  // scroll-open: as the section scrolls in from the hero, the chat panel
  // expands from a centred card to (nearly) full viewport width
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 0.95", "start 0.25"],
  });
  const panelWidth = useTransform(scrollYProgress, [0, 1], isMobile ? ["88%", "93%"] : ["62%", "80%"]);
  const panelOpacity = useTransform(scrollYProgress, [0, 0.25], [0.35, 1]);

  return (
  <section id="chatbot" ref={sectionRef} className="py-24 bg-[#F7F8FA] border-y border-foreground/10 overflow-hidden" aria-labelledby="demo-h">
    <div className="max-w-[1200px] mx-auto px-6">
      <div className="max-w-[720px] mx-auto text-center mb-14">
        <Reveal className="flex justify-center">
          <Eyebrow center>Live demo</Eyebrow>
        </Reveal>
        <Reveal delay={0.08}>
          <h2
            id="demo-h"
            className="font-display text-[clamp(1.7rem,3.4vw,2.7rem)] mt-4 lg:whitespace-nowrap lg:w-max lg:relative lg:left-1/2 lg:-translate-x-1/2"
          >
            It reasons like your best strategist.
          </h2>
        </Reveal>
        <Reveal delay={0.16}>
          <p className="text-muted-foreground mt-4 text-[17px]">
            Ask anything. Lam13 thinks step by step, then delivers structured, board-ready output — the part that
            actually matters.
          </p>
        </Reveal>
      </div>
    </div>

    <div className="flex justify-center">
      <motion.div
        style={reduced ? undefined : { width: panelWidth, opacity: panelOpacity }}
        className="w-full min-w-[320px] rounded-xl shadow-[0_30px_70px_-35px_rgba(0,0,0,0.35)]"
      >
        <div className="rounded-xl overflow-hidden border border-foreground/20">
          <ChatWindow />
        </div>
      </motion.div>
    </div>

  </section>
  );
};

export default DemoPanel;
