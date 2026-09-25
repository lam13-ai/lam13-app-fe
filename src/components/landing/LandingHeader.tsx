import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import Spark from "./Spark";

const navLinks = [
  { label: "Live Demo", href: "/#chatbot" },
  { label: "What we do", href: "/#services" },
  { label: "Team", href: "/#team" },
];

const LandingHeader = () => {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 bg-white/90 backdrop-blur-xl transition-colors border-b ${
        scrolled ? "border-foreground/15" : "border-transparent"
      }`}
    >
      <div className="w-full px-5 sm:px-8">
        <div className="flex items-center justify-between h-[68px]">
          <a href="/" className="flex items-center gap-2 font-display font-bold text-[19px] tracking-tight">
            <Spark className="text-foreground" />
            <span>
              Lam13<span className="text-gradient-accent">.ai</span>
            </span>
          </a>

          <nav className="hidden md:flex items-center gap-0.5" aria-label="Primary">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="font-display text-[13.5px] text-muted-foreground px-3 py-2.5 hover:text-foreground hover:bg-foreground/5 transition-colors"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-2.5">
            <a
              href="https://www.lam13.ai/auth"
              target="_blank"
              rel="noopener noreferrer"
              className="font-display text-sm border border-foreground px-4 py-2.5 hover:bg-foreground hover:text-background transition-colors"
            >
              Sign in
            </a>
            <a
              href="https://www.lam13.ai/auth"
              target="_blank"
              rel="noopener noreferrer"
              className="font-display text-sm bg-foreground text-background px-4 py-2.5 transition-all hover:[background:var(--gradient-accent)] hover:text-white"
            >
              Start free
            </a>
          </div>

          <button
            className="md:hidden text-foreground p-2"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {open && (
          <nav className="md:hidden py-4 border-t border-foreground/15 flex flex-col gap-1" aria-label="Mobile">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="font-display text-sm text-muted-foreground px-3 py-3 hover:text-foreground hover:bg-foreground/5"
              >
                {l.label}
              </a>
            ))}
            <div className="flex gap-2.5 pt-3">
              <a href="https://www.lam13.ai/auth" target="_blank" rel="noopener noreferrer" className="flex-1 text-center font-display text-sm border border-foreground px-4 py-3">
                Sign in
              </a>
              <a href="https://www.lam13.ai/auth" target="_blank" rel="noopener noreferrer" className="flex-1 text-center font-display text-sm bg-foreground text-background px-4 py-3">
                Start free
              </a>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
};

export default LandingHeader;
