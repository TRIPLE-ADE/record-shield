"use client";

import { useQueryClient } from "@tanstack/react-query";
import { redirect, useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { useSession } from "@/hooks/auth";
import { WorkspaceLoading, WorkspaceOverview, WorkspaceUnavailable } from "./components";

export default function WorkspacePage() {
  const queryClient = useQueryClient();
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

  if (session.data.user.kind === "PATIENT") redirect("/portal");

  return (
    <WorkspaceOverview
      context={session.data}
      isFetching={session.isFetching}
      onRefresh={() => {
        void queryClient.invalidateQueries({ queryKey: ["patient-directory"] });
        void queryClient.invalidateQueries({ queryKey: ["exchange"] });
        void session.refetch();
      }}
    />
  );
}
