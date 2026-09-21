"use client";

import { FolderSimpleLockIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { StatePanel } from "@/components/state-panel";

export function PatientDirectoryState({
  kind,
  title,
  description,
}: {
  kind: "denied" | "empty" | "unavailable";
  title: string;
  description: string;
}) {
  const Icon = kind === "denied" ? FolderSimpleLockIcon : WarningCircleIcon;

  return <StatePanel icon={Icon} title={title} description={description} />;
}
