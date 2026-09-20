"use client";

import type { EmergencySession } from "@/lib/api/contracts/emergency";
import { SessionNotice } from "./session-notice";

export function SessionHeader({ session }: { session?: EmergencySession }) {
  if (!session) return null;
  return <SessionNotice session={session} />;
}
