import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

type Vec3 = { x: number; y: number; z: number };

/** Particle layouts the orb morphs between — one per agent state:
 *  sphere (searching), tilted orbits (working), latitude bands (solving),
 *  face-on ring (breathing), plaited helix strands (weaving),
 *  waveform rings (listening), constellation scatter (connecting). */
const genLayouts = (N: number): Vec3[][] => {
  const sphere: Vec3[] = [];
  const orbits: Vec3[] = [];
  const bands: Vec3[] = [];
  const ringL: Vec3[] = [];
  const weaving: Vec3[] = [];
  const listening: Vec3[] = [];
  const connecting: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  // deterministic PRNG for the constellation
  let s = 29;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i;
    sphere.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r });

    const ring = i % 4;
    const ang = (i / N) * Math.PI * 8 + ring * 1.3;
    const tilt = ring * (Math.PI / 4);
    const rr = 0.5 + ring * 0.16;
    orbits.push({
      x: Math.cos(ang) * rr,
      y: Math.sin(ang) * rr * Math.cos(tilt),
      z: Math.sin(ang) * rr * Math.sin(tilt),
    });

    const band = i % 6;
    const by = -0.75 + band * 0.3;
    const br = Math.sqrt(Math.max(0.05, 1 - by * by));
    const bang = (Math.floor(i / 6) / Math.ceil(N / 6)) * Math.PI * 2 + band * 0.5;
    bands.push({ x: Math.cos(bang) * br, y: by, z: Math.sin(bang) * br });

    // breathing: one thick face-on ring with slight jitter
    const ra = (i / N) * Math.PI * 2;
    const rj = 0.78 + rnd() * 0.14;
    ringL.push({ x: Math.cos(ra) * rj, y: Math.sin(ra) * rj, z: (rnd() - 0.5) * 0.12 });

    // weaving: three helix strands plaited around the sphere
    const strand = i % 3;
    const wy = 1 - ((Math.floor(i / 3) / Math.ceil(N / 3)) * 2 || 0);
    const wr = Math.sqrt(Math.max(0.05, 1 - wy * wy));
    const wang = wy * Math.PI * 3 + (strand * Math.PI * 2) / 3;
    weaving.push({ x: Math.cos(wang) * wr, y: wy, z: Math.sin(wang) * wr });

    // listening: latitude rings with a waveform rolling through them
    const lring = i % 5;
    const lang = (Math.floor(i / 5) / Math.ceil(N / 5)) * Math.PI * 2 + lring * 0.4;
    const lyBase = -0.6 + lring * 0.3;
    const ly = lyBase + Math.sin(lang * 3) * 0.14;
    const lr = Math.sqrt(Math.max(0.05, 1 - ly * ly));
    listening.push({ x: Math.cos(lang) * lr, y: ly, z: Math.sin(lang) * lr });

    // connecting: constellation — points scattered through the volume
    const ca = rnd() * Math.PI * 2;
    const cz = rnd() * 2 - 1;
    const cr = Math.cbrt(rnd());
    const cxy = Math.sqrt(Math.max(0, 1 - cz * cz)) * cr;
    connecting.push({ x: Math.cos(ca) * cxy, y: cz * cr, z: Math.sin(ca) * cxy });
  }
  return [sphere, orbits, bands, ringL, weaving, listening, connecting];
};

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Large dotted thinking-orb — morphs between thinking / working / solving
 * particle layouts with cubic easing; pointer tilts the rotation.
 */
const HeroOrb = ({ size = 300 }: { size?: number }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = false; // animations always on — iOS Reduce Motion must not kill the site

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const N = 640;
    const R = size * 0.4;
    const layouts = genLayouts(N);

    // morph state: current layout -> next layout with eased progress
    let fromIdx = 0;
    let toIdx = 0;
    let morph = 1; // 1 = settled on toIdx
    const HOLD = 300; // ~5s between morphs
    const MORPH = 90; // ~1.5s morph
    let hold = HOLD;

    let raf = 0;
    let t = reduced ? 120 : 0;
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      mouse.tx = Math.max(-1, Math.min(1, (e.clientX - cx) / 320));
      mouse.ty = Math.max(-1, Math.min(1, (e.clientY - cy) / 320));
    };

    const frame = () => {
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;

      // advance morph scheduler
      if (!reduced) {
        if (morph < 1) {
          morph = Math.min(1, morph + 1 / MORPH);
        } else if (--hold <= 0) {
          fromIdx = toIdx;
          toIdx = (toIdx + 1) % layouts.length;
          morph = 0;
          hold = HOLD;
        }
      }
      const k = easeInOutCubic(morph);
      const A = layouts[fromIdx];
      const B = layouts[toIdx];

      ctx.clearRect(0, 0, size, size);
      const ry = t * 0.004 + mouse.x * 0.6;
      const rx = 0.35 + mouse.y * 0.45;
      const cx0 = Math.cos(rx);
      const sx0 = Math.sin(rx);
      for (let i = 0; i < N; i++) {
        const px0 = A[i].x + (B[i].x - A[i].x) * k;
        const py0 = A[i].y + (B[i].y - A[i].y) * k;
        const pz0 = A[i].z + (B[i].z - A[i].z) * k;
        const x1 = px0 * Math.cos(ry) + pz0 * Math.sin(ry);
        const z1 = -px0 * Math.sin(ry) + pz0 * Math.cos(ry);
        const y1 = py0 * cx0 - z1 * sx0;
        const z2 = py0 * sx0 + z1 * cx0;
        const depth = (z2 + 1) / 2;
        const px = size / 2 + x1 * R;
        const py = size / 2 + y1 * R;
        ctx.beginPath();
        ctx.arc(px, py, 0.7 + depth * 1.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(10,10,10,${(0.03 + depth * 0.2).toFixed(3)})`;
        ctx.fill();
      }
      t += 1;
      if (!reduced) raf = requestAnimationFrame(frame);
    };

    frame();
    if (!reduced) window.addEventListener("pointermove", onMove, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, [reduced, size]);

  return <canvas ref={ref} style={{ width: size, height: size }} className="block" aria-hidden="true" />;
};

const trusted = [
  "National AI Office",
  "Ministry of Strategy",
  "PolicyLab",
  "Sovereign Fund",
  "Gov Innovation Unit",
  "Digital Authority",
];

const ease = [0.22, 1, 0.36, 1] as const;

/** Word-by-word blur "typing" reveal for the hero heading. */
const headWord = {
  hidden: { opacity: 0, y: 14, filter: "blur(12px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.55, ease } },
};

const LandingHero = () => {
  const reduced = false; // animations always on — iOS Reduce Motion must not kill the site
  // hero-03-style motion heading: staggered rise with a blur-to-sharp reveal
  const item = (i: number) => ({
    initial: reduced ? false : { opacity: 0, y: 26, filter: "blur(8px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { duration: 0.7, delay: 0.08 + i * 0.11, ease },
  });

  return (
    <section className="relative bg-white overflow-hidden" aria-labelledby="hero-h">
      <div className="relative max-w-[1200px] mx-auto px-6 pt-16 pb-16 md:pt-24 md:pb-24 min-h-[88vh] flex flex-col">
        {/* dotted orb: background layer centred on the heading — half above, half below */}
        <motion.div
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.5 }}
          className="absolute left-1/2 top-[36%] -translate-x-1/2 -translate-y-1/2 z-0 pointer-events-none"
          aria-hidden="true"
        >
          <div className="animate-orb-zoom">
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] h-[380px] rounded-full opacity-10 blur-[80px] [background:var(--gradient-accent)]" />
            <HeroOrb size={440} />
          </div>
        </motion.div>
        <div className="relative z-10 text-center my-auto">
          <motion.p
            {...item(0)}
            className="font-display font-bold text-xs tracking-[0.12em] uppercase text-muted-foreground flex items-center justify-center gap-3 mt-2"
          >
            <span className="inline-block w-2 h-2 [background:var(--gradient-accent)]" aria-hidden="true" />
            AI-native strategy consulting
            <span className="inline-block w-2 h-2 [background:var(--gradient-accent)]" aria-hidden="true" />
          </motion.p>

          <motion.h1
            id="hero-h"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.11, delayChildren: 0.24 } } }}
            className="font-display text-[clamp(1.9rem,4.6vw,3.8rem)] leading-[1.08] tracking-[-0.03em] max-w-[23ch] mx-auto mt-7"
          >
            {["Transforming", "public", "sector"].map((w) => (
              <motion.span key={w} variants={headWord} className="inline-block whitespace-pre">
                {w}{" "}
              </motion.span>
            ))}
            <motion.span variants={headWord} className="inline-block">
              <span className="text-gradient-accent">strategy</span>
            </motion.span>
          </motion.h1>

          <motion.p {...item(2)} className="max-w-[580px] mx-auto mt-6 text-muted-foreground text-lg">
            From rigorous strategy design to board-ready deliverables.
          </motion.p>

          <motion.div {...item(3)} className="relative mt-10 flex gap-4 justify-center items-center flex-wrap">
            <a
              href="https://www.lam13.ai/auth"
              target="_blank"
              rel="noopener noreferrer"
              className="relative font-display text-[15px] bg-foreground text-background px-8 py-4 min-h-[52px] inline-flex items-center gap-2.5 transition-all hover:[background:var(--gradient-accent)] hover:text-white group"
            >
              Start free
              <span className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true">
                ↗
              </span>
            </a>
            <a
              href="#chatbot"
              className="relative font-display text-[15px] border border-foreground/30 bg-white/70 backdrop-blur-sm px-8 py-4 min-h-[52px] inline-flex items-center transition-colors hover:border-foreground hover:bg-white"
            >
              See it think
            </a>
          </motion.div>
        </div>

        <motion.div {...item(5)} className="relative z-10 mt-16 md:mt-14">
          <p className="font-body font-bold text-[15px] tracking-[0.08em] text-foreground/80 text-center mb-12">
            Trusted by Public-Sector &amp; Research Innovators
          </p>
          <div className="overflow-hidden marquee-mask marquee-paused">
            <div className="flex gap-16 w-max items-center animate-marquee">
              {[...trusted, ...trusted].map((name, i) => (
                <span
                  key={`${name}-${i}`}
                  aria-hidden={i >= trusted.length || undefined}
                  className="font-display font-bold text-[17px] md:text-[19px] tracking-tight text-foreground/75 whitespace-nowrap"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default LandingHero;
