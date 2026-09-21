import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import { CareNetwork } from "./care-network";

export function LandingHero() {
  return (
    <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:px-12 lg:py-24">
      <div>
        <p className="mb-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.17em] text-primary">
          <span className="size-2 rounded-full bg-primary" aria-hidden="true" /> Patient care,
          connected.
        </p>
        <h1 className="max-w-2xl font-heading text-5xl leading-[1.06] font-semibold tracking-[-0.055em] text-balance sm:text-6xl lg:text-7xl">
          Care moves.
          <br />
          <span className="text-primary">
            Records should
            <br className="hidden lg:block" /> move with it.
          </span>
        </h1>
        <p className="mt-7 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
          Give care teams the patient information they need, with thoughtful control over who can
          see it, when, and why.
        </p>
        <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
          Connect your hospital’s existing record system, or start with a lightweight electronic
          medical record built into RecordShield.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-5">
          <Link
            href="/login"
            className="inline-flex min-h-12 items-center gap-3 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Explore the product <ArrowRightIcon aria-hidden="true" size={18} />
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex min-h-12 items-center gap-2 text-sm font-semibold text-primary hover:underline"
          >
            See how it works <span aria-hidden="true">↓</span>
          </a>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Explore with sample accounts and fictional patient records.
        </p>
      </div>
      <CareNetwork />
    </section>
  );
}
