import { LandingHeader } from "./components/landing-header";
import { LandingHero } from "./components/landing-hero";
import { ProductSections } from "./components/product-sections";
import { LandingFooter } from "./components/landing-footer";

export default function LandingPage() {
  return (
    <div className="bg-background text-foreground selection:bg-primary/15">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:p-3"
      >
        Skip to content
      </a>
      <LandingHeader />
      <main id="main-content">
        <LandingHero />
        <ProductSections />
      </main>
      <LandingFooter />
    </div>
  );
}
