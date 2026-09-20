"use client";

import Link from "next/link";
import { ArrowUpRightIcon, LockKeyIcon, ShieldIcon, SparkleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-7 sm:px-10 lg:px-12">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-3" aria-label="RecordShield home">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <ShieldIcon aria-hidden="true" className="size-5" weight="duotone" />
            </span>
            <span>
              <span className="block font-heading text-sm font-semibold tracking-tight">
                RecordShield
              </span>
              <span className="block text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                Clinical trust layer
              </span>
            </span>
          </Link>
          <span className="rounded-full border border-border/80 bg-card/70 px-3 py-1.5 text-xs font-medium text-muted-foreground">
            Foundation preview
          </span>
        </header>

        <section className="flex flex-1 items-center py-20 sm:py-28">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-3 py-1.5 text-xs font-semibold text-primary">
              <SparkleIcon aria-hidden="true" className="size-3.5" weight="duotone" />
              Product foundation
            </div>
            <h1 className="max-w-2xl font-heading text-4xl font-semibold tracking-tighter text-balance sm:text-6xl sm:leading-[1.02]">
              A calmer way to build clinical trust.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              The product workspace will come after the shared visual language is ready. For now,
              explore the patterns that make sensitive decisions clear, reviewable, and consistent.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/login">
                  Enter workspace
                  <ArrowUpRightIcon aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/design-system">
                  View design system
                  <ArrowUpRightIcon aria-hidden="true" />
                </Link>
              </Button>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <LockKeyIcon aria-hidden="true" className="size-3.5 text-primary" />
                No live patient data
              </span>
            </div>
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5 text-xs text-muted-foreground">
          <span>Shared components and safety states are being shaped here first.</span>
          <span className="font-mono">/design-system</span>
        </footer>
      </div>
    </main>
  );
}
