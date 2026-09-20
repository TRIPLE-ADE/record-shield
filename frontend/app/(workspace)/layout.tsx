import type { ReactNode } from "react";
import { QueryProvider } from "@/lib/query/provider";
import { WorkspaceShell } from "@/components/workspace-shell";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <WorkspaceShell>{children}</WorkspaceShell>
    </QueryProvider>
  );
}
