import type { Role } from "@/lib/api/contracts/auth";

export type DemoIdentity = {
  username: string;
  label: string;
  description: string;
  role: Role | "PATIENT";
  organization: string;
  mode: "MOCK_EMR" | "LITE" | "PATIENT" | "TRUST";
};

/**
 * These are the named synthetic accounts used by the demo. They are selection
 * hints only; the server still authenticates the submitted credentials and
 * returns the authoritative context.
 */
export const demoIdentities: DemoIdentity[] = [
  {
    username: "amina.unity",
    label: "Amina Yusuf",
    description: "Emergency clinician",
    role: "EMERGENCY_DOCTOR",
    organization: "Unity Medical",
    mode: "LITE",
  },
  {
    username: "grace.unity",
    label: "Grace Okafor",
    description: "Nurse / midwife",
    role: "NURSE_MIDWIFE",
    organization: "Unity Medical",
    mode: "LITE",
  },
  {
    username: "kunle.mercy",
    label: "Kunle Adeyemi",
    description: "Attending doctor",
    role: "ATTENDING_DOCTOR",
    organization: "Mercy General",
    mode: "MOCK_EMR",
  },
  {
    username: "john.mercy",
    label: "John Mensah",
    description: "Health attendant",
    role: "CLERK_HEALTH_ATTENDANT",
    organization: "Mercy General",
    mode: "MOCK_EMR",
  },
  {
    username: "musa.patient",
    label: "Musa Ibrahim",
    description: "Patient portal",
    role: "PATIENT",
    organization: "RecordShield",
    mode: "PATIENT",
  },
  {
    username: "sarah.unity",
    label: "Sarah Bello",
    description: "Security administrator",
    role: "SECURITY_ADMIN",
    organization: "Unity Medical",
    mode: "LITE",
  },
  {
    username: "trust.operator",
    label: "Trust operator",
    description: "Exchange security operator",
    role: "TRUST_OPERATOR",
    organization: "Trust network",
    mode: "TRUST",
  },
];

export const DEMO_PASSWORD = "synthetic-example-password";
