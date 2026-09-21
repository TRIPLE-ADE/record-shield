import type { Encounter } from "@/lib/api/contracts/records";
import type { SessionContext } from "@/lib/api/contracts/auth";

export type EmergencyPageProps = {
  patientId: string;
};

export type EmergencyActivationProps = {
  patientId: string;
  patientName?: string;
  organizationName: string;
  encounterId: string;
  sources: Array<{
    organization: { organization_id: string; name: string; mode: "MOCK_EMR" | "LITE" };
  }>;
  sessionContext: SessionContext & { organization: NonNullable<SessionContext["organization"]> };
};

export type EmergencyWorkspaceProps = Omit<EmergencyActivationProps, "encounterId" | "sources"> & {
  encounters: Encounter[];
};
