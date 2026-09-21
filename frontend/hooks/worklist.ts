import { useInfiniteQuery } from "@tanstack/react-query";
import { getWorklist } from "@/features/workspace/api";

export function useWorklist() {
  return useInfiniteQuery({
    queryKey: ["worklist"],
    queryFn: ({ pageParam }) => getWorklist(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    staleTime: 0,
    refetchInterval: 5000,
    retry: false,
  });
}
