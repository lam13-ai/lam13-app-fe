import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Animations are part of the design and must run everywhere — including
// iPhones with Reduce Motion / Low Power Mode, which otherwise freeze
// canvas orbs (thinking-orbs), framer-motion and CSS animations. Shim
// matchMedia so "prefers-reduced-motion" never reports a reduce preference
// to any library.
const origMatchMedia = window.matchMedia?.bind(window);
if (origMatchMedia) {
  window.matchMedia = ((query: string) => {
    if (typeof query === "string" && query.includes("prefers-reduced-motion")) {
      const wantsReduce = query.includes("reduce");
      // "reduce" must never match; "no-preference" must always match
      return origMatchMedia(wantsReduce ? "(min-width: 999999px)" : "(min-width: 0px)");
    }
    return origMatchMedia(query);
  }) as typeof window.matchMedia;
}

createRoot(document.getElementById("root")!).render(<App />);
