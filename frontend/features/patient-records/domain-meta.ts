import {
  ClipboardTextIcon,
  FileMagnifyingGlassIcon,
  HeartbeatIcon,
  InfoIcon,
  LockKeyIcon,
  NoteIcon,
  PulseIcon,
  StethoscopeIcon,
  SyringeIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import type { Domain } from "@/lib/api/contracts/records";

export type DomainMeta = {
  label: string;
  shortLabel: string;
  icon: typeof ClipboardTextIcon;
  group: "identity" | "care" | "operations";
};

export const domainMeta: Record<Domain, DomainMeta> = {
  demographics: {
    label: "Demographics",
    shortLabel: "Identity",
    icon: StethoscopeIcon,
    group: "identity",
  },
  administration: {
    label: "Administration",
    shortLabel: "Placement",
    icon: ClipboardTextIcon,
    group: "operations",
  },
  billing: { label: "Billing", shortLabel: "Billing", icon: NoteIcon, group: "operations" },
  history: {
    label: "History",
    shortLabel: "History",
    icon: FileMagnifyingGlassIcon,
    group: "care",
  },
  vitals: { label: "Vitals", shortLabel: "Vitals", icon: HeartbeatIcon, group: "care" },
  diagnoses: { label: "Diagnoses", shortLabel: "Diagnoses", icon: StethoscopeIcon, group: "care" },
  medications: { label: "Medications", shortLabel: "Medication", icon: SyringeIcon, group: "care" },
  allergies: {
    label: "Allergies",
    shortLabel: "Allergies",
    icon: WarningCircleIcon,
    group: "care",
  },
  investigations: { label: "Investigations", shortLabel: "Tests", icon: PulseIcon, group: "care" },
  nursing_notes: { label: "Nursing notes", shortLabel: "Nursing", icon: NoteIcon, group: "care" },
  medication_administration: {
    label: "Medication administration",
    shortLabel: "MAR",
    icon: SyringeIcon,
    group: "care",
  },
  physiotherapy_notes: {
    label: "Physiotherapy",
    shortLabel: "Physio",
    icon: PulseIcon,
    group: "care",
  },
  mental_health: {
    label: "Mental health",
    shortLabel: "Mental health",
    icon: HeartbeatIcon,
    group: "care",
  },
  hiv: { label: "HIV", shortLabel: "HIV", icon: LockKeyIcon, group: "care" },
  genetic: { label: "Genetic", shortLabel: "Genetic", icon: LockKeyIcon, group: "care" },
  cultural_attributes: {
    label: "Cultural attributes",
    shortLabel: "Culture",
    icon: InfoIcon,
    group: "identity",
  },
};

export const domainGroups = [
  { label: "Identity", group: "identity" as const },
  { label: "Care", group: "care" as const },
  { label: "Operations", group: "operations" as const },
];
