import FlickeringGrid from "@/components/ui/flickering-grid";
import Eyebrow from "./Eyebrow";
import Reveal from "./Reveal";

const FinalCta = () => (
  <section id="start" className="relative bg-black text-white py-28 text-center overflow-hidden" aria-labelledby="cta-h">
    {/* same flickering pixel grid as the footer */}
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      <FlickeringGrid squareSize={3} gridGap={8} flickerChance={0.18} color="#6E8FF0" maxOpacity={0.22} />
    </div>
    <div className="relative max-w-[1200px] mx-auto px-6">
      <Reveal className="flex justify-center">
        <Eyebrow light center>
          Get started
        </Eyebrow>
      </Reveal>
      <Reveal delay={0.08}>
        <h2 id="cta-h" className="font-display text-[clamp(1.9rem,4vw,3rem)] text-white max-w-[24ch] mx-auto mt-4">
          Put an AI strategist to work <span className="text-gradient-accent-invert">today</span>.
        </h2>
      </Reveal>
      <Reveal delay={0.16}>
        <p className="text-white/60 text-lg mt-4">From brief to board-ready in hours, not months.</p>
      </Reveal>
      <Reveal delay={0.24}>
        <div className="mt-9 flex gap-4 justify-center items-center flex-wrap">
          <a
            href="https://www.lam13.ai/auth"
              target="_blank"
              rel="noopener noreferrer"
            className="font-display text-[15px] bg-white text-black px-8 py-4 min-h-[52px] inline-flex items-center gap-2.5 transition-all hover:[background:var(--gradient-accent)] hover:text-white group"
          >
            Start free
            <span className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true">
              ↗
            </span>
          </a>
          <a
            href="#chatbot"
            className="font-display text-[15px] border border-white/40 px-8 py-4 min-h-[52px] inline-flex items-center transition-colors hover:border-white hover:bg-white/10"
          >
            Try the demo
          </a>
        </div>
      </Reveal>
    </div>
  </section>
);

export default FinalCta;
