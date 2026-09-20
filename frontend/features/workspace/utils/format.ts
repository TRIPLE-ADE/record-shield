import { formatRoleName } from "@/utils/formatters";

const timeFormatter = new Intl.DateTimeFormat("en", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export const formatRole = formatRoleName;

export function humanizePermission(permission: string) {
  return permission
    .split(".")
    .at(-1)
    ?.replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatTime(value: string) {
  return timeFormatter.format(new Date(value));
}
