import { useState } from "react";
import Eyebrow from "./Eyebrow";
import Reveal from "./Reveal";

import josephImage from "@/assets/joseph.jpg";

import bcgLogo from "@/assets/bcg-logo.png";
import bainLogo from "@/assets/bain-logo.webp";

const LogoImage = ({ src, alt }: { src: string; alt: string }) => {
  const [hasError, setHasError] = useState(false);
  if (hasError) return <span className="font-display text-[10px] text-muted-foreground">{alt}</span>;
  return <img src={src} alt={alt} className="h-full w-auto max-w-[110px] object-contain" onError={() => setHasError(true)} />;
};

const LinkedInGlyph = () => (
  <svg viewBox="0 0 256 256" className="w-[15px] h-[15px]" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid">
    <path
      fill="currentColor"
      d="M218.123122,218.127392 L180.191928,218.127392 L180.191928,158.724263 C180.191928,144.559023 179.939053,126.323993 160.463756,126.323993 C140.707926,126.323993 137.685284,141.757585 137.685284,157.692986 L137.685284,218.123441 L99.7540894,218.123441 L99.7540894,95.9665207 L136.168036,95.9665207 L136.168036,112.660562 L136.677736,112.660562 C144.102746,99.9650027 157.908637,92.3824528 172.605689,92.9280076 C211.050535,92.9280076 218.138927,118.216023 218.138927,151.114151 L218.123122,218.127392 Z M56.9550587,79.2685282 C44.7981969,79.2707099 34.9413443,69.4171797 34.9391618,57.260052 C34.93698,45.1029244 44.7902948,35.2458562 56.9471566,35.2436736 C69.1040185,35.2414916 78.9608713,45.0950217 78.963054,57.2521493 C78.9641017,63.090208 76.6459976,68.6895714 72.5186979,72.8184433 C68.3913982,76.9473153 62.7929898,79.26748 56.9550587,79.2685282 M75.9206558,218.127392 L37.94995,218.127392 L37.94995,95.9665207 L75.9206558,95.9665207 L75.9206558,218.127392 Z M237.033403,0.0182577091 L18.8895249,0.0182577091 C8.57959469,-0.0980923971 0.124827038,8.16056231 -0.001,18.4706066 L-0.001,237.524091 C0.120519052,247.839103 8.57460631,256.105934 18.8895249,255.9977 L237.033403,255.9977 C247.368728,256.125818 255.855922,247.859464 255.999,237.524091 L255.999,18.4548016 C255.851624,8.12438979 247.363742,-0.133792868 237.033403,0.000790807055"
    />
  </svg>
);

const Team = () => (
  <section id="team" className="py-24 bg-white" aria-labelledby="team-h">
    <div className="max-w-[1200px] mx-auto px-6">
      <div className="grid md:grid-cols-[0.9fr_1.1fr] gap-10 md:gap-20 items-center">
        {/* portrait — below the copy on mobile, left of it on desktop */}
        <Reveal className="order-2 md:order-1">
          <div className="bg-[#FBFBFC] [background-image:radial-gradient(circle,rgba(0,0,0,0.08)_1px,transparent_1px)] [background-size:18px_18px] border border-foreground/10 px-6 py-10 sm:px-10 sm:py-12 flex justify-center">
            <img
              src={josephImage}
              alt="Joseph Boutros, Founder and CEO of Lam13"
              loading="lazy"
              className="w-full max-w-[380px] aspect-[4/5] object-cover border border-foreground/15 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.3)]"
            />
          </div>
        </Reveal>

        {/* founder */}
        <div className="order-1 md:order-2">
          <Reveal>
            <Eyebrow>Who we are</Eyebrow>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 id="team-h" className="font-display text-[clamp(1.7rem,3.4vw,2.7rem)] mt-4">
              Built by a strategist, for strategists.
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="text-muted-foreground mt-4 text-[17px] max-w-[52ch]">
              One focused mission: AI-native strategy consulting for the public sector.
            </p>
          </Reveal>

          <Reveal delay={0.24}>
            <div className="mt-10 border-t border-foreground/10 pt-8">
              <h3 className="font-display text-[1.35rem]">Joseph Boutros</h3>
              <p className="font-display text-[13px] mt-1 tracking-[0.03em] text-gradient-accent font-bold">
                Founder &amp; CEO
              </p>
              <p className="text-[15.5px] text-muted-foreground mt-4 max-w-[52ch]">
                Shaping our vision for AI-native strategy consulting. Deep top-tier consulting experience and the mind
                behind our agentic AI patent.
              </p>

              <div className="mt-7">
                <p className="font-display font-bold text-[10px] tracking-[0.2em] text-muted-foreground/70 mb-3">
                  RELEVANT EXPERIENCE AT
                </p>
                <div className="flex items-center gap-5">
                  <div className="h-8 flex items-center" title="BCG">
                    <LogoImage src={bcgLogo} alt="BCG" />
                  </div>
                  <div className="h-8 flex items-center" title="Bain & Company">
                    <LogoImage src={bainLogo} alt="Bain & Company" />
                  </div>
                </div>
              </div>

              <a
                href="https://www.linkedin.com/in/josephboutros/"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 inline-flex items-center gap-2.5 font-display text-[14px] border border-foreground px-5 py-3 hover:bg-[#0A66C2] hover:border-[#0A66C2] hover:text-white transition-colors"
              >
                <LinkedInGlyph />
                Connect on LinkedIn
              </a>
            </div>
          </Reveal>
        </div>
      </div>
    </div>
  </section>
);

export default Team;
