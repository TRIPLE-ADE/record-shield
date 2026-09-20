"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { WarningIcon, LockKeyIcon } from "@phosphor-icons/react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type ConfirmDisclosureDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
};

const disclosureSchema = z.object({
  reason: z.string().trim().min(20).max(1000),
});

type DisclosureFormValues = z.infer<typeof disclosureSchema>;

export function ConfirmDisclosureDialog({
  open,
  onOpenChange,
  onConfirm,
}: ConfirmDisclosureDialogProps) {
  const form = useForm<DisclosureFormValues>({
    resolver: zodResolver(disclosureSchema),
    defaultValues: { reason: "" },
    mode: "onChange",
  });
  const reason = useWatch({ control: form.control, name: "reason" }) ?? "";

  function confirm(values: DisclosureFormValues) {
    onConfirm(values.reason);
    form.reset();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" aria-describedby="disclosure-dialog-description">
        <DialogHeader className="pr-7">
          <div className="mb-1 grid size-10 place-items-center rounded-xl bg-emergency/12 text-emergency">
            <WarningIcon aria-hidden="true" className="size-5" />
          </div>
          <DialogTitle>Request a restricted domain</DialogTitle>
          <DialogDescription id="disclosure-dialog-description">
            This creates a high-sensitivity disclosure event. The patient and security team will be
            notified, and the scope cannot be broadened later.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4 py-1" onSubmit={form.handleSubmit(confirm)}>
          <div className="rounded-xl border border-emergency/20 bg-emergency/5 p-3 text-sm leading-6 text-muted-foreground">
            <div className="flex items-start gap-2">
              <LockKeyIcon aria-hidden="true" className="mt-1 size-4 shrink-0 text-emergency" />
              <p>
                <span className="font-semibold text-foreground">HIV status</span> will be added to
                this 15-minute emergency session.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="necessity-narrative" className="text-sm font-medium">
              Why is this needed for immediate treatment?
            </label>
            <Textarea
              id="necessity-narrative"
              {...form.register("reason")}
              placeholder="Describe the immediate treatment decision…"
              minLength={20}
              maxLength={1000}
              rows={4}
              aria-describedby="narrative-hint"
            />
            <div className="flex justify-between gap-3 text-xs text-muted-foreground">
              <span id="narrative-hint">20–1000 characters · avoid unrelated clinical detail</span>
              <span className="tabular-nums">{reason.length}/1000</span>
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Keep current scope
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={!form.formState.isValid}>
              Request restricted access
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
