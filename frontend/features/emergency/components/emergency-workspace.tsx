"use client";

import { useState } from "react";
import type { EmergencyWorkspaceProps } from "../types";
import { EmergencyActivation } from "./emergency-activation";
import { ActiveEmergencySession } from "./active-emergency-session";

export function EmergencyWorkspace({
  patientId,
  patientName,
  organizationName,
  encounterId,
  sessionContext,
  sources,
}: EmergencyWorkspaceProps) {
  const [sessionId, setSessionId] = useState("");
  if (sessionId) {
    return (
      <ActiveEmergencySession
        patientId={patientId}
        patientName={patientName}
        organizationName={organizationName}
        sessionId={sessionId}
        onReset={() => setSessionId("")}
      />
    );
  }
  return (
    <EmergencyActivation
      patientId={patientId}
      patientName={patientName}
      organizationName={organizationName}
      encounterId={encounterId}
      sessionContext={sessionContext}
      sources={sources}
      onActivated={setSessionId}
    />
  );
}
