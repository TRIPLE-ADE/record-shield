import Link from "next/link";
import { ArrowUpRightIcon, ShieldCheckIcon } from "@phosphor-icons/react/dist/ssr";

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-secondary/35">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:px-12">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
              See connected care in practice.
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Explore the clinician, patient, and security experiences.
            </p>
          </div>
          <Link
            href="/login"
            className="inline-flex min-h-12 items-center gap-3 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Open the preview <ArrowUpRightIcon aria-hidden="true" size={18} />
          </Link>
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheckIcon aria-hidden="true" size={20} className="text-primary" />
            RecordShield
          </span>
          <p>Patient care. Controlled sharing. Clear accountability.</p>
          <a href="#main-content" className="inline-flex min-h-11 items-center hover:text-primary">
            Back to top ↑
          </a>
        </div>
      </div>
    </footer>
  );
}
