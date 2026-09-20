"use client";

import { redirect, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/client";
import { sessionQueryKey, useSession } from "@/features/auth/use-session";
import { WorkspaceOverview, WorkspaceUnavailable } from "./components/workspace-overview";

export default function WorkspacePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();

  if (session.error instanceof ApiError && session.error.status === 401) {
    redirect("/login");
  }

  if (session.isPending) return <WorkspaceLoading />;

  if (!session.data) {
    const isContextDenied = session.error instanceof ApiError && session.error.status === 403;
    return (
      <WorkspaceUnavailable
        isContextDenied={isContextDenied}
        onReturn={() => router.replace("/login")}
      />
    );
  }

  return (
    <WorkspaceOverview
      context={session.data}
      isFetching={session.isFetching}
      onRefresh={() => queryClient.invalidateQueries({ queryKey: sessionQueryKey })}
    />
  );
}

function WorkspaceLoading() {
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
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </main>
  );
}
