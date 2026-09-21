import {
  ArrowDownIcon,
  CheckIcon,
  FirstAidKitIcon,
  HospitalIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react/dist/ssr";

export function CareNetwork() {
  return (
    <figure
      className="relative rounded-[2rem] border border-primary/15 bg-secondary/55 p-5 sm:p-8"
      aria-labelledby="care-network-caption"
    >
      <div className="mb-8 flex items-center justify-between text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-primary">
        <span>Connected care</span>
        <span>Built around the patient</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <HospitalIcon aria-hidden="true" className="mb-4 size-7 text-primary" weight="duotone" />
          <p className="text-sm font-semibold">Your existing system</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Connect the records you already keep.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <FirstAidKitIcon
            aria-hidden="true"
            className="mb-4 size-7 text-primary"
            weight="duotone"
          />
          <p className="text-sm font-semibold">Your first digital record</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Start with RecordShield’s lightweight EMR.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 justify-items-center py-4 text-primary/50">
        <ArrowDownIcon aria-hidden="true" size={22} />
        <ArrowDownIcon aria-hidden="true" size={22} />
      </div>
      <div className="rounded-2xl bg-primary p-6 text-primary-foreground shadow-xl shadow-primary/10">
        <div className="flex items-center gap-3">
          <ShieldCheckIcon aria-hidden="true" size={30} weight="duotone" />
          <div>
            <p className="text-lg font-semibold tracking-tight">The right access.</p>
            <p className="text-sm text-primary-foreground/75">For the care happening now.</p>
          </div>
        </div>
        <div className="mt-6 grid gap-3 border-t border-primary-foreground/20 pt-5 text-sm">
          {[
            "Staff role and care assignment",
            "Patient sharing choices",
            "A traceable access history",
          ].map((label) => (
            <p key={label} className="flex items-center gap-2">
              <CheckIcon aria-hidden="true" className="size-4 shrink-0" />
              {label}
            </p>
          ))}
        </div>
      </div>
      <figcaption
        id="care-network-caption"
        className="mt-6 text-center text-xs leading-5 text-muted-foreground"
      >
        Two ways to join. One approach to responsible access.
      </figcaption>
    </figure>
  );
}
