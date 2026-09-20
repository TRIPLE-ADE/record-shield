"use client";

import { Card, CardContent } from "@/components/ui/card";

export function EmergencyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="max-w-2xl">
      <CardContent className="space-y-4 px-5 py-8 sm:px-7">
        <div className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
          {icon}
        </div>
        <div>
          <h1 className="font-heading text-xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}
