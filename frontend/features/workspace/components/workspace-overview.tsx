"use client";

import { AssignedPatients } from "./assigned-patients";
import { WorkspaceAdministration } from "./workspace-administration";
import { WorkspaceHeader } from "./workspace-header";
import { WorkspaceRequests } from "./workspace-requests";
import { WorkspaceShift } from "./workspace-shift";
import { isTreatingPractitioner } from "@/utils/authorization";
import type { WorkspaceOverviewProps } from "../types";

export function WorkspaceOverview({ context, isFetching, onRefresh }: WorkspaceOverviewProps) {
  const canReadPatients = context.permissions_summary.includes("local_records.read_with_context");
  const canRequest = isTreatingPractitioner(context.role);
  const isSecurity = context.role === "SECURITY_ADMIN" || context.role === "TRUST_OPERATOR";

  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-7xl space-y-7 px-4 py-7 sm:px-6 lg:px-10"
    >
      <WorkspaceHeader
        context={context}
        isFetching={isFetching}
        onRefresh={onRefresh}
        isSecurity={isSecurity}
      />
      {context.shift ? (
        <WorkspaceShift shift={context.shift} username={context.user.username} />
      ) : null}
      {canReadPatients ? <AssignedPatients context={context} /> : null}
      {canRequest ? <WorkspaceRequests /> : null}
      {isSecurity ? <WorkspaceAdministration role={context.role} /> : null}
    </main>
  );
}
