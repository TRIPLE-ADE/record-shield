import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveConsent,
  cancelConsent,
  createConsentRequest,
  denyConsent,
  discoverSources,
  getPortal,
  getRemoteRecords,
  listConsentRequests,
  markNotificationRead,
  revokeGrant,
} from "@/features/exchange/api";
import type { SourcePurpose } from "@/features/exchange/api";
import type { ExchangeDomain, PortalResponse } from "@/lib/api/contracts/exchange";

export const exchangeKeys = {
  all: ["exchange"] as const,
  sources: (patientId: string, encounterId: string, purpose: SourcePurpose) =>
    [...exchangeKeys.all, "sources", patientId, encounterId, purpose] as const,
  requests: (patientId?: string) => [...exchangeKeys.all, "requests", patientId ?? "all"] as const,
  remote: (patientId: string, sourceId: string, grantId: string, domains: ExchangeDomain[]) =>
    [...exchangeKeys.all, "remote", patientId, sourceId, grantId, ...domains] as const,
  portal: ["portal"] as const,
};

export function useDiscoverSources(
  patientId: string,
  receivingEncounterId: string,
  enabled = true,
  purpose: SourcePurpose = "treatment",
) {
  return useQuery({
    queryKey: exchangeKeys.sources(patientId, receivingEncounterId, purpose),
    queryFn: () => discoverSources({ patientId, receivingEncounterId, purpose }),
    enabled: Boolean(patientId && receivingEncounterId) && enabled,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useConsentRequests(patientId?: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: exchangeKeys.requests(patientId),
    queryFn: ({ pageParam }) => listConsentRequests(patientId, { cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    select: (data) => ({
      ...data.pages[0],
      items: data.pages.flatMap((page) => page.items),
      next_cursor: data.pages.at(-1)?.next_cursor ?? null,
    }),
    enabled,
    staleTime: 5_000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 5_000,
  });
}

export function useRemoteRecords(
  patientId: string,
  sourceId: string,
  grantId: string,
  domains: ExchangeDomain[],
  enabled = true,
) {
  return useQuery({
    queryKey: exchangeKeys.remote(patientId, sourceId, grantId, domains),
    queryFn: () => getRemoteRecords({ patientId, sourceId, grantId, domains }),
    enabled: Boolean(patientId && sourceId && grantId && domains.length) && enabled,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function usePortal(enabled = true) {
  return useInfiniteQuery({
    queryKey: exchangeKeys.portal,
    queryFn: ({ pageParam }) => getPortal(pageParam),
    initialPageParam: {} as Parameters<typeof getPortal>[0],
    getNextPageParam: (lastPage, _pages, previousCursors) => {
      const cursors = Object.fromEntries(
        ["facilities", "requests", "grants", "access", "notifications"].flatMap((key) => {
          const cursor = lastPage[key as "notifications"].next_cursor;
          return cursor ? [[`${key}_cursor`, cursor]] : [];
        }),
      );
      return Object.keys(cursors).length ? { ...previousCursors, ...cursors } : undefined;
    },
    select: (data): PortalResponse => {
      const latest = data.pages[0];
      const merge = <T>(items: T[], key: (item: T) => string) =>
        Array.from(new Map(items.map((item) => [key(item), item])).values());
      return {
        ...latest,
        facilities: {
          ...latest.facilities,
          items: merge(
            data.pages.flatMap((page) => page.facilities.items),
            (item) => item.organization_id,
          ),
        },
        requests: {
          ...latest.requests,
          items: merge(
            data.pages.flatMap((page) => page.requests.items),
            (item) => item.id,
          ),
        },
        grants: {
          ...latest.grants,
          items: merge(
            data.pages.flatMap((page) => page.grants.items),
            (item) => item.id,
          ),
        },
        access: {
          ...latest.access,
          items: merge(
            data.pages.flatMap((page) => page.access.items),
            (item) => item.event_id,
          ),
        },
        notifications: {
          ...latest.notifications,
          items: merge(
            data.pages.flatMap((page) => page.notifications.items),
            (item) => item.id,
          ),
        },
      };
    },
    enabled,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 5_000,
  });
}

export function useCreateConsentRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createConsentRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exchangeKeys.all }),
  });
}

export function useApproveConsent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: approveConsent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: exchangeKeys.all });
      queryClient.invalidateQueries({ queryKey: exchangeKeys.portal });
    },
  });
}

export function useDenyConsent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: denyConsent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: exchangeKeys.all });
      queryClient.invalidateQueries({ queryKey: exchangeKeys.portal });
    },
  });
}

export function useCancelConsent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelConsent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exchangeKeys.all }),
  });
}

export function useRevokeGrant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: revokeGrant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: exchangeKeys.all });
      queryClient.invalidateQueries({ queryKey: exchangeKeys.portal });
    },
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exchangeKeys.portal }),
  });
}
