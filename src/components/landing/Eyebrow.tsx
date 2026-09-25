interface EyebrowProps {
  children: string;
  center?: boolean;
  light?: boolean;
}

/** Mono section label with gradient square marker. */
const Eyebrow = ({ children, center, light }: EyebrowProps) => (
  <p
    className={`font-display text-xs tracking-[0.22em] uppercase flex items-center gap-3 ${
      center ? "justify-center" : ""
    } ${light ? "text-white/60" : "text-muted-foreground"}`}
  >
    <span className="inline-block w-2 h-2 [background:var(--gradient-accent)]" aria-hidden="true" />
    {children}
    {center && <span className="inline-block w-2 h-2 [background:var(--gradient-accent)]" aria-hidden="true" />}
  </p>
);

export default Eyebrow;
