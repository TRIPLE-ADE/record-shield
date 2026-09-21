"use client";

import { ArrowRightIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkspaceUnavailableProps } from "../types";

export function WorkspaceUnavailable({ isContextDenied, onReturn }: WorkspaceUnavailableProps) {
  return (
    <main id="main-content" className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-10">
      <Card className="mx-auto max-w-xl border-warning/35 bg-warning/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WarningCircleIcon
              aria-hidden="true"
              className="size-5 text-warning"
              weight="duotone"
            />
            {isContextDenied ? "Account access needs review" : "Home unavailable"}
          </CardTitle>
          <CardDescription>
            {isContextDenied
              ? "Your hospital account is no longer active. Contact your administrator to restore access."
              : "The current session could not be verified. No protected data was loaded."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onReturn}>
            Return to sign in
            <ArrowRightIcon aria-hidden="true" />
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
