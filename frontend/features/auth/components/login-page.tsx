"use client";

import Link from "next/link";
import { LockKeyIcon, ShieldCheckIcon, SparkleIcon } from "@phosphor-icons/react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";
import { TrustNote } from "./trust-note";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-5 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/login"
            className="inline-flex items-center gap-3"
            aria-label="RecordShield sign in"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <ShieldCheckIcon aria-hidden="true" className="size-5" weight="duotone" />
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
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>

        <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(28rem,34rem)] lg:gap-20 lg:py-20">
          <section className="max-w-xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-3 py-1.5 text-xs font-semibold text-primary">
              <SparkleIcon aria-hidden="true" className="size-3.5" weight="duotone" />
              Trusted context
            </div>
            <h1 className="max-w-lg font-heading text-4xl font-semibold tracking-tighter text-balance sm:text-6xl sm:leading-[1.02]">
              Start with the person, then the permission.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg">
              RecordShield verifies an individual identity and reloads the hospital, role, ward, and
              shift context before any protected workspace is shown.
            </p>

            <div className="mt-10 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <TrustNote
                icon={<LockKeyIcon aria-hidden="true" />}
                title="Named access"
                copy="Every sign-in starts with an attributable account."
              />
              <TrustNote
                icon={<ShieldCheckIcon aria-hidden="true" />}
                title="Server context"
                copy="The returned session decides what the workspace can expose."
              />
              <TrustNote
                icon={<SparkleIcon aria-hidden="true" />}
                title="Clear boundaries"
                copy="The workspace reflects the context returned for this session."
              />
            </div>
          </section>

          <Card className="border-border/75 bg-card/90 shadow-xl shadow-primary/6 backdrop-blur-sm">
            <CardHeader className="border-b border-border/65 px-6 py-6 sm:px-7">
              <CardTitle className="text-xl">Sign in to your account</CardTitle>
              <CardDescription>Enter your username and password to continue.</CardDescription>
            </CardHeader>
            <CardContent className="px-6 py-6 sm:px-7">
              <LoginForm />
            </CardContent>
          </Card>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5 text-xs text-muted-foreground">
          <span>Protected workspace · server-derived access</span>
          <span className="font-mono">/login</span>
        </footer>
      </div>
    </main>
  );
}
