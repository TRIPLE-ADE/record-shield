"use client";

import { InfoIcon } from "@phosphor-icons/react";
import type { EmergencySummary } from "@/lib/api/contracts/emergency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { emergencySectionMeta } from "../data/options";
import { isSummarySection } from "../utils/guards";
import { formatUtcDate } from "@/utils/formatters";

export function SummaryGrid({ summary }: { summary: EmergencySummary }) {
  return (
    <section aria-labelledby="summary-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Level 1</p>
          <h2 id="summary-heading" className="mt-1 font-heading text-xl font-semibold">
            Emergency patient summary
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Retrieved {formatUtcDate(summary.retrieved_at)}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {emergencySectionMeta.map(({ key, label }) => {
          const section = summary[key];
          if (!isSummarySection(section)) return null;
          return (
            <Card key={key} className="min-h-32 border-border/70">
              <CardHeader className="px-4 pb-2 pt-4">
                <CardTitle className="text-sm">{label}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {section.status === "UNKNOWN" ? (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <InfoIcon aria-hidden="true" className="size-4" />
                    Unknown in this summary
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {section.items.map((item) => (
                      <li key={item.record_id} className="text-sm leading-5">
                        {item.text}
                        <span className="mt-1 block text-[0.68rem] text-muted-foreground">
                          Observed {formatUtcDate(item.observed_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{summary.completeness_notice}</p>
    </section>
  );
}
