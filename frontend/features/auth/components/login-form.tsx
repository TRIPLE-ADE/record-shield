"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRightIcon,
  BuildingsIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  LockKeyIcon,
  ShieldCheckIcon,
  UserCircleIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { demoIdentities, DEMO_PASSWORD, type DemoIdentity } from "../demo-identities";
import { useLogin } from "@/hooks/auth";
import { formatIdentityRole } from "../utils/format";
import { loginRequestSchema, type LoginRequest } from "@/lib/api/contracts/auth";

const isMockMode = !process.env.NEXT_PUBLIC_API_URL;

export function LoginForm() {
  const router = useRouter();
  const [selectedUsername, setSelectedUsername] = useState<string>(demoIdentities[0].username);
  const form = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: {
      username: isMockMode ? demoIdentities[0].username : "",
      password: isMockMode ? DEMO_PASSWORD : "",
    },
  });
  const loginMutation = useLogin();

  const handleSelect = (identity: DemoIdentity) => {
    setSelectedUsername(identity.username);
    form.setValue("username", identity.username, { shouldValidate: true });
    form.setValue("password", DEMO_PASSWORD, { shouldValidate: true });
    form.clearErrors();
  };

  const onSubmit = form.handleSubmit((values) => {
    loginMutation.mutate(values, {
      onSuccess: () => {
        router.push("/workspace");
        router.refresh();
      },
    });
  });
  const serverMessage = loginMutation.error?.message;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <div className="relative">
          <UserCircleIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="username"
            autoComplete="username"
            className="h-11 pl-10"
            aria-invalid={Boolean(form.formState.errors.username)}
            {...form.register("username")}
          />
        </div>
        {form.formState.errors.username && (
          <p className="text-xs text-destructive">Enter a valid username.</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="password">Password</Label>
          <span className="text-xs text-muted-foreground">Required</span>
        </div>
        <div className="relative">
          <LockKeyIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            className="h-11 pl-10"
            aria-invalid={Boolean(form.formState.errors.password)}
            {...form.register("password")}
          />
        </div>
        {form.formState.errors.password && (
          <p className="text-xs text-destructive">Enter the supplied demo credential.</p>
        )}
      </div>

      {serverMessage && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-sm text-destructive"
        >
          {serverMessage}
        </div>
      )}

      <Button type="submit" size="lg" className="h-11 w-full" disabled={loginMutation.isPending}>
        {loginMutation.isPending ? (
          <>
            <CircleNotchIcon aria-hidden="true" className="size-4 animate-spin" />
            Verifying context
          </>
        ) : (
          <>
            Enter workspace
            <ArrowRightIcon aria-hidden="true" />
          </>
        )}
      </Button>

      <div className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-muted/45 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
        <ShieldCheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          Access is decided by the server context returned after sign-in. The selected card never
          grants a role or hospital.
        </p>
      </div>

      {isMockMode ? (
        <div className="space-y-3 border-t border-border/70 pt-5">
          <div>
            <p className="text-sm font-medium">Quick access</p>
            <p className="text-xs text-muted-foreground">
              Choose a configured account to continue.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {demoIdentities.map((identity) => {
              const isSelected = identity.username === selectedUsername;
              return (
                <button
                  key={identity.username}
                  type="button"
                  onClick={() => handleSelect(identity)}
                  className={`group flex min-h-20 flex-col items-start justify-between rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                    isSelected
                      ? "border-primary/55 bg-primary/8"
                      : "border-border/75 bg-background/45 hover:border-primary/35 hover:bg-muted/55"
                  }`}
                  aria-pressed={isSelected}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{identity.label}</span>
                    {isSelected ? (
                      <CheckCircleIcon
                        aria-hidden="true"
                        className="size-4 shrink-0 text-primary"
                        weight="duotone"
                      />
                    ) : null}
                  </span>
                  <span className="mt-1 flex w-full items-center justify-between gap-2 text-[0.7rem] text-muted-foreground">
                    <span className="truncate">{identity.description}</span>
                    <span className="inline-flex shrink-0 items-center gap-1">
                      <BuildingsIcon aria-hidden="true" className="size-3" />
                      {identity.organization}
                    </span>
                  </span>
                  <span className="mt-1 text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground/75">
                    {formatIdentityRole(identity.role)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </form>
  );
}
