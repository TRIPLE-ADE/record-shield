import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getContextAssignments,
  getHospitalPolicy,
  suspendAdminTarget,
  updateHospitalPolicy,
  upsertContextAssignment,
} from "@/features/admin/api";
import type {
  AssignmentUpsert,
  HospitalPolicyUpdate,
  SuspensionCreate,
} from "@/lib/api/contracts/admin";

export const adminKeys = {
  all: ["admin"] as const,
  assignments: () => [...adminKeys.all, "assignments"] as const,
  policy: () => [...adminKeys.all, "policy"] as const,
};

export function useContextAssignments(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminKeys.assignments(),
    queryFn: getContextAssignments,
    enabled: options?.enabled ?? true,
    staleTime: 15_000,
  });
}

export function useHospitalPolicy(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminKeys.policy(),
    queryFn: getHospitalPolicy,
    enabled: options?.enabled ?? true,
    staleTime: 15_000,
  });
}

export function useUpsertContextAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AssignmentUpsert) => upsertContextAssignment(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.assignments() }),
  });
}

export function useUpdateHospitalPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: HospitalPolicyUpdate) => updateHospitalPolicy(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.policy() }),
  });
}

export function useSuspendAdminTarget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SuspensionCreate) => suspendAdminTarget(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.all });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
