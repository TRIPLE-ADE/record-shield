import Link from "next/link";
import { ShieldCheckIcon, ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";

export function LandingHeader() {
  return (
    <header className="border-b border-border/60">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-5 sm:px-8 lg:px-12">
        <Link
          href="/"
          aria-label="RecordShield home"
          className="flex items-center gap-2.5 font-heading text-xl font-semibold tracking-tight"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheckIcon aria-hidden="true" size={23} weight="duotone" />
          </span>
          RecordShield
        </Link>
        <nav
          aria-label="Product navigation"
          className="hidden items-center gap-8 text-sm text-muted-foreground md:flex"
        >
          <a href="#product" className="hover:text-primary">
            The product
          </a>
          <a href="#how-it-works" className="hover:text-primary">
            How it works
          </a>
          <a href="#questions" className="hover:text-primary">
            Questions
          </a>
        </nav>
        <Link
          href="/login"
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-primary/25 px-5 text-sm font-semibold text-primary transition-colors hover:bg-primary/5"
        >
          Sign in <ArrowUpRightIcon aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
