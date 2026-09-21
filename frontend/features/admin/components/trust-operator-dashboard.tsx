"use client";

import { AdminHeader } from "./admin-header";
import { SuspensionPanel } from "./suspension-panel";

export function TrustOperatorDashboard() {
  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-4xl px-4 py-7 sm:px-6 lg:px-10 lg:py-10"
    >
      <AdminHeader />
      <section className="mt-7 space-y-5">
        <SuspensionPanel mode="trust" />
        <p className="rounded-xl border border-border/70 bg-muted/25 p-5 text-sm leading-6 text-muted-foreground">
          Trust actions are limited to organization and membership suspension. Clinical records
          remain outside this authority boundary.
        </p>
      </section>
    </main>
  );
}
