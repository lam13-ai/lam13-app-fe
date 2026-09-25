import { useEffect } from "react";
import LandingHeader from "@/components/landing/LandingHeader";
import LandingFooter from "@/components/landing/LandingFooter";

const Terms = () => {
  useEffect(() => {
    document.title = "Terms and Conditions | Lam13.ai";
    
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute("content", "Lam13.ai Terms and Conditions. Understand your rights and responsibilities when using our AI native strategy consulting services and website.");
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <LandingHeader />
      
      <main className="flex-1 pt-16 pb-16">
        <div className="container mx-auto px-6 max-w-4xl">
          <h1 className="text-4xl md:text-5xl font-bold mb-8 text-gradient-accent">
            Terms and Conditions
          </h1>
          
          <div className="space-y-8 text-foreground/80">
            <section>
              <p className="text-sm text-foreground/60 mb-8">
                Last Updated: December 2, 2025
              </p>
              
              <p className="mb-6">
                Welcome to LAM13.ai. These Terms and Conditions govern your use of our website and services. By accessing or using our services, you agree to be bound by these terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-foreground">1. Acceptance of Terms</h2>
              <p className="mb-4">
                By accessing and using LAM13.ai's website and services, you accept and agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use our services.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-foreground">2. Description of Services</h2>
              <p className="mb-4">
                LAM13.ai provides AI-native strategy consulting services, including but not limited to:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Strategic planning and policy development</li>
                <li>Large Agentic Models (LAM) implementation consulting</li>
                <li>AI integration and optimization services</li>
                <li>Public sector digital transformation advisory</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-foreground">3. User Responsibilities</h2>
              <p className="mb-4">You agree to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Provide accurate and complete information</li>
                <li>Maintain the confidentiality of any account credentials</li>
                <li>Use our services in compliance with applicable laws and regulations</li>
                <li>Not engage in any activity that disrupts or interferes with our services</li>
                <li>Not attempt to gain unauthorized access to our systems</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-foreground">4. Intellectual Property Rights</h2>
              <p className="mb-4">
                All content, materials, and intellectual property on our website and in our services are owned by or licensed to LAM13.ai. You may not reproduce, distribute, modify, or create derivative works without our express written permission.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-foreground">5. Consulting Services Agreement</h2>
              <p className="mb-4">
                Specific consulting engagements will be governed by separate service agreements that detail the scope of work, deliverables, timelines, and fees. These Terms and Conditions supplement but do not replace such agreements.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-foreground">6. Confidentiality</h2>
              <p className="mb-4">
                We recognize that in the course of providing our services, we may have access to confidential information. We commit to maintaining the confidentiality of such information in accordance with industry standards and applicable laws.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-foreground">7. Limitation of Liability</h2>
              <p className="mb-4">
                To the maximum extent permitted by law, LAM13.ai shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or related to your use of our services. Our total liability shall not exceed the amount paid by you for the specific service giving rise to the claim.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-foreground">8. Indemnification</h2>
              <p className="mb-4">
                You agree to indemnify and hold harmless LAM13.ai and its affiliates from any claims, damages, losses, or expenses arising from your use of our services or violation of these terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-foreground">9. Termination</h2>
              <p className="mb-4">
                We reserve the right to terminate or suspend access to our services at any time, with or without cause or notice, for conduct that we believe violates these Terms and Conditions or is harmful to other users, us, or third parties.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-foreground">10. Governing Law</h2>
              <p className="mb-4">
                These Terms and Conditions shall be governed by and construed in accordance with applicable international laws. Any disputes shall be resolved through binding arbitration.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-foreground">11. Changes to Terms</h2>
              <p className="mb-4">
                We reserve the right to modify these Terms and Conditions at any time. Changes will be effective immediately upon posting to our website. Your continued use of our services after changes are posted constitutes acceptance of the modified terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold mb-4 text-foreground">12. Contact Information</h2>
              <p className="mb-4">
                If you have any questions about these Terms and Conditions, please contact us at:
              </p>
              <p className="font-semibold">
                Email: legal@lam13.ai
              </p>
            </section>

            <section className="pt-4 border-t border-border/20">
              <p className="text-sm text-foreground/60">
                By using LAM13.ai's services, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions.
              </p>
            </section>
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
};

export default Terms;
