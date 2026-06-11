import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';
import { adminExerciseKeys } from '@/components/admin-form/queryKeys';
import type { ExerciseDetailResponse, ExerciseListResponse, ListItem } from '@/components/admin-form/types';

type ExerciseListPageParam = {
  offset: number;
  cursorId: number | null;
  cursorUpdatedAt: string | null;
};

type ExerciseListInfiniteData = InfiniteData<ExerciseListResponse, ExerciseListPageParam>;
type ExerciseListSnapshot = Array<[QueryKey, ExerciseListInfiniteData | undefined]>;

export function snapshotAdminExerciseLists(queryClient: QueryClient): ExerciseListSnapshot {
  return queryClient.getQueriesData<ExerciseListInfiniteData>({
    queryKey: adminExerciseKeys.lists(),
  });
}

export function restoreAdminExerciseLists(
  queryClient: QueryClient,
  snapshot: ExerciseListSnapshot,
) {
  for (const [queryKey, data] of snapshot) {
    queryClient.setQueryData(queryKey, data);
  }
}

export function patchAdminExerciseLists(
  queryClient: QueryClient,
  patchItem: (item: ListItem) => ListItem | null,
) {
  queryClient.setQueriesData<ExerciseListInfiniteData>(
    { queryKey: adminExerciseKeys.lists() },
    (data) => {
      if (!data) return data;
      return {
        ...data,
        pages: data.pages.map((page) => {
          if (!page.success) return page;
          const items = page.items
            .map((item) => patchItem(item))
            .filter((item): item is ListItem => item !== null);
          return {
            ...page,
            items,
          };
        }),
      };
    },
  );
}

export function decrementAdminExerciseListTotals(queryClient: QueryClient) {
  queryClient.setQueriesData<ExerciseListInfiniteData>(
    { queryKey: adminExerciseKeys.lists() },
    (data) => {
      if (!data) return data;
      return {
        ...data,
        pages: data.pages.map((page, index) => {
          if (!page.success || index !== 0) return page;
          return {
            ...page,
            total: Math.max(0, page.total - 1),
          };
        }),
      };
    },
  );
}

export function upsertAdminExerciseDetail(
  queryClient: QueryClient,
  id: number,
  patch: Record<string, unknown>,
) {
  queryClient.setQueryData<ExerciseDetailResponse>(
    adminExerciseKeys.detail(id),
    (current) => {
      if (!current?.success || !current.item) return current;
      return {
        ...current,
        item: {
          ...current.item,
          ...patch,
          id,
        },
      };
    },
  );
}

