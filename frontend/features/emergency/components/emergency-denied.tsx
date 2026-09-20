export function EmergencyDenied({ description }: { description: string }) {
  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-10">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="font-heading text-xl font-semibold">Emergency access unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </main>
  );
}
