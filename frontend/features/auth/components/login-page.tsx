"use client";

import Link from "next/link";
import { ShieldCheckIcon, ArrowsLeftRightIcon } from "@phosphor-icons/react";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-6 sm:px-8">
        <header className="flex items-center justify-between">
          <Link
            href="/login"
            className="flex items-center gap-3 font-heading font-semibold"
            aria-label="RecordShield sign in"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <ShieldCheckIcon aria-hidden="true" className="size-5" weight="duotone" />
            </span>
            RecordShield
          </Link>
          <ThemeToggle />
        </header>
        <div className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-2 lg:gap-24">
          <section>
            <span className="inline-flex items-center gap-2 text-sm font-medium text-primary">
              <ArrowsLeftRightIcon aria-hidden="true" />
              Connected patient care
            </span>
            <h1 className="mt-5 max-w-lg font-heading text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
              The right records.
              <br />
              At the point of care.
            </h1>
            <p className="mt-6 max-w-md text-base leading-7 text-muted-foreground">
              Review patient records, coordinate access across hospitals, and keep patients in
              control of sharing.
            </p>
            <div className="mt-8 max-w-md border-l-2 border-primary/25 pl-4 text-sm leading-6 text-muted-foreground">
              One place for your care team.
              <br />
              Clear consent. Traceable access.
            </div>
          </section>
          <section
            aria-labelledby="sign-in-heading"
            className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"
          >
            <h2 id="sign-in-heading" className="font-heading text-2xl font-semibold tracking-tight">
              Welcome back
            </h2>
            <p className="mt-2 mb-7 text-sm text-muted-foreground">
              Sign in to continue to your account.
            </p>
            <LoginForm />
          </section>
        </div>
        <footer className="flex flex-wrap justify-between gap-2 border-t border-border py-5 text-xs text-muted-foreground">
          <span>RecordShield · Connected care</span>
          <span>Need an account? Contact your hospital administrator.</span>
        </footer>
      </div>
    </main>
  );
}
