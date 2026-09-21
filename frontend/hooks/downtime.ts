import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createDowntimeReconciliation,
  getDemoStatus,
  resetDemo,
  setDemoFault,
} from "@/features/downtime/api";
import type { DowntimeReconciliationCreate } from "@/lib/api/contracts/downtime";
import type { DemoFaultUpdate } from "@/lib/api/contracts/demo";

export const downtimeKeys = {
  all: ["downtime"] as const,
  demoStatus: () => [...downtimeKeys.all, "demo-status"] as const,
};

export function useCreateDowntimeReconciliation() {
  return useMutation({
    mutationFn: (input: DowntimeReconciliationCreate) => createDowntimeReconciliation(input),
  });
}

export function useDemoStatus(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: downtimeKeys.demoStatus(),
    queryFn: getDemoStatus,
    enabled: options?.enabled ?? false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useDemoControls() {
  const queryClient = useQueryClient();

  const reset = useMutation({
    mutationFn: resetDemo,
    onSuccess: (status) => queryClient.setQueryData(downtimeKeys.demoStatus(), status),
  });

  const setFault = useMutation({
    mutationFn: (input: DemoFaultUpdate) => setDemoFault(input),
    onSuccess: (status) => queryClient.setQueryData(downtimeKeys.demoStatus(), status),
  });

  return { reset, setFault };
}
