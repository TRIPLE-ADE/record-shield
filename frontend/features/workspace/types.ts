import type { SessionContext } from "@/lib/api/contracts/auth";

export type WorkspaceUnavailableProps = {
  isContextDenied: boolean;
  onReturn: () => void;
};

export type WorkspaceOverviewProps = {
  context: SessionContext;
  isFetching: boolean;
  onRefresh: () => void;
};
