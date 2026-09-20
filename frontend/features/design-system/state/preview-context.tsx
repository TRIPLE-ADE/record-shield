"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { FormProvider, useForm, type UseFormReturn } from "react-hook-form";
import type { IntegrityState } from "../components/integrity-indicator";
import type { PreviewStateKind } from "../data/preview";

export type PreviewFormValues = {
  domains: string[];
  state: PreviewStateKind;
  integrity: IntegrityState;
};

const defaultValues: PreviewFormValues = {
  domains: ["allergies", "medications"],
  state: "ready",
  integrity: "verified",
};

type PreviewContextValue = {
  form: UseFormReturn<PreviewFormValues>;
  alertReviewed: boolean;
  dialogOpen: boolean;
  notice: string;
  resetPreview: () => void;
  setNotice: (message: string) => void;
  markAlertReviewed: () => void;
  openDisclosure: () => void;
  closeDisclosure: (open: boolean) => void;
  confirmDisclosure: (reason: string) => void;
};

const PreviewContext = createContext<PreviewContextValue | null>(null);

export function DesignSystemPreviewProvider({ children }: { children: ReactNode }) {
  const form = useForm<PreviewFormValues>({
    defaultValues,
    mode: "onChange",
  });
  const [alertReviewed, setAlertReviewed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState("Preview ready for review.");

  const resetPreview = useCallback(() => {
    form.reset(defaultValues);
    setAlertReviewed(false);
    setDialogOpen(false);
    setNotice("Preview ready for review.");
  }, [form]);

  const markAlertReviewed = useCallback(() => {
    setAlertReviewed(true);
    setNotice("Alert review recorded with reviewer context.");
  }, []);

  const openDisclosure = useCallback(() => setDialogOpen(true), []);
  const closeDisclosure = useCallback((open: boolean) => setDialogOpen(open), []);

  const confirmDisclosure = useCallback((reason: string) => {
    if (!reason.trim()) return;
    setDialogOpen(false);
    setNotice("Restricted scope request staged for patient approval.");
  }, []);

  const value = useMemo<PreviewContextValue>(
    () => ({
      form,
      alertReviewed,
      dialogOpen,
      notice,
      resetPreview,
      setNotice,
      markAlertReviewed,
      openDisclosure,
      closeDisclosure,
      confirmDisclosure,
    }),
    [
      form,
      alertReviewed,
      dialogOpen,
      notice,
      resetPreview,
      markAlertReviewed,
      openDisclosure,
      closeDisclosure,
      confirmDisclosure,
    ],
  );

  return (
    <PreviewContext.Provider value={value}>
      <FormProvider {...form}>{children}</FormProvider>
    </PreviewContext.Provider>
  );
}

export function useDesignSystemPreview() {
  const context = useContext(PreviewContext);

  if (!context) {
    throw new Error("useDesignSystemPreview must be used within DesignSystemPreviewProvider");
  }

  return context;
}
