import { Skeleton } from "@/components/ui/skeleton";

export function DowntimeLoading() {
  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-10 lg:py-10"
    >
      <span role="status" className="sr-only">
        Loading downtime controls…
      </span>
      <div aria-hidden="true" className="space-y-3">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <Skeleton className="h-36 rounded-xl" aria-hidden="true" />
      <Skeleton className="h-80 rounded-xl" aria-hidden="true" />
    </main>
  );
}
