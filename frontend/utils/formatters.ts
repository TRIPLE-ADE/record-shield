const utcDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function formatUtcDate(value: string) {
  return utcDateFormatter.format(new Date(value));
}

export function formatLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatDomain(value: string) {
  return formatLabel(value);
}

export function formatRoleName(role: string | null) {
  if (!role) return "Patient";
  return role
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatRemaining(milliseconds: number) {
  if (milliseconds <= 0) return "Shift ended";
  const totalMinutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}h ${minutes.toString().padStart(2, "0")}m left` : `${minutes}m left`;
}
