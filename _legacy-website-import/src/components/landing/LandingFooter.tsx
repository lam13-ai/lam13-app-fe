import { Link } from "react-router-dom";
import FlickeringGrid from "@/components/ui/flickering-grid";
import Spark from "./Spark";

const LandingFooter = () => (
  <footer className="relative bg-black text-white/70 overflow-hidden">
    {/* flickering pixel grid behind everything */}
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      <FlickeringGrid squareSize={3} gridGap={8} flickerChance={0.18} color="#6E8FF0" maxOpacity={0.22} />
    </div>

    <div className="relative max-w-[1200px] mx-auto px-6 pt-16 pb-11 border-t border-white/10">
      <div className="grid md:grid-cols-[1.4fr_1fr_1fr] gap-9 md:gap-12">
        <div>
          <a href="/" className="inline-flex items-center gap-2 font-display font-bold text-[19px] text-white">
            <Spark className="text-white" />
            <span>
              Lam13<span className="text-gradient-accent-invert">.ai</span>
            </span>
          </a>
          <p className="font-display font-bold text-[clamp(1.4rem,2.6vw,2rem)] leading-[1.25] tracking-tight mt-5 max-w-[14ch] text-gradient-accent-invert">
            From brief to board-ready.
          </p>
        </div>

        <nav aria-label="Site">
          <h4 className="font-display text-[11.5px] tracking-[0.18em] uppercase text-white/40 mb-4 font-normal">Site</h4>
          <ul className="flex flex-col gap-2.5">
            <li><a className="text-[14.5px] hover:text-white transition-colors" href="/#chatbot">Live Demo</a></li>
            <li><a className="text-[14.5px] hover:text-white transition-colors" href="/#services">What we do</a></li>
            <li><a className="text-[14.5px] hover:text-white transition-colors" href="/#team">Team</a></li>
          </ul>
        </nav>

        <nav aria-label="Company">
          <h4 className="font-display text-[11.5px] tracking-[0.18em] uppercase text-white/40 mb-4 font-normal">Company</h4>
          <ul className="flex flex-col gap-2.5">
            <li><a className="text-[14.5px] hover:text-white transition-colors" href="https://www.lam13.ai/auth" target="_blank" rel="noopener noreferrer">Start free</a></li>
            <li><a className="text-[14.5px] hover:text-white transition-colors" href="https://www.lam13.ai/auth" target="_blank" rel="noopener noreferrer">Sign in</a></li>
            <li><Link className="text-[14.5px] hover:text-white transition-colors" to="/privacy">Privacy</Link></li>
            <li><Link className="text-[14.5px] hover:text-white transition-colors" to="/terms">Terms</Link></li>
          </ul>
        </nav>
      </div>

      <div className="border-t border-white/10 mt-14 pt-6 flex justify-between gap-4 flex-wrap font-display text-xs text-white/40">
        <span>© 2026 Lam13.ai</span>
        <span>AI-native strategy consulting</span>
      </div>
    </div>
  </footer>
);

export default LandingFooter;
