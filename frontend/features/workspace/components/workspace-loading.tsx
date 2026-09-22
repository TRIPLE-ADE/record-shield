import { LoadingRows } from "@/components/loading-rows";
import { Skeleton } from "@/components/ui/skeleton";

export function WorkspaceLoading() {
  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-7xl space-y-7 px-4 py-8 sm:px-6 lg:px-10"
    >
      <div className="space-y-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div aria-hidden="true" className="border-b border-border p-5">
          <Skeleton className="h-5 w-40" />
        </div>
        <LoadingRows label="Loading patients…" />
      </div>
    </main>
  );
}
