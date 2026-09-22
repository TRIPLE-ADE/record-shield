"use client";

import { apiCapabilities } from "@/lib/api/capabilities";
import type { Notification } from "@/lib/api/contracts/exchange";
import { useMarkNotificationRead } from "@/hooks/exchange";
import { formatDomain, formatUtcDate } from "@/utils/formatters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const notificationTitles: Record<Notification["type"], string> = {
  CONSENT_REQUESTED: "A clinician requested your records",
  CONSENT_CHANGED: "Your sharing permissions changed",
  EMERGENCY_ACTIVATED: "Emergency access was started",
  EMERGENCY_EXPANDED: "Additional emergency records were opened",
  JUSTIFICATION_SUBMITTED: "An emergency access explanation was submitted",
};

export function NotificationsCard({ notifications }: { notifications: Notification[] }) {
  const markRead = useMarkNotificationRead();
  const unread = notifications.filter((item) => !item.seen_at).length;
  return (
    <Card>
      <CardHeader className="px-5 py-5">
        <CardTitle className="text-base">Notifications</CardTitle>
        <CardDescription>{unread ? `${unread} unread` : "You’re up to date"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-5 pb-5">
        {!apiCapabilities.notificationRead ? (
          <p className="text-xs text-muted-foreground">
            Notifications are view-only. Marking them as read is not available yet.
          </p>
        ) : null}
        {notifications.length ? (
          <ul className="space-y-4" aria-label="Notifications">
            {notifications.map((notification) => (
              <li
                key={notification.id}
                className="border-b border-border pb-4 last:border-0 last:pb-0"
              >
                <p className="text-sm font-medium">{notificationTitles[notification.type]}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatUtcDate(notification.created_at)}
                </p>
                {notification.metadata.domains.length ? (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {notification.metadata.domains.map(formatDomain).join(" · ")}
                  </p>
                ) : null}
                {notification.seen_at ? (
                  <p className="mt-2 text-xs text-muted-foreground">Read</p>
                ) : apiCapabilities.notificationRead ? (
                  <Button
                    className="mt-2"
                    size="sm"
                    variant="outline"
                    disabled={markRead.isPending}
                    onClick={() => markRead.mutate(notification.id)}
                  >
                    {markRead.isPending && markRead.variables === notification.id
                      ? "Saving…"
                      : "Mark as read"}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Updates about access to your records will appear here.
          </p>
        )}
        {markRead.error ? (
          <p role="alert" className="text-sm text-destructive">
            Couldn’t mark this notification as read. Please try again.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
