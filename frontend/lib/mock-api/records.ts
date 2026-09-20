import type { ClinicalRecord } from "@/lib/api/contracts/records";

export const DEMO_PATIENT_ID = "00000000-0000-4000-8000-000000000001";
export const DEMO_MERCY_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000002";
export const DEMO_UNITY_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000003";
export const DEMO_MERCY_ENCOUNTER_ID = "00000000-0000-4000-8000-000000000006";
export const DEMO_UNITY_ENCOUNTER_ID = "00000000-0000-4000-8000-000000000022";
export const DEMO_MERCY_WARD_ID = "00000000-0000-4000-8000-000000000007";
export const DEMO_UNITY_WARD_ID = "00000000-0000-4000-8000-000000000023";

const source = {
  mercy: {
    organization_id: DEMO_MERCY_ORGANIZATION_ID,
    name: "Mercy General",
    mode: "MOCK_EMR" as const,
  },
  unity: {
    organization_id: DEMO_UNITY_ORGANIZATION_ID,
    name: "Unity Medical",
    mode: "LITE" as const,
  },
};

function createRecord(
  input: Pick<ClinicalRecord, "id" | "domain" | "subtype" | "sensitivity" | "payload"> & {
    organization: "mercy" | "unity";
    localPatientId: string;
    encounterId: string;
    authorId: string;
    restrictedTags?: ClinicalRecord["restricted_tags"];
    observedAt: string;
  },
): ClinicalRecord {
  return {
    id: input.id,
    version_id: `${input.id.slice(0, -12)}9${input.id.slice(-11)}`,
    patient_id: DEMO_PATIENT_ID,
    encounter_id: input.encounterId,
    domain: input.domain,
    subtype: input.subtype,
    sensitivity: input.sensitivity,
    restricted_tags: input.restrictedTags ?? [],
    payload: input.payload,
    source: {
      organization_id: source[input.organization].organization_id,
      local_patient_id: input.localPatientId,
      record_id: input.id,
      version: 1,
    },
    author_id: input.authorId,
    observed_at: input.observedAt,
    recorded_at: input.observedAt,
    retrieved_at: input.observedAt,
    version: 1,
    supersedes_id: null,
    references: [],
  };
}

export function createSeedRecords(now: Date): ClinicalRecord[] {
  const observedAt = new Date(now.getTime() - 40 * 60 * 1000).toISOString();
  const olderObservedAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

  return [
    createRecord({
      id: "00000000-0000-4000-8000-000000000101",
      organization: "mercy",
      localPatientId: "PAT-00291",
      encounterId: DEMO_MERCY_ENCOUNTER_ID,
      authorId: "00000000-0000-4000-8000-000000000008",
      domain: "demographics",
      subtype: "demographics",
      sensitivity: "STANDARD",
      observedAt: olderObservedAt,
      payload: {
        name: "Musa Ibrahim",
        date_of_birth: "1987-04-12",
        gender: "male",
        contact: "+234 801 555 0192",
        address: "12 Unity Crescent, Lagos",
        next_of_kin: {
          name: "Hauwa Ibrahim",
          relationship: "Spouse",
          contact: "+234 801 555 0193",
        },
      },
    }),
    createRecord({
      id: "00000000-0000-4000-8000-000000000102",
      organization: "mercy",
      localPatientId: "PAT-00291",
      encounterId: DEMO_MERCY_ENCOUNTER_ID,
      authorId: "00000000-0000-4000-8000-000000000008",
      domain: "administration",
      subtype: "administration",
      sensitivity: "STANDARD",
      observedAt,
      payload: { ward_id: DEMO_MERCY_WARD_ID, bed: "B-12" },
    }),
    createRecord({
      id: "00000000-0000-4000-8000-000000000103",
      organization: "mercy",
      localPatientId: "PAT-00291",
      encounterId: DEMO_MERCY_ENCOUNTER_ID,
      authorId: "00000000-0000-4000-8000-000000000008",
      domain: "billing",
      subtype: "billing",
      sensitivity: "STANDARD",
      observedAt,
      payload: { billing_status: "PENDING", insurance_status: "RECORDED" },
    }),
    createRecord({
      id: "00000000-0000-4000-8000-000000000104",
      organization: "mercy",
      localPatientId: "PAT-00291",
      encounterId: DEMO_MERCY_ENCOUNTER_ID,
      authorId: "00000000-0000-4000-8000-000000000008",
      domain: "allergies",
      subtype: "allergy",
      sensitivity: "SENSITIVE",
      observedAt: olderObservedAt,
      payload: {
        substance: "Penicillin",
        reaction: "Rash",
        severity: "moderate",
        status: "active",
      },
    }),
    createRecord({
      id: "00000000-0000-4000-8000-000000000105",
      organization: "mercy",
      localPatientId: "PAT-00291",
      encounterId: DEMO_MERCY_ENCOUNTER_ID,
      authorId: "00000000-0000-4000-8000-000000000008",
      domain: "medications",
      subtype: "medication",
      sensitivity: "SENSITIVE",
      observedAt,
      payload: {
        name: "Amlodipine",
        dose_text: "5 mg",
        route: "oral",
        frequency: "once daily",
        active: true,
      },
    }),
    createRecord({
      id: "00000000-0000-4000-8000-000000000106",
      organization: "mercy",
      localPatientId: "PAT-00291",
      encounterId: DEMO_MERCY_ENCOUNTER_ID,
      authorId: "00000000-0000-4000-8000-000000000008",
      domain: "investigations",
      subtype: "investigation",
      sensitivity: "SENSITIVE",
      observedAt: olderObservedAt,
      payload: {
        type: "Full blood count",
        indication: "Routine review",
        result_text: "Within expected range",
        status: "completed",
        request_record_id: null,
      },
    }),
    createRecord({
      id: "00000000-0000-4000-8000-000000000107",
      organization: "mercy",
      localPatientId: "PAT-00291",
      encounterId: DEMO_MERCY_ENCOUNTER_ID,
      authorId: "00000000-0000-4000-8000-000000000008",
      domain: "hiv",
      subtype: "restricted_status",
      sensitivity: "RESTRICTED",
      restrictedTags: ["hiv"],
      observedAt: olderObservedAt,
      payload: { text: "Restricted result" },
    }),
    createRecord({
      id: "00000000-0000-4000-8000-000000000201",
      organization: "unity",
      localPatientId: "HSP-99210",
      encounterId: DEMO_UNITY_ENCOUNTER_ID,
      authorId: "00000000-0000-4000-8000-000000000004",
      domain: "demographics",
      subtype: "demographics",
      sensitivity: "STANDARD",
      observedAt: olderObservedAt,
      payload: {
        name: "Musa Ibrahim",
        date_of_birth: "1987-04-12",
        gender: "male",
        contact: "+234 801 555 0192",
        address: "12 Unity Crescent, Lagos",
        next_of_kin: {
          name: "Hauwa Ibrahim",
          relationship: "Spouse",
          contact: "+234 801 555 0193",
        },
      },
    }),
    createRecord({
      id: "00000000-0000-4000-8000-000000000202",
      organization: "unity",
      localPatientId: "HSP-99210",
      encounterId: DEMO_UNITY_ENCOUNTER_ID,
      authorId: "00000000-0000-4000-8000-000000000004",
      domain: "administration",
      subtype: "administration",
      sensitivity: "STANDARD",
      observedAt,
      payload: { ward_id: DEMO_UNITY_WARD_ID, bed: "U-04" },
    }),
    createRecord({
      id: "00000000-0000-4000-8000-000000000203",
      organization: "unity",
      localPatientId: "HSP-99210",
      encounterId: DEMO_UNITY_ENCOUNTER_ID,
      authorId: "00000000-0000-4000-8000-000000000006",
      domain: "vitals",
      subtype: "vital",
      sensitivity: "SENSITIVE",
      observedAt,
      payload: { name: "Blood pressure", value: 128, unit: "mmHg systolic" },
    }),
    createRecord({
      id: "00000000-0000-4000-8000-000000000204",
      organization: "unity",
      localPatientId: "HSP-99210",
      encounterId: DEMO_UNITY_ENCOUNTER_ID,
      authorId: "00000000-0000-4000-8000-000000000006",
      domain: "nursing_notes",
      subtype: "nursing_note",
      sensitivity: "SENSITIVE",
      observedAt,
      payload: { text: "Patient resting comfortably; fluids tolerated." },
    }),
    createRecord({
      id: "00000000-0000-4000-8000-000000000205",
      organization: "unity",
      localPatientId: "HSP-99210",
      encounterId: DEMO_UNITY_ENCOUNTER_ID,
      authorId: "00000000-0000-4000-8000-000000000004",
      domain: "allergies",
      subtype: "allergy",
      sensitivity: "SENSITIVE",
      observedAt: olderObservedAt,
      payload: {
        substance: "Penicillin",
        reaction: "Rash",
        severity: "moderate",
        status: "active",
      },
    }),
  ];
}
