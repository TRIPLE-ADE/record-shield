"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function PatientRecordsLoading() {
  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-10"
    >
      <Skeleton className="h-5 w-36" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </main>
  );
}
