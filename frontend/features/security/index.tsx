"use client";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { useSession } from "@/hooks/auth";
import { SecurityDashboard, SecurityLoading, SecurityState } from "./components";

export default function SecurityPage() {
  const session = useSession();
  if (session.error instanceof ApiError && session.error.status === 401) redirect("/login");
  if (session.isPending) return <SecurityLoading />;
  if (!session.data) {
    return (
      <SecurityState
        title="Security context unavailable"
        description="Sign in with an authorized security or trust-operator context to view this stream."
      />
    );
  }
  const canRead =
    (session.data.role === "SECURITY_ADMIN" || session.data.role === "TRUST_OPERATOR") &&
    Boolean(session.data.security_stream_id);
  if (!canRead) {
    return (
      <SecurityState
        title="Security evidence is restricted"
        description="Your current work context does not include security stream access."
      />
    );
  }
  return <SecurityDashboard context={session.data} />;
}
