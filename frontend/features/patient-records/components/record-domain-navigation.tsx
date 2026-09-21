"use client";

import { LockKeyIcon } from "@phosphor-icons/react";
import type { Domain } from "@/lib/api/contracts/records";
import { domainGroups, domainMeta } from "../data/domain-meta";

export function RecordDomainNavigation({
  selectedDomain,
  onSelect,
  disabled = false,
}: {
  disabled?: boolean;
  selectedDomain: Domain;
  onSelect: (domain: Domain) => void;
}) {
  return (
    <aside className="space-y-5" aria-label="Record categories">
      <div className="lg:hidden">
        <label htmlFor="record-category" className="mb-2 block text-sm font-medium">
          Record category
        </label>
        <select
          id="record-category"
          value={selectedDomain}
          disabled={disabled}
          onChange={(event) => onSelect(event.target.value as Domain)}
          className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm"
        >
          {domainGroups.map((group) => (
            <optgroup key={group.group} label={group.label}>
              {Object.entries(domainMeta)
                .filter(([, meta]) => meta.group === group.group)
                .map(([domain, meta]) => (
                  <option key={domain} value={domain}>
                    {meta.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="hidden lg:block">
        <p className="mb-2 px-2 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Records
        </p>
        <nav className="space-y-4">
          {domainGroups.map((group) => (
            <div key={group.group} className="space-y-1">
              <p className="px-2 text-xs font-medium text-muted-foreground">{group.label}</p>
              {Object.entries(domainMeta)
                .filter(([, meta]) => meta.group === group.group)
                .map(([domain, meta]) => {
                  const Icon = meta.icon;
                  const active = selectedDomain === domain;
                  return (
                    <button
                      key={domain}
                      type="button"
                      disabled={disabled}
                      aria-current={active ? "page" : undefined}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                      onClick={() => onSelect(domain as Domain)}
                    >
                      <Icon
                        aria-hidden="true"
                        className="size-4 shrink-0"
                        weight={active ? "duotone" : "regular"}
                      />
                      <span className="truncate">{meta.shortLabel}</span>
                    </button>
                  );
                })}
            </div>
          ))}
        </nav>
      </div>
      <div className="hidden rounded-xl border border-border/70 bg-card/60 p-3 text-xs leading-5 text-muted-foreground lg:block">
        <LockKeyIcon aria-hidden="true" className="mb-2 size-4 text-primary" weight="duotone" />
        Available records depend on your role and care assignment.
      </div>
    </aside>
  );
}
