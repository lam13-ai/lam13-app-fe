import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "framer-motion";
import { Landmark } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import AIMessage from "@/components/ui/ai-message";
import { PromptInput } from "@/components/ui/ai-chat-input";
import Eyebrow from "./Eyebrow";
import Reveal from "./Reveal";

const STRATEGY_QUERY = "How should we structure a five-year economic diversification strategy?";

const STRATEGY_RESPONSE =
  "A strong diversification strategy starts by identifying current economic dependencies and the sectors with the greatest growth potential. I would structure it around priority industries, investment, workforce readiness, exports, and delivery governance. Which country is this for, and is the primary goal job creation, export growth, or reduced reliance on one sector?";

/** Recreated strategy slides for the PowerPoint demo — consulting-grade
 *  structures with generic content (no client material). */
const SlideShell = ({ title, page, children }: { title: React.ReactNode; page: number; children: React.ReactNode }) => (
  <div className="absolute inset-0 bg-white flex flex-col px-4 pt-3 pb-2 text-left select-none">
    <p className="font-body font-bold text-[11px] leading-[1.25] text-[#1E3FBF] max-w-[92%]">{title}</p>
    <div className="flex-1 min-h-0 mt-2">{children}</div>
    <div className="flex justify-between items-center mt-1.5">
      <span className="font-body text-[5.5px] text-black/40">Source: Lam13 analysis — illustrative</span>
      <span className="font-body text-[5.5px] text-black/40">{page}</span>
    </div>
  </div>
);

/** slide 1: eight-dimension stakeholder diagnostic grid */
const SlideDiagnostic = () => (
  <SlideShell title="Eight dimensions were reviewed with stakeholders — aligned on all except delivery capacity" page={7}>
    <div className="grid grid-cols-4 gap-1.5 h-full">
      {[
        { n: 1, t: "Ambition", b: ["Growth targets set", "Mandate confirmed"] },
        { n: 2, t: "Evidence base", b: ["Baseline agreed", "Benchmarks mapped"] },
        { n: 3, t: "Priorities", b: ["Sectors shortlisted", "Trade-offs settled"] },
        { n: 4, t: "Investment", b: ["Funding envelope", "Incentives drafted"] },
        { n: 5, t: "Governance", b: ["Cadence defined", "Owners named"] },
        { n: 6, t: "Talent", b: ["Skills gaps sized", "Pipeline planned"] },
        { n: 7, t: "Data & digital", b: ["Platforms scoped", "Standards set"] },
        { n: 8, t: "Delivery capacity", b: ["Capability gap", "Differing views"], hot: true },
      ].map((c) => (
        <div key={c.n} className={"flex flex-col border " + (c.hot ? "border-[#1E3FBF] bg-[#1E3FBF]" : "border-black/15 bg-white")}>
          <div className={"flex items-center gap-1 px-1 py-[3px] " + (c.hot ? "bg-[#1E3FBF]" : "bg-[#EEF2FE]")}>
            <span
              className={
                "w-2.5 h-2.5 rounded-full flex items-center justify-center font-body font-bold text-[5px] shrink-0 " +
                (c.hot ? "bg-white text-[#1E3FBF]" : "bg-[#1E3FBF] text-white")
              }
            >
              {c.n}
            </span>
            <span className={"font-body font-bold text-[5.5px] leading-tight " + (c.hot ? "text-white" : "text-[#1E3FBF]")}>{c.t}</span>
          </div>
          <ul className={"px-1.5 py-1 flex flex-col gap-[2px] " + (c.hot ? "bg-white/95" : "")}>
            {c.b.map((x) => (
              <li key={x} className="font-body text-[5px] leading-[1.35] text-black/70 flex gap-[3px]">
                <span className="text-[#1E3FBF]">•</span>
                {x}
              </li>
            ))}
          </ul>
          {c.hot && (
            <span className="mx-1.5 mb-1 -rotate-2 bg-black text-white font-body font-bold text-[4.5px] text-center py-[2px]">
              Priority gap to close
            </span>
          )}
        </div>
      ))}
    </div>
  </SlideShell>
);

/** slide 2: vision / pillars / enablers framework house */
const SlideFramework = () => (
  <SlideShell title="The growth framework: one vision, three pillars, five enablers" page={12}>
    <div className="h-full flex gap-2">
      <div className="w-[26%] bg-[#1E3FBF] text-white px-2 py-2 flex flex-col justify-between">
        <p className="font-body font-bold text-[8px] leading-[1.3]">Future economy deep dive</p>
        <p className="font-body text-[5.5px] leading-[1.4] text-white/80">
          Framework consolidated from 40+ stakeholder sessions and benchmark review of 12 peer economies.
        </p>
      </div>
      <div className="flex-1 flex flex-col gap-1">
        <div className="relative bg-[#EEF2FE] border border-[#1E3FBF]/30 text-center py-[3px] [clip-path:polygon(3%_100%,0_0,50%_0,100%_0,97%_100%)]">
          <span className="font-body font-bold text-[6px] text-[#1E3FBF] tracking-wide">VISION — a diversified, innovation-led economy by 2031</span>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {["Future industries", "Investment & trade", "Workforce & skills"].map((p, i) => (
            <div key={p} className="border border-black/15 px-1 py-1.5 text-center bg-white">
              <span className="mx-auto mb-[3px] w-3 h-3 rounded-full bg-[#1E3FBF] text-white font-body font-bold text-[5.5px] flex items-center justify-center">
                {i + 1}
              </span>
              <span className="font-body font-bold text-[5.5px] leading-tight text-black/85 block">{p}</span>
              <span className="font-body text-[4.5px] text-black/50 block mt-[2px]">incl. growth targets</span>
            </div>
          ))}
        </div>
        <div className="flex-1 flex flex-col gap-[3px] justify-end">
          {["Communication and culture change", "Governance (incl. separation of policy vs delivery)", "Org. structure (incl. unit definitions)", "Talent management (incl. performance-based progression)", "Processes"].map(
            (e, i) => (
              <div key={e} className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#7AA0FF] text-white font-body font-bold text-[4.5px] flex items-center justify-center shrink-0">
                  {i + 4}
                </span>
                <span className="flex-1 bg-[#F4F6FE] border border-black/10 font-body text-[5px] text-black/70 px-1.5 py-[2px]">{e}</span>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  </SlideShell>
);

/** slide 3: KPI and governance dashboard */
const SlideKpi = () => (
  <SlideShell title="KPI and governance framework tracks delivery against 2031 targets" page={18}>
    <div className="h-full flex gap-2">
      <div className="flex-1 border border-black/15">
        <div className="grid grid-cols-[1.6fr_1fr_1fr] bg-[#1E3FBF] text-white font-body font-bold text-[5px] px-1.5 py-[3px]">
          <span>KPI</span>
          <span className="text-right">Baseline</span>
          <span className="text-right">2031 target</span>
        </div>
        {[
          ["Non-core GDP share", "31%", "45%"],
          ["Private investment / GDP", "17%", "24%"],
          ["High-skill employment", "1.2m", "2.1m"],
          ["Export diversification index", "0.42", "0.61"],
          ["Time-to-permit (days)", "160", "45"],
        ].map((r, i) => (
          <div
            key={r[0]}
            className={"grid grid-cols-[1.6fr_1fr_1fr] font-body text-[5px] px-1.5 py-[3px] " + (i % 2 ? "bg-[#F4F6FE]" : "bg-white")}
          >
            <span className="text-black/75">{r[0]}</span>
            <span className="text-right text-black/55">{r[1]}</span>
            <span className="text-right font-bold text-[#1E3FBF]">{r[2]}</span>
          </div>
        ))}
      </div>
      <div className="w-[38%] flex flex-col gap-1.5">
        <div className="flex-1 border border-black/15 px-1.5 pt-1 pb-1.5 flex flex-col">
          <span className="font-body font-bold text-[5px] text-black/60">Investment ramp-up, $bn</span>
          <div className="flex-1 flex items-end gap-1 mt-1" aria-hidden="true">
            {[22, 34, 48, 66, 82].map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-[2px]">
                <span className="font-body text-[4.5px] text-black/50">{h}</span>
                <span className="w-full" style={{ height: `${h * 0.45}px`, background: i >= 3 ? "#1E3FBF" : "#7AA0FF" }} />
                <span className="font-body text-[4.5px] text-black/40">{27 + i}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="border border-black/15 px-1.5 py-1">
          <span className="font-body font-bold text-[5px] text-black/60 block">Governance cadence</span>
          {["Ministerial board — quarterly", "Delivery unit — weekly", "Public scorecard — annual"].map((g) => (
            <span key={g} className="font-body text-[5px] text-black/70 flex gap-[3px] mt-[2px]">
              <span className="text-[#1E3FBF]">▸</span>
              {g}
            </span>
          ))}
        </div>
      </div>
    </div>
  </SlideShell>
);

/** slide 4: opportunity spider — long list radiating from the core */
const SlideSpider = () => (
  <SlideShell title="80+ growth opportunities identified across eight clusters" page={9}>
    <svg viewBox="0 0 340 150" className="w-full h-full" role="img" aria-label="Opportunity spider chart">
      {[
        { x: 50, y: 22, t: "Advanced manufacturing", n: 14 },
        { x: 250, y: 16, t: "Digital services", n: 12 },
        { x: 306, y: 52, t: "Green energy", n: 11 },
        { x: 300, y: 112, t: "Tourism & culture", n: 9 },
        { x: 236, y: 138, t: "Agritech & food", n: 10 },
        { x: 92, y: 140, t: "Logistics & trade", n: 8 },
        { x: 26, y: 106, t: "Health & life sciences", n: 9 },
        { x: 28, y: 58, t: "Financial services", n: 9 },
      ].map((c) => (
        <g key={c.t}>
          <line x1="170" y1="76" x2={c.x} y2={c.y} stroke="#1E3FBF" strokeOpacity="0.25" strokeWidth="0.8" />
          <circle cx={c.x} cy={c.y} r="3" fill="#7AA0FF" />
          <text x={c.x} y={c.y - 6} textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#1E3FBF">
            {c.t}
          </text>
          <text x={c.x} y={c.y + 11} textAnchor="middle" fontSize="5.5" fill="rgba(0,0,0,0.5)">
            {c.n} opportunities
          </text>
        </g>
      ))}
      <circle cx="170" cy="76" r="24" fill="#1E3FBF" />
      <text x="170" y="73" textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff">
        Growth
      </text>
      <text x="170" y="83" textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff">
        2031
      </text>
    </svg>
  </SlideShell>
);

/** slide 5: phased initiative roadmap */
const SlideRoadmap = () => (
  <SlideShell title="Initiative roadmap phases delivery across three horizons" page={14}>
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-[1.1fr_1fr_1fr_1fr] gap-[3px] mb-[3px]">
        <span />
        {["Phase 1 — 2027", "Phase 2 — 2028–29", "Phase 3 — 2030–31"].map((p) => (
          <span key={p} className="bg-[#1E3FBF] text-white font-body font-bold text-[5px] text-center py-[3px]">
            {p}
          </span>
        ))}
      </div>
      {[
        { l: "Future industries", bars: [["Sector packages", 0, 1], ["Anchor investors", 1, 2], ["Scale-up", 2, 3]] },
        { l: "Investment & trade", bars: [["Incentive reform", 0, 2], ["Trade corridors", 2, 3]] },
        { l: "Workforce & skills", bars: [["Skills academies", 0, 1], ["Reskilling at scale", 1, 3]] },
        { l: "Enablers", bars: [["Delivery unit", 0, 1], ["Digital platforms", 0, 2], ["Regulatory reform", 1, 3]] },
      ].map((row, ri) => (
        <div key={row.l} className={"grid grid-cols-[1.1fr_1fr_1fr_1fr] gap-[3px] items-stretch flex-1 " + (ri % 2 ? "bg-[#F4F6FE]" : "")}>
          <span className="font-body font-bold text-[5px] text-black/70 flex items-center px-1">{row.l}</span>
          <div className="relative col-span-3 my-[3px]">
            {row.bars.map(([t, s, e], bi) => (
              <span
                key={t as string}
                className="absolute h-[9px] flex items-center px-1 font-body text-[4.5px] text-white whitespace-nowrap overflow-hidden"
                style={{
                  left: `${((s as number) / 3) * 100 + 0.5}%`,
                  width: `${(((e as number) - (s as number)) / 3) * 100 - 1}%`,
                  top: `${bi * 12}px`,
                  background: bi % 2 ? "#7AA0FF" : "#1E3FBF",
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  </SlideShell>
);

/** slide 6: prioritization matrix */
const SlideMatrix = () => (
  <SlideShell title="Twelve priority plays mapped by attractiveness and feasibility" page={11}>
    <div className="h-full flex gap-2">
      <div className="relative flex-1 border-l border-b border-black/30 ml-3 mb-2 mr-1">
        <span className="absolute -left-3 top-1/2 -translate-y-1/2 -rotate-90 font-body font-bold text-[5px] text-black/50 whitespace-nowrap">
          Attractiveness →
        </span>
        <span className="absolute left-1/2 -bottom-2.5 -translate-x-1/2 font-body font-bold text-[5px] text-black/50">
          Feasibility →
        </span>
        <span className="absolute inset-y-0 left-1/2 border-l border-dashed border-black/15" aria-hidden="true" />
        <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-black/15" aria-hidden="true" />
        {[
          { x: 74, y: 12, r: 9, t: "Green hydrogen", hot: true },
          { x: 84, y: 30, r: 7, t: "Fintech hub", hot: true },
          { x: 58, y: 22, r: 6, t: "Agritech" },
          { x: 66, y: 52, r: 5, t: "Med-tourism" },
          { x: 30, y: 34, r: 6, t: "Aerospace MRO" },
          { x: 40, y: 66, r: 5, t: "Creative economy" },
          { x: 16, y: 76, r: 4, t: "Rare earths" },
        ].map((b) => (
          <span key={b.t} className="absolute" style={{ left: `${b.x}%`, top: `${b.y}%` }}>
            <span
              className="block rounded-full"
              style={{
                width: `${b.r * 2}px`,
                height: `${b.r * 2}px`,
                background: b.hot ? "#1E3FBF" : "#7AA0FF",
                opacity: b.hot ? 1 : 0.75,
              }}
            />
            <span className="absolute left-1/2 -translate-x-1/2 top-full mt-[1px] font-body text-[4.5px] text-black/65 whitespace-nowrap">
              {b.t}
            </span>
          </span>
        ))}
      </div>
      <div className="w-[30%] flex flex-col gap-1">
        <div className="bg-[#EEF2FE] border border-[#1E3FBF]/25 px-1.5 py-1">
          <span className="font-body font-bold text-[5px] text-[#1E3FBF] block">Priority quadrant</span>
          <span className="font-body text-[4.5px] text-black/60 leading-[1.4] block mt-[2px]">
            Two plays combine high attractiveness with proven feasibility — sequence first.
          </span>
        </div>
        <div className="border border-black/15 px-1.5 py-1 flex-1">
          <span className="font-body font-bold text-[5px] text-black/60 block">Bubble size</span>
          <span className="font-body text-[4.5px] text-black/55 leading-[1.4] block mt-[2px]">
            Estimated 2031 GVA contribution
          </span>
        </div>
      </div>
    </div>
  </SlideShell>
);

/** slide 7: long-list to priority funnel */
const SlideFunnel = () => (
  <SlideShell title="From 80 opportunities to five priority plays through four screens" page={10}>
    <div className="h-full flex gap-2">
      <div className="flex-1 flex flex-col justify-center gap-1.5">
        {[
          { t: "Long list", n: 80, w: "100%", d: "All clusters, no filter" },
          { t: "Strategic fit", n: 38, w: "76%", d: "Aligned with vision and pillars" },
          { t: "Market screen", n: 16, w: "52%", d: "Demand, competition, margins" },
          { t: "Priority plays", n: 5, w: "30%", d: "Feasible now, funded, owned", hot: true },
        ].map((s) => (
          <div key={s.t} className="flex items-center gap-1.5">
            <div
              className={"h-[22px] flex items-center justify-between px-2 [clip-path:polygon(0_0,100%_0,96%_50%,100%_100%,0_100%,4%_50%)] " + (s.hot ? "" : "")}
              style={{ width: s.w, background: s.hot ? "#1E3FBF" : "#EEF2FE", border: s.hot ? "none" : "1px solid rgba(30,63,191,0.25)" }}
            >
              <span className={"font-body font-bold text-[5.5px] " + (s.hot ? "text-white" : "text-[#1E3FBF]")}>{s.t}</span>
              <span className={"font-body font-bold text-[7px] " + (s.hot ? "text-white" : "text-[#1E3FBF]")}>{s.n}</span>
            </div>
            <span className="font-body text-[4.5px] text-black/55 flex-1 leading-[1.35]">{s.d}</span>
          </div>
        ))}
      </div>
      <div className="w-[27%] border border-black/15 px-1.5 py-1.5 self-center">
        <span className="font-body font-bold text-[5px] text-black/60 block">Screening criteria</span>
        {["GVA and job potential", "Export orientation", "Time to first revenue", "Capability to deliver", "Capital intensity"].map((c) => (
          <span key={c} className="font-body text-[4.5px] text-black/65 flex gap-[3px] mt-[3px]">
            <span className="text-[#1E3FBF]">▸</span>
            {c}
          </span>
        ))}
      </div>
    </div>
  </SlideShell>
);

const DECK_SLIDES = [
  { key: "diagnostic", node: <SlideDiagnostic /> },
  { key: "spider", node: <SlideSpider /> },
  { key: "funnel", node: <SlideFunnel /> },
  { key: "matrix", node: <SlideMatrix /> },
  { key: "framework", node: <SlideFramework /> },
  { key: "roadmap", node: <SlideRoadmap /> },
  { key: "kpi", node: <SlideKpi /> },
];

/** Microsoft PowerPoint product icon */
const PowerPointIcon = ({ size = 34 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-label="Microsoft PowerPoint" role="img">
    <rect x="14" y="6" width="28" height="36" rx="2" fill="#ED6C47" />
    <path d="M28 6h12a2 2 0 0 1 2 2v16H28V6Z" fill="#FF8F6B" />
    <path d="M14 24h28v9H14v-9Z" fill="#D35230" />
    <path d="M14 33h28v7a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2v-7Z" fill="#C43E1C" />
    <rect x="4" y="12" width="24" height="24" rx="2" fill="#C43E1C" />
    <text
      x="16"
      y="30.5"
      textAnchor="middle"
      fontFamily="Arial, Helvetica, sans-serif"
      fontWeight="bold"
      fontSize="18"
      fill="#FFFFFF"
    >
      P
    </text>
  </svg>
);

const deckSteps = [
  "Analysing strategy content",
  "Identifying key executive insights",
  "Structuring the board narrative",
  "Creating visuals and KPI scorecards",
  "Generating editable PowerPoint slides",
];

/** dotted panel shared by both visuals */
const DotPanel = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-[#FBFBFC] [background-image:radial-gradient(circle,rgba(0,0,0,0.08)_1px,transparent_1px)] [background-size:18px_18px] border border-foreground/10 px-4 py-10 sm:px-8 sm:py-12 flex justify-center">
    {children}
  </div>
);

/** strategy visual: the live-demo chatbot types the query, then the next
 *  slide shows the exchange with the response */
const StrategyVisual = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { once: true, margin: "-15% 0px" });
  const [stage, setStage] = useState<"input" | "answer">("input");
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    const wait = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));
    (async () => {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (cancelled) return;
        setStage("input");
        setTyped("");
        await wait(1000);
        for (let c = 0; c < STRATEGY_QUERY.length; c++) {
          if (cancelled) return;
          setTyped(STRATEGY_QUERY.slice(0, c + 1));
          await wait(26);
        }
        await wait(900);
        if (cancelled) return;
        setStage("answer");
        await wait(7000);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inView]);

  return (
    <DotPanel>
      <div ref={rootRef} className="w-full sm:w-[min(460px,94%)] min-h-[340px] flex items-center justify-center py-2">
        <AnimatePresence mode="wait">
          {stage === "input" && (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
              className="w-full flex justify-center pointer-events-none"
            >
              <PromptInput
                value={typed}
                onChange={() => undefined}
                placeholder="Ask Lam13 about public strategy…"
                models={["LAM13"]}
                collapsedMaxWidth={380}
                expandedMaxWidth={420}
              />
            </motion.div>
          )}

          {stage === "answer" && (
            <motion.div
              key="answer"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
              className="w-full flex flex-col gap-4"
            >
              <AIMessage from="user" timestamp="09:24">
                {STRATEGY_QUERY}
              </AIMessage>
              <AIMessage
                from="assistant"
                timestamp="09:24"
                copyText={STRATEGY_RESPONSE}
                onRetry={() => undefined}
                onVote={() => undefined}
              >
                {STRATEGY_RESPONSE}
              </AIMessage>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DotPanel>
  );
};

/** PowerPoint demo: Strategy document -> LAM 13 processing -> Generated PowerPoint slides */
const StageLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="font-display font-bold text-[10.5px] tracking-[0.18em] uppercase text-muted-foreground mb-3 text-center">
    {children}
  </p>
);

const DeckVisual = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { once: true, margin: "-15% 0px" });
  const [stepIdx, setStepIdx] = useState(-1);
  const [slideIdx, setSlideIdx] = useState(0);
  const [stage, setStage] = useState<"doc" | "steps" | "gen" | "collage" | "slides">("doc");

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    const wait = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));
    (async () => {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (cancelled) return;
        setStage("doc");
        setStepIdx(-1);
        setSlideIdx(0);
        await wait(2600);
        if (cancelled) return;
        setStage("steps");
        for (let i = 0; i < deckSteps.length; i++) {
          if (cancelled) return;
          setStepIdx(i);
          await wait(850);
        }
        if (cancelled) return;
        setStepIdx(deckSteps.length);
        await wait(600);
        if (cancelled) return;
        // generation shimmer, then a collage of the full set, then one by one
        setStage("gen");
        await wait(2400);
        if (cancelled) return;
        setStage("collage");
        await wait(3400);
        if (cancelled) return;
        setStage("slides");
        for (let i = 0; i < DECK_SLIDES.length; i++) {
          if (cancelled) return;
          setSlideIdx(i);
          await wait(4200);
        }
        await wait(1200);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inView]);

  return (
    <DotPanel>
      {/* fixed height so the card doesn't resize as stages swap */}
      <div ref={rootRef} className="relative w-full sm:w-[min(560px,96%)] h-[460px] sm:h-[480px] flex items-center justify-center">
        <AnimatePresence mode="wait">
          {stage === "doc" && (
            <motion.div
              key="doc"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
              className="w-full flex flex-col items-center"
            >
              <StageLabel>Strategy document</StageLabel>
              <div className="relative mt-1">
                {/* pages stacked behind the cover */}
                <div className="absolute inset-0 translate-x-7 translate-y-3 rotate-[4deg] bg-white border border-black/15 shadow-[0_10px_28px_-18px_rgba(0,0,0,0.3)]" aria-hidden="true" />
                <div className="absolute inset-0 translate-x-3.5 translate-y-1.5 rotate-[2deg] bg-white border border-black/15" aria-hidden="true" />
                {/* cover page */}
                <div className="relative w-[280px] sm:w-[310px] h-[340px] sm:h-[368px] bg-white border border-black/15 shadow-[0_28px_64px_-28px_rgba(0,0,0,0.35)] px-5 pt-5 pb-4 flex flex-col text-left">
                  <span className="h-[3px] w-10 [background:var(--gradient-accent)]" aria-hidden="true" />
                  <p className="mt-3 font-display font-bold text-[9.5px] tracking-[0.18em] text-[#1E3FBF]">
                    MINISTRY OF ECONOMY
                  </p>
                  <p className="font-display font-bold text-[19px] leading-[1.22] mt-2 text-foreground">
                    National Economic
                    <br />
                    Growth Plan
                  </p>
                  <p className="font-body text-[11px] text-muted-foreground mt-1.5">2026–2031 · Final draft for cabinet review</p>
                  <div className="mt-3.5 border-t border-black/10 pt-3 flex flex-col gap-[7px]">
                    {[
                      ["Executive summary", "04"],
                      ["Economic baseline and benchmarks", "09"],
                      ["Strategic pillars and priorities", "17"],
                      ["Initiative portfolio and roadmap", "26"],
                      ["KPIs and governance", "38"],
                    ].map(([t, pg]) => (
                      <div key={t} className="flex items-baseline gap-1.5 font-body text-[10px] text-black/70">
                        <span>{t}</span>
                        <span className="flex-1 border-b border-dotted border-black/25 translate-y-[-2px]" aria-hidden="true" />
                        <span className="text-black/45">{pg}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-auto flex gap-2.5" aria-hidden="true">
                    <div className="flex-1 border border-black/10 bg-[#FBFBFC] px-2 pt-1.5 pb-2">
                      <span className="block font-body font-bold text-[7px] text-black/45 mb-1">GDP by sector, %</span>
                      <div className="flex items-end gap-1 h-8">
                        {[40, 55, 30, 70, 48].map((h, i) => (
                          <span key={i} className="flex-1" style={{ height: `${h}%`, background: i === 3 ? "#1E3FBF" : "#C9D6F8" }} />
                        ))}
                      </div>
                    </div>
                    <div className="flex-1 border border-black/10 bg-[#FBFBFC] px-2 pt-1.5 pb-2">
                      <span className="block font-body font-bold text-[7px] text-black/45 mb-1">Growth trajectory</span>
                      <svg viewBox="0 0 60 24" className="w-full h-8" aria-hidden="true">
                        <polyline points="0,20 12,17 24,18 36,12 48,8 60,3" fill="none" stroke="#1E3FBF" strokeWidth="1.6" />
                        <polyline points="0,21 12,20 24,21 36,19 48,18 60,17" fill="none" stroke="#C9D6F8" strokeWidth="1.4" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-5 flex gap-2" aria-hidden="true">
                {["PDF", "48 pages", "12 chapters"].map((c) => (
                  <span key={c} className="border border-foreground/15 bg-white px-2.5 py-1 font-display text-[10px] text-muted-foreground">
                    {c}
                  </span>
                ))}
              </div>
            </motion.div>
          )}

          {stage === "steps" && (
            <motion.div
              key="steps"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
              className="w-full"
            >
              <StageLabel>LAM 13 processing</StageLabel>
              <div className="bg-white border border-foreground/10 shadow-[0_18px_44px_-24px_rgba(0,0,0,0.2)] overflow-hidden">
                {/* header: orb + status + overall progress */}
                <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
                  <ThinkingOrb state="working" size={20} theme="light" aria-label="Working" />
                  <span className="font-display text-[12.5px] text-foreground">Turning the document into slides…</span>
                  <span className="ml-auto font-display font-bold text-[12px] text-accent tabular-nums">
                    {Math.min(100, Math.round((Math.max(0, stepIdx) / deckSteps.length) * 100))}%
                  </span>
                </div>
                <div className="mx-5 h-[3px] bg-black/[0.07]" aria-hidden="true">
                  <motion.div
                    className="h-full [background:var(--gradient-accent)]"
                    initial={false}
                    animate={{ width: `${Math.min(100, (Math.max(0, stepIdx) / deckSteps.length) * 100)}%` }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
                {/* steps: pending dimmed, active highlighted with running underline, done spring-checked */}
                <div className="flex flex-col px-2 py-3">
                  {deckSteps.map((step, i) => {
                    const done = i < stepIdx;
                    const active = i === stepIdx;
                    return (
                      <div
                        key={step}
                        className={
                          "relative flex items-center gap-2.5 text-[12.5px] px-3 py-[7px] transition-colors duration-300 " +
                          (active ? "bg-[#F4F6FE]" : "")
                        }
                      >
                        {done ? (
                          <motion.span
                            initial={{ scale: 0, rotate: -45 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: "spring", stiffness: 500, damping: 22 }}
                            className="w-5 h-5 flex items-center justify-center rounded-full [background:var(--gradient-accent)] text-white font-display font-bold text-[10px] shrink-0"
                            aria-hidden="true"
                          >
                            ✓
                          </motion.span>
                        ) : active ? (
                          <span className="w-5 h-5 flex items-center justify-center shrink-0">
                            <span className="w-3.5 h-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin" aria-hidden="true" />
                          </span>
                        ) : (
                          <span className="w-5 h-5 flex items-center justify-center shrink-0" aria-hidden="true">
                            <span className="w-2 h-2 rounded-full border border-black/25" />
                          </span>
                        )}
                        <span
                          className={
                            "transition-colors duration-300 " +
                            (done ? "text-muted-foreground line-through decoration-black/20" : active ? "text-foreground font-bold" : "text-muted-foreground/60")
                          }
                        >
                          {step}
                        </span>
                        {active && (
                          <motion.span
                            key={`bar-${i}`}
                            className="absolute bottom-0 left-0 h-[2px] [background:var(--gradient-accent)]"
                            initial={{ width: "0%" }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 0.85, ease: "linear" }}
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {stage === "gen" && (
            <motion.div
              key="gen"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
              className="w-full"
            >
              <StageLabel>LAM 13 processing</StageLabel>
              <div className="relative w-full aspect-[16/9] bg-white border border-foreground/15 overflow-hidden" aria-label="Generating slides">
                <div
                  className="absolute inset-5 animate-pulse [background-image:radial-gradient(circle,rgba(0,0,0,0.18)_2px,transparent_2px)] [background-size:22px_22px] [mask-image:radial-gradient(60%_60%_at_45%_45%,#000_30%,transparent_100%)]"
                  aria-hidden="true"
                />
                <span className="absolute top-3 left-4 font-body text-[13px] text-muted-foreground">Generating slides…</span>
              </div>
            </motion.div>
          )}

          {stage === "collage" && (
            <motion.div
              key="collage"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
              className="w-full h-full flex flex-col"
            >
              <StageLabel>Generated PowerPoint slides</StageLabel>
              <div className="flex-1 flex items-center min-h-0">
              <div className="w-full grid grid-cols-3 gap-2">
                {DECK_SLIDES.map((s, i) => (
                  <motion.div
                    key={s.key}
                    initial={{ opacity: 0, y: 14, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.4, delay: 0.15 + i * 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className={
                      "relative aspect-[16/9] bg-white border border-foreground/15 shadow-[0_14px_34px_-18px_rgba(0,0,0,0.28)] overflow-hidden " +
                      (i === 6 ? "col-start-2" : "")
                    }
                  >
                    {/* render at 3x then scale down so the fixed-px slide layout stays intact */}
                    <div className="absolute top-0 left-0 w-[300%] h-[300%] origin-top-left scale-[0.3334]">
                      <div className="absolute inset-0">{s.node}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
              </div>
              <p className="mt-auto pt-3 text-center text-[12.5px] text-muted-foreground font-body">
                {DECK_SLIDES.length} strategy slides generated.
              </p>
            </motion.div>
          )}

          {stage === "slides" && (
            <motion.div
              key="slides"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
              className="w-full h-full flex flex-col"
            >
              <StageLabel>Generated PowerPoint slides</StageLabel>
              <div className="flex-1 flex items-center min-h-0">
              <div className="relative w-full aspect-[16/9] bg-white border border-foreground/15 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.3)] overflow-hidden">
                <AnimatePresence mode="popLayout">
                  <motion.div
                    key={DECK_SLIDES[slideIdx].key}
                    aria-label={`Generated slide ${slideIdx + 1} of ${DECK_SLIDES.length}`}
                    initial={{ opacity: 0, x: 32 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -32 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0"
                  >
                    {DECK_SLIDES[slideIdx].node}
                  </motion.div>
                </AnimatePresence>
              </div>
              </div>
              {/* progress + caption pinned to the bottom of the card */}
              <div className="mt-auto pt-3">
                <div className="flex items-center justify-center gap-3">
                  <div className="flex gap-1.5" aria-hidden="true">
                    {DECK_SLIDES.map((s, i) => (
                      <span
                        key={s.key}
                        className={
                          "h-1 transition-all duration-300 " +
                          (i === slideIdx ? "w-5 [background:var(--gradient-accent)]" : "w-2.5 bg-black/15")
                        }
                      />
                    ))}
                  </div>
                  <span className="font-display text-[11px] text-muted-foreground">
                    Slide {slideIdx + 1} / {DECK_SLIDES.length}
                  </span>
                </div>
                <p className="mt-2 text-center text-[12.5px] text-muted-foreground font-body">
                  Executive-ready slides, fully editable in PowerPoint.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DotPanel>
  );
};

const Services = () => (
  <section id="services" className="py-24 bg-white" aria-labelledby="svc-h">
    {/* heading */}
    <div className="max-w-[1200px] mx-auto px-6 pt-8 pb-16 text-center">
      <Reveal className="flex justify-center">
        <Eyebrow center>What we do</Eyebrow>
      </Reveal>
      <Reveal delay={0.08}>
        <h2 id="svc-h" className="font-display text-[clamp(1.7rem,3.4vw,2.7rem)] mt-4 max-w-[26ch] mx-auto">
          Strategy consulting, delivered by agents.
        </h2>
      </Reveal>
      <Reveal delay={0.16}>
        <p className="text-muted-foreground mt-4 text-[17px] max-w-[56ch] mx-auto">
          AI-native services across the public sector — from the first framework to the final deliverable.
        </p>
      </Reveal>
    </div>

    {/* 01 — Create public strategies */}
    <div className="max-w-[1200px] mx-auto px-6 py-16 md:py-20">
      <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
        <Reveal>
          <div>
            <span className="text-accent inline-block">
              <Landmark size={30} strokeWidth={1.7} />
            </span>
            <h3 className="font-display text-[clamp(1.4rem,2.6vw,2rem)] mt-5">Create and review public strategy</h3>
            <p className="text-muted-foreground mt-4 text-[16px] max-w-[52ch]">
              Develop public sector strategies from the ground up, or stress-test existing national strategies, surface
              gaps, and generate recommendations and content to bridge them.
            </p>
          </div>
        </Reveal>
        <Reveal delay={0.12}>
          <StrategyVisual />
        </Reveal>
      </div>
    </div>

    {/* 02 — board decks */}
    <div className="max-w-[1200px] mx-auto px-6">
      <div className="py-16 md:py-20 border-t border-foreground/10">
        <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
          <Reveal delay={0.12} className="order-1 md:order-none">
            <DeckVisual />
          </Reveal>
          <Reveal>
            <div>
              <PowerPointIcon />
              <h3 className="font-display text-[clamp(1.4rem,2.6vw,2rem)] mt-5">
                Turn complex strategy into decision-ready slides
              </h3>
              <p className="text-muted-foreground mt-4 text-[16px] max-w-[52ch]">
                Transform detailed strategy documents into clear, executive-ready PowerPoint slides using proven
                strategy layouts and presentation patterns used by leading strategy organisations.
              </p>
              <p className="text-muted-foreground mt-3 text-[16px] max-w-[52ch]">
                Use LAM 13&rsquo;s strategy slide designs or adapt the output to your organisation&rsquo;s existing
                PowerPoint templates, branding, and visual language. Refine the narrative, slides, and visuals through
                follow-up prompts to support executive alignment and decision-making.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </div>
  </section>
);

export default Services;
