"use client";

import Link from "next/link";
import { ArrowRightIcon, type Icon } from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";

export function StatePanel({
  icon: IconComponent,
  title,
  description,
}: {
  icon: Icon;
  title: string;
  description: string;
}) {
  return (
    <main id="main-content" className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 lg:py-16">
      <Card>
        <CardContent className="flex items-start gap-4 p-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-primary">
            <IconComponent aria-hidden="true" className="size-5" weight="duotone" />
          </span>
          <div>
            <p className="font-heading text-lg font-semibold">{title}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
            <Link
              href="/workspace"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Return home
              <ArrowRightIcon aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
