"use client";

import { redirect, useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { useLogout, useSession } from "@/hooks/auth";
import { usePortal } from "@/hooks/exchange";
import { PortalLoading, PortalPageView, PortalState } from "./components";

export default function PortalPage() {
  const router = useRouter();
  const session = useSession();
  const logout = useLogout();
  const context = session.data;
  const portal = usePortal(Boolean(context?.user.kind === "PATIENT"));

  if (session.isPending) return <PortalLoading />;
  if (session.error instanceof ApiError && session.error.status === 401) redirect("/login");
  if (!context || context.user.kind !== "PATIENT") {
    return (
      <PortalState
        title="Patient portal only"
        description="Sign in with the patient account linked to the request."
      />
    );
  }
  if (portal.isPending) return <PortalLoading />;
  if (portal.error) {
    return <PortalState title="Portal unavailable" description={portal.error.message} />;
  }
  if (!portal.data) {
    return (
      <PortalState
        title="Portal unavailable"
        description="We couldn’t load your account. Please sign in again."
      />
    );
  }

  return (
    <PortalPageView
      data={portal.data}
      hasMore={portal.hasNextPage}
      isLoadingMore={portal.isFetchingNextPage}
      onLoadMore={() => portal.fetchNextPage()}
      isLoggingOut={logout.isPending}
      onLogout={() => logout.mutate(undefined, { onSettled: () => router.replace("/login") })}
    />
  );
}
