import type { SessionContext } from "@/lib/api/contracts/auth";

export type EmergencyPageProps = {
  patientId: string;
};

export type EmergencyWorkspaceProps = {
  patientId: string;
  patientName?: string;
  organizationName: string;
  encounterId: string;
  sessionContext: SessionContext & { organization: NonNullable<SessionContext["organization"]> };
  sources: Array<{
    organization: { organization_id: string; name: string; mode: "MOCK_EMR" | "LITE" };
  }>;
};
