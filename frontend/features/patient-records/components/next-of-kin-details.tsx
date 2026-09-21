import type { ClinicalRecord } from "@/lib/api/contracts/records";

type NextOfKin = Extract<ClinicalRecord["payload"], { next_of_kin: unknown }>["next_of_kin"];

export function NextOfKinDetails({ nextOfKin }: { nextOfKin: NextOfKin }) {
  if (!nextOfKin) return <p className="text-muted-foreground">Not recorded</p>;

  return (
    <dl className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-3">
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">Name</dt>
        <dd className="mt-1 break-words font-medium">{nextOfKin.name}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">Relationship</dt>
        <dd className="mt-1 break-words">{nextOfKin.relationship}</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">Contact</dt>
        <dd className="mt-1 break-words">{nextOfKin.contact ?? "Not recorded"}</dd>
      </div>
    </dl>
  );
}
