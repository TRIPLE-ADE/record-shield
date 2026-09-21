import { ShieldWarningIcon } from "@phosphor-icons/react";

export function AdminState({ title, description }: { title: string; description: string }) {
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center px-4 py-10 sm:px-6 lg:px-10"
    >
      <div className="w-full rounded-2xl border border-border/80 bg-card p-7 shadow-sm sm:p-10">
        <ShieldWarningIcon aria-hidden="true" className="size-8 text-amber-600" weight="duotone" />
        <h1 className="mt-5 font-heading text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </main>
  );
}
