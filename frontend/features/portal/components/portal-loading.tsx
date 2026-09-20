"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function PortalLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-10">
      <Skeleton className="h-12 w-56" />
      <Skeleton className="h-32 rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </main>
  );
}
