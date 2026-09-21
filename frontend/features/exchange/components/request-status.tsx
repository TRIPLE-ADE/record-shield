"use client";

export function RequestStatus({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: "border-warning/25 bg-warning/10 text-warning-foreground",
    APPROVED: "border-success/25 bg-success/10 text-success",
    DENIED: "border-destructive/25 bg-destructive/10 text-destructive",
    CANCELLED: "border-border bg-muted text-muted-foreground",
    REVOKED: "border-border bg-muted text-muted-foreground",
    EXPIRED: "border-border bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${styles[status] ?? styles.PENDING}`}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}
