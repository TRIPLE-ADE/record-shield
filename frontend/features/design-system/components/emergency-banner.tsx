import { Siren, User } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "./status-badge";
import { ExpiryTimer } from "./expiry-timer";

type EmergencyBannerProps = {
  emergency: {
    level: string;
    patient: string;
    source: string;
    description: string;
    expiresIn: string;
    progress: number;
    reviewDue: string;
    purpose: string;
  };
  onExpand?: () => void;
};

export function EmergencyBanner({ emergency, onExpand }: EmergencyBannerProps) {
  return (
    <Card className="overflow-hidden border-emergency/30 bg-emergency/4">
      <div className="h-1 bg-emergency" />
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emergency/12 text-emergency">
              <Siren aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-heading text-base font-semibold">Emergency summary active</h2>
                <StatusBadge tone="emergency">{emergency.level}</StatusBadge>
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <User aria-hidden="true" className="size-3.5" />
                {emergency.patient} · {emergency.source}
              </p>
            </div>
          </div>
          <StatusBadge tone="success">Audited</StatusBadge>
        </div>

        <p className="text-sm leading-6 text-muted-foreground">{emergency.description}</p>

        <ExpiryTimer value={emergency.expiresIn} progress={emergency.progress} urgent />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-emergency/15 pt-3">
          <p className="text-xs leading-5 text-muted-foreground">
            Review due in{" "}
            <span className="font-semibold text-foreground">{emergency.reviewDue}</span> ·{" "}
            {emergency.purpose}
          </p>
          {onExpand ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onExpand}
              className="border-emergency/30 hover:bg-emergency/10"
            >
              Request specific domain
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
