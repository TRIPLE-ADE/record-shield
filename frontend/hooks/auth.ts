import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { login, getSession, logout } from "@/features/auth/api";
import type { SessionContext } from "@/lib/api/contracts/auth";
import { ApiError } from "@/lib/api/client";

export const sessionQueryKey = ["me"] as const;

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: login,
    onSuccess: (session) => {
      queryClient.setQueryData(sessionQueryKey, session);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

export function useSession() {
  return useQuery<SessionContext, ApiError>({
    queryKey: sessionQueryKey,
    queryFn: getSession,
    retry: false,
    staleTime: 0,
  });
}
