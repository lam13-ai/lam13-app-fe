import { useEffect } from "react";
import LandingHeader from "@/components/landing/LandingHeader";
import LandingHero from "@/components/landing/LandingHero";
import DemoPanel from "@/components/landing/DemoPanel";
import Services from "@/components/landing/Services";
import Team from "@/components/landing/Team";
import FinalCta from "@/components/landing/FinalCta";
import LandingFooter from "@/components/landing/LandingFooter";

const Index = () => {
  useEffect(() => {
    document.title = "AI Native Strategy Consulting | Lam13.ai";

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute(
        "content",
        "Disrupting strategy consulting through advanced, patented agentic AI — from national strategy design to board-ready deliverables."
      );
    }
  }, []);

  return (
    <div id="top" className="min-h-screen bg-background">
      <LandingHeader />
      <main>
        <LandingHero />
        <DemoPanel />
        <Services />
        <Team />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
};

export default Index;
