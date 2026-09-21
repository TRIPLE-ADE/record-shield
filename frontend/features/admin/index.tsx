"use client";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { useSession } from "@/hooks/auth";
import { AdminDashboard, AdminLoading, AdminState, TrustOperatorDashboard } from "./components";

export default function AdminPage() {
  const session = useSession();
  if (session.error instanceof ApiError && session.error.status === 401) redirect("/login");
  if (session.isPending) return <AdminLoading />;
  if (!session.data) {
    return (
      <AdminState
        title="Administration is restricted"
        description="Sign in with an authorized security context to continue."
      />
    );
  }
  if (session.data.role === "TRUST_OPERATOR") {
    return <TrustOperatorDashboard />;
  }
  if (session.data.role !== "SECURITY_ADMIN" || !session.data.organization) {
    return (
      <AdminState
        title="Administration is restricted"
        description="Only a local security administrator can manage hospital policy and duty context."
      />
    );
  }
  return <AdminDashboard context={session.data} />;
}
