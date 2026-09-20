import type { DemoIdentity } from "../demo-identities";

export function formatIdentityRole(role: DemoIdentity["role"]) {
  if (role === "PATIENT") return "Patient portal";
  return role
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
