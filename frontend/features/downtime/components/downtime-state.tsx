"use client";

import { ArrowRightIcon, LockKeyIcon, WarningCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

export function DowntimeState({
  title,
  description,
  kind = "denied",
}: {
  title: string;
  description: string;
  kind?: "denied" | "unavailable";
}) {
  const Icon = kind === "denied" ? LockKeyIcon : WarningCircleIcon;
  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-10">
      <Card>
        <CardContent className="flex items-start gap-4 p-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-primary">
            <Icon aria-hidden="true" className="size-5" weight="duotone" />
          </span>
          <div>
            <h1 className="font-heading text-lg font-semibold">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
            <Link
              href="/workspace"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Return to workspace
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
