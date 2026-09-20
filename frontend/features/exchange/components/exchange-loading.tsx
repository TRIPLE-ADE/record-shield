"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function ExchangeLoading() {
  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-10"
    >
      <Skeleton className="h-5 w-36" />
      <Skeleton className="h-32 rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </main>
  );
}
