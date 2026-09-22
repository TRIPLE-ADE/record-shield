import type { SessionContext } from "@/lib/api/contracts/auth";

export type AuthorizedSessionContext = SessionContext & {
  organization: NonNullable<SessionContext["organization"]>;
};

export type PatientRecordsPageProps = {
  patientId: string;
};
