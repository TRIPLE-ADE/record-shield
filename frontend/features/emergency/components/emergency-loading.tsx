export function EmergencyLoading() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
      <div className="space-y-5">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="h-32 animate-pulse rounded-2xl bg-muted" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    </main>
  );
}
