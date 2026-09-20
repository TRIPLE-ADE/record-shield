"use client";

import { redirect, useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { useSession } from "@/hooks/auth";
import { WorkspaceLoading, WorkspaceOverview, WorkspaceUnavailable } from "./components";

export default function WorkspacePage() {
  const router = useRouter();
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
      onRefresh={() => session.refetch()}
    />
  );
}
