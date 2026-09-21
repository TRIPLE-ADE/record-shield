"use client";

import { VisitSelect } from "@/components/visit-select";
import { useDiscoverSources } from "@/hooks/exchange";
import { useState } from "react";
import type { EmergencyWorkspaceProps } from "../types";
import { EmergencyActivation } from "./emergency-activation";
import { ActiveEmergencySession } from "./active-emergency-session";

export function EmergencyWorkspace({
  patientId,
  patientName,
  organizationName,
  encounters,
  sessionContext,
}: EmergencyWorkspaceProps) {
  const [selectedEncounter, setSelectedEncounter] = useState("");
  const encounterId =
    encounters.find((item) => item.id === selectedEncounter)?.id ?? encounters[0]?.id ?? "";
  const sources = useDiscoverSources(
    patientId,
    encounterId,
    Boolean(encounterId),
    "emergency_treatment",
  );
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
    <>
      <div className="mx-auto w-full max-w-7xl px-4 pt-7 sm:px-6 lg:px-10">
        <VisitSelect encounters={encounters} value={encounterId} onChange={setSelectedEncounter} />
      </div>
      <EmergencyActivation
        key={encounterId}
        patientId={patientId}
        patientName={patientName}
        organizationName={organizationName}
        encounterId={encounterId}
        sessionContext={sessionContext}
        sources={sources.error ? [] : (sources.data?.items ?? [])}
        onActivated={setSessionId}
      />
    </>
  );
}
