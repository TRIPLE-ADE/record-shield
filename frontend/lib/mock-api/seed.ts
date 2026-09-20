import type { Role, Source } from "@/lib/api/contracts/auth";

export const DEMO_PASSWORD = "synthetic-example-password";

export type MockIdentity = {
  user: {
    id: string;
    username: string;
    kind: "STAFF" | "PATIENT";
  };
  password: string;
  membershipId: string | null;
  role: Role | null;
  organization: Source | null;
  patientId: string | null;
  shiftId: string | null;
  permissions: string[];
  active: boolean;
  membershipActive: boolean;
};

const mercyGeneral: Source = {
  organization_id: "00000000-0000-4000-8000-000000000002",
  name: "Mercy General",
  mode: "MOCK_EMR",
};

const unityMedical: Source = {
  organization_id: "00000000-0000-4000-8000-000000000003",
  name: "Unity Medical",
  mode: "LITE",
};

const sharedShift = (id: string) => id;

export const mockIdentities: MockIdentity[] = [
  {
    user: {
      id: "00000000-0000-4000-8000-000000000004",
      username: "amina.unity",
      kind: "STAFF",
    },
    password: DEMO_PASSWORD,
    membershipId: "00000000-0000-4000-8000-000000000005",
    role: "EMERGENCY_DOCTOR",
    organization: unityMedical,
    patientId: null,
    shiftId: sharedShift("00000000-0000-4000-8000-000000000017"),
    permissions: [
      "local_records.read_with_context",
      "consent.request",
      "emergency.activate_with_context",
    ],
    active: true,
    membershipActive: true,
  },
  {
    user: {
      id: "00000000-0000-4000-8000-000000000006",
      username: "grace.unity",
      kind: "STAFF",
    },
    password: DEMO_PASSWORD,
    membershipId: "00000000-0000-4000-8000-000000000007",
    role: "NURSE_MIDWIFE",
    organization: unityMedical,
    patientId: null,
    shiftId: sharedShift("00000000-0000-4000-8000-000000000018"),
    permissions: ["local_records.read_with_context", "local_records.write"],
    active: true,
    membershipActive: true,
  },
  {
    user: {
      id: "00000000-0000-4000-8000-000000000008",
      username: "kunle.mercy",
      kind: "STAFF",
    },
    password: DEMO_PASSWORD,
    membershipId: "00000000-0000-4000-8000-000000000009",
    role: "ATTENDING_DOCTOR",
    organization: mercyGeneral,
    patientId: null,
    shiftId: sharedShift("00000000-0000-4000-8000-000000000019"),
    permissions: ["local_records.read_with_context", "consent.request"],
    active: true,
    membershipActive: true,
  },
  {
    user: {
      id: "00000000-0000-4000-8000-000000000010",
      username: "john.mercy",
      kind: "STAFF",
    },
    password: DEMO_PASSWORD,
    membershipId: "00000000-0000-4000-8000-000000000011",
    role: "CLERK_HEALTH_ATTENDANT",
    organization: mercyGeneral,
    patientId: null,
    shiftId: sharedShift("00000000-0000-4000-8000-000000000020"),
    permissions: ["local_records.read_with_context"],
    active: true,
    membershipActive: true,
  },
  {
    user: {
      id: "00000000-0000-4000-8000-000000000012",
      username: "sarah.unity",
      kind: "STAFF",
    },
    password: DEMO_PASSWORD,
    membershipId: "00000000-0000-4000-8000-000000000013",
    role: "SECURITY_ADMIN",
    organization: unityMedical,
    patientId: null,
    shiftId: sharedShift("00000000-0000-4000-8000-000000000021"),
    permissions: ["security.events.read", "security.alerts.review"],
    active: true,
    membershipActive: true,
  },
  {
    user: {
      id: "00000000-0000-4000-8000-000000000014",
      username: "musa.patient",
      kind: "PATIENT",
    },
    password: DEMO_PASSWORD,
    membershipId: null,
    role: null,
    organization: null,
    patientId: "00000000-0000-4000-8000-000000000001",
    shiftId: null,
    permissions: [],
    active: true,
    membershipActive: true,
  },
  {
    user: {
      id: "00000000-0000-4000-8000-000000000015",
      username: "trust.operator",
      kind: "STAFF",
    },
    password: DEMO_PASSWORD,
    membershipId: "00000000-0000-4000-8000-000000000016",
    role: "TRUST_OPERATOR",
    organization: null,
    patientId: null,
    shiftId: null,
    permissions: ["trust.organizations.read", "security.exchange_events.read"],
    active: true,
    membershipActive: true,
  },
];

export function findMockIdentity(username: string) {
  return mockIdentities.find((identity) => identity.user.username === username);
}
