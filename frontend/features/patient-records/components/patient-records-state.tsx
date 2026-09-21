"use client";

import { FileMagnifyingGlassIcon, LockKeyIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { StatePanel } from "@/components/state-panel";

export function PatientRecordsState({
  kind,
  title,
  description,
}: {
  kind: "denied" | "empty" | "unavailable";
  title: string;
  description: string;
}) {
  const Icon =
    kind === "denied"
      ? LockKeyIcon
      : kind === "empty"
        ? FileMagnifyingGlassIcon
        : WarningCircleIcon;
  return <StatePanel icon={Icon} title={title} description={description} />;
}
