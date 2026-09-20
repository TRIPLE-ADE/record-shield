"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import { getSession, logout } from "./api";
import type { SessionContext } from "@/lib/api/contracts/auth";

export const sessionQueryKey = ["me"] as const;

export function useSession() {
  return useQuery<SessionContext, ApiError>({
    queryKey: sessionQueryKey,
    queryFn: getSession,
    retry: false,
    staleTime: 0,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError>({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear();
    },
  });
}
