"use client";

import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { useSession } from "@/hooks/auth";
import { PatientDirectoryLoading, PatientDirectoryState, PatientDirectoryView } from "./components";

export default function PatientDirectoryPage() {
  const session = useSession();

  if (session.error instanceof ApiError && session.error.status === 401) redirect("/login");
  if (session.isPending) return <PatientDirectoryLoading />;
  if (!session.data) {
    return (
      <PatientDirectoryState
        kind="denied"
        title="Patient directory unavailable"
        description="Sign in with your hospital account to view assigned patients."
      />
    );
  }

  const canRead = Boolean(
    session.data.organization &&
    session.data.permissions_summary.includes("local_records.read_with_context"),
  );
  if (!canRead) {
    return (
      <PatientDirectoryState
        kind="denied"
        title="Patient directory is restricted"
        description="Your current role or care assignment does not allow you to view this patient list."
      />
    );
  }

  return <PatientDirectoryView context={session.data} />;
}
