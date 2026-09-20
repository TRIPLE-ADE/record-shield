"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";

export function NextStepCard({
  icon,
  eyebrow,
  title,
  copy,
  href,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  copy: string;
  href?: string;
}) {
  const content = (
    <CardContent className="p-5">
      <span className="grid size-9 place-items-center rounded-lg bg-muted text-primary [&_svg]:size-4">
        {icon}
      </span>
      <p className="mt-5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-primary">
        {eyebrow}
      </p>
      <h2 className="mt-2 font-heading text-base font-medium">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
      {href ? (
        <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
          Open current encounter
          <ArrowRightIcon aria-hidden="true" className="size-4" />
        </span>
      ) : null}
    </CardContent>
  );

  return href ? (
    <Link
      href={href}
      className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card className="h-full bg-card/70 transition-colors hover:border-primary/35 hover:bg-card">
        {content}
      </Card>
    </Link>
  ) : (
    <Card className="bg-card/70">{content}</Card>
  );
}
