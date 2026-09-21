import { useEffect, useState } from "react";
import type { Domain, Encounter } from "@/lib/api/contracts/records";

type Selection = { domain: Domain; encounterId: string };
export type CareEditingState = { dirty: boolean; saving: boolean };

export function useCareSelection(encounters: Encounter[]) {
  const [selection, setSelection] = useState<Selection>({
    domain: "demographics",
    encounterId: "",
  });
  const [pending, setPending] = useState<Selection | null>(null);
  const [editing, setEditing] = useState<CareEditingState>({ dirty: false, saving: false });
  const firstEncounterId = encounters[0]?.id;
  if (!selection.encounterId && firstEncounterId) {
    setSelection({ ...selection, encounterId: firstEncounterId });
  }
  useEffect(() => {
    if (!editing.dirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [editing.dirty]);

  function requestSelection(next: Partial<Selection>) {
    if (editing.saving) return;
    const target = { ...selection, ...next };
    if (target.domain === selection.domain && target.encounterId === selection.encounterId) return;
    if (editing.dirty) setPending(target);
    else setSelection(target);
  }
  return {
    selection,
    editing,
    setEditing,
    requestSelection,
    encounter: encounters.find((item) => item.id === selection.encounterId),
    discardOpen: Boolean(pending),
    keepEditing: () => setPending(null),
    discard: () => {
      if (!pending || editing.saving) return;
      setSelection(pending);
      setPending(null);
      setEditing({ dirty: false, saving: false });
    },
  };
}
