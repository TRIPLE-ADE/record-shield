import type { SessionContext } from "@/lib/api/contracts/auth";
import type { Domain } from "@/lib/api/contracts/records";

const treatingRoles = new Set([
  "ATTENDING_DOCTOR",
  "VISITING_DOCTOR",
  "EMERGENCY_DOCTOR",
  "NURSE_MIDWIFE",
]);

export function isTreatingPractitioner(role: string | null) {
  return treatingRoles.has(role ?? "");
}

export function canWriteLocalDomain(context: SessionContext | undefined, domain: Domain) {
  return Boolean(
    context?.organization?.mode === "LITE" &&
    context.permissions_summary.includes("local_records.write") &&
    ["vitals", "nursing_notes"].includes(domain),
  );
}

export function canActivateEmergency(context: SessionContext) {
  return Boolean(
    context.role === "EMERGENCY_DOCTOR" &&
    context.permissions_summary.includes("emergency.activate_with_context") &&
    context.shift?.active,
  );
}
