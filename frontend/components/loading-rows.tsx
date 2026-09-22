import { Skeleton } from "@/components/ui/skeleton";

/** Stable placeholders for lists while their first authorized response is pending. */
export function LoadingRows({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-label={label} className="divide-y divide-border">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} aria-hidden="true" className="flex min-h-24 items-center gap-4 p-5">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="hidden h-8 w-24 shrink-0 sm:block" />
        </div>
      ))}
    </div>
  );
}
