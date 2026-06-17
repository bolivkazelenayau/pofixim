'use client';

import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useDebouncedValue } from '@tanstack/react-pacer';
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import { fetchExerciseList } from '@/components/admin-form/api';
import { adminExerciseKeys, type AdminExerciseListFilters } from '@/components/admin-form/queryKeys';
import type { ExerciseListResponse, ListItem } from '@/components/admin-form/types';

const EXERCISE_LIST_PAGE_SIZE = 50;

type ExerciseListPageParam = {
  offset: number;
  cursorId: number | null;
  cursorUpdatedAt: string | null;
};

const FIRST_PAGE_PARAM: ExerciseListPageParam = {
  offset: 0,
  cursorId: null,
  cursorUpdatedAt: null,
};
const ADMIN_LIST_SORT_BY_COOKIE = 'admin_list_sort_by';
const ADMIN_LIST_SORT_DIR_COOKIE = 'admin_list_sort_dir';
const ADMIN_LIST_TYPE_FILTER_COOKIE = 'admin_list_type_filter';
const ADMIN_LIST_STATUS_FILTER_COOKIE = 'admin_list_status_filter';
const ADMIN_LIST_EXAM_TYPE_FILTER_COOKIE = 'admin_list_exam_type_filter';

const EXERCISE_LIST_COLUMNS: ColumnDef<ListItem>[] = [
  { id: 'id', accessorKey: 'id' },
  { id: 'updatedAt', accessorKey: 'updatedAtCursor' },
  { id: 'type', accessorKey: 'type' },
  { id: 'status', accessorKey: 'qualityStatus' },
];

type UseExerciseListConfig = {
  initialItems: ListItem[];
  initialTotalItems: number | null | undefined;
  initialTypeFilter: string;
  initialStatusFilter: string;
  initialExamTypeFilter: string;
  initialSortBy: 'id' | 'updatedAt' | 'type' | 'status';
  initialSortDir: 'asc' | 'desc';
  setIsError: (value: boolean) => void;
  setMessage: (value: string) => void;
};

function normalizeSearchText(input: string) {
  return String(input ?? '')
    .toLowerCase()
    .replace(/\u00ad/g, '')
    .replace(/[*_`~[\]()<>{}|\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function examTypeOf(item: ListItem) {
  for (const tag of item.skillTags ?? []) {
    const m = tag.match(/^ege\.(\d{1,2})$/);
    if (m) return m[1];
  }
  return 'n/a';
}

function persistAdminListSortCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
}

function buildInitialData(
  initialItems: ListItem[],
  initialTotalItems: number | null | undefined,
): InfiniteData<ExerciseListResponse, ExerciseListPageParam> | undefined {
  if (initialItems.length === 0) return undefined;
  const hasMore =
    typeof initialTotalItems === 'number'
      ? initialItems.length < initialTotalItems
      : initialItems.length >= EXERCISE_LIST_PAGE_SIZE;
  return {
    pages: [
      {
        success: true,
        items: initialItems,
        total: initialTotalItems ?? initialItems.length,
        hasMore,
        nextOffset: initialItems.length,
        nextCursorId: initialItems[initialItems.length - 1]?.id ?? null,
        nextCursorUpdatedAt: initialItems[initialItems.length - 1]?.updatedAtCursor ?? null,
      },
    ],
    pageParams: [FIRST_PAGE_PARAM],
  };
}

export function useExerciseList({
  initialItems,
  initialTotalItems,
  initialTypeFilter,
  initialStatusFilter,
  initialExamTypeFilter,
  initialSortBy,
  initialSortDir,
  setIsError,
  setMessage,
}: UseExerciseListConfig) {
  const queryClient = useQueryClient();
  const [totalItems, setTotalItems] = useState<number | null>(initialTotalItems ?? null);
  const [matchingItems, setMatchingItems] = useState<number | null>(null);
  const [listQuery, setListQuery] = useState('');
  const [serverListQuery] = useDebouncedValue(listQuery, {
    key: 'admin-exercise-list-search',
    wait: 500,
  });
  const [listTypeFilter, setListTypeFilter] = useState<string>(initialTypeFilter);
  const [listStatusFilter, setListStatusFilter] = useState<string>(initialStatusFilter);
  const [listExamTypeFilter, setListExamTypeFilter] = useState<string>(initialExamTypeFilter);
  const [listSortBy, setListSortBy] = useState<'id' | 'updatedAt' | 'type' | 'status'>(initialSortBy);
  const [listSortDir, setListSortDir] = useState<'asc' | 'desc'>(initialSortDir);
  const [sortPrefsReady] = useState(true);

  const includeTotalOnNextFetchRef = useRef(initialItems.length === 0);

  const hasActiveListFilter =
    serverListQuery.trim().length > 0 ||
    listTypeFilter !== 'all' ||
    listStatusFilter !== 'all' ||
    listExamTypeFilter !== 'all';

  const serverSortBy = listSortBy;
  const supportsCursorPagination = serverSortBy === 'id' || serverSortBy === 'updatedAt';
  const listFilters = useMemo<AdminExerciseListFilters>(
    () => ({
      query: serverListQuery,
      type: listTypeFilter,
      qualityStatus: listStatusFilter,
      examType: listExamTypeFilter,
      sortBy: serverSortBy,
      sortDir: listSortDir,
    }),
    [serverListQuery, listTypeFilter, listStatusFilter, listExamTypeFilter, serverSortBy, listSortDir],
  );
  const queryKey = adminExerciseKeys.list(listFilters);
  const isDefaultInitialListQuery =
    serverListQuery === '' &&
    listTypeFilter === 'all' &&
    listStatusFilter === 'all' &&
    listExamTypeFilter === 'all' &&
    listSortBy === initialSortBy &&
    listSortDir === initialSortDir;

  useEffect(() => {
    try {
      localStorage.setItem('admin_list_sort_by', listSortBy);
      localStorage.setItem('admin_list_sort_dir', listSortDir);
      persistAdminListSortCookie(ADMIN_LIST_SORT_BY_COOKIE, listSortBy);
      persistAdminListSortCookie(ADMIN_LIST_SORT_DIR_COOKIE, listSortDir);
    } catch {}
  }, [listSortBy, listSortDir]);

  useEffect(() => {
    try {
      localStorage.setItem('admin_list_type_filter', listTypeFilter);
      localStorage.setItem('admin_list_status_filter', listStatusFilter);
      localStorage.setItem('admin_list_exam_type_filter', listExamTypeFilter);
      persistAdminListSortCookie(ADMIN_LIST_TYPE_FILTER_COOKIE, listTypeFilter);
      persistAdminListSortCookie(ADMIN_LIST_STATUS_FILTER_COOKIE, listStatusFilter);
      persistAdminListSortCookie(ADMIN_LIST_EXAM_TYPE_FILTER_COOKIE, listExamTypeFilter);
    } catch {}
  }, [listTypeFilter, listStatusFilter, listExamTypeFilter]);

  const listQueryResult = useInfiniteQuery<
    ExerciseListResponse,
    Error,
    InfiniteData<ExerciseListResponse, ExerciseListPageParam>,
    ReturnType<typeof adminExerciseKeys.list>,
    ExerciseListPageParam
  >({
    queryKey,
    enabled: sortPrefsReady,
    initialPageParam: FIRST_PAGE_PARAM,
    initialData: isDefaultInitialListQuery
      ? buildInitialData(initialItems, initialTotalItems)
      : undefined,
    queryFn: async ({ pageParam, signal }) => {
      const hasSearchQuery = serverListQuery.trim().length > 0;
      const includeTotal =
        pageParam.offset === 0 &&
        (includeTotalOnNextFetchRef.current || (hasActiveListFilter && !hasSearchQuery));

      const result = await fetchExerciseList({
        limit: EXERCISE_LIST_PAGE_SIZE,
        offset: pageParam.offset,
        cursorId: supportsCursorPagination ? pageParam.cursorId : null,
        cursorUpdatedAt: supportsCursorPagination ? pageParam.cursorUpdatedAt : null,
        sortBy: serverSortBy,
        sortDir: listSortDir,
        includeTotal,
        query: serverListQuery,
        type: listTypeFilter,
        qualityStatus: listStatusFilter,
        examType: listExamTypeFilter,
        signal,
      });

      if (pageParam.offset === 0) {
        includeTotalOnNextFetchRef.current = false;
      }

      return result;
    },
    getNextPageParam: (lastPage): ExerciseListPageParam | undefined =>
      lastPage.success && lastPage.hasMore
        ? {
            offset: lastPage.nextOffset ?? 0,
            cursorId: lastPage.nextCursorId ?? null,
            cursorUpdatedAt: lastPage.nextCursorUpdatedAt ?? null,
          }
        : undefined,
    placeholderData: (previousData) => previousData,
  });
  const isServerQuerySettling =
    normalizeSearchText(listQuery) !== normalizeSearchText(serverListQuery) ||
    (listQueryResult.isPlaceholderData && normalizeSearchText(listQuery).length > 0);

  const items = useMemo(() => {
    const merged: ListItem[] = [];
    const known = new Set<number>();
    for (const page of listQueryResult.data?.pages ?? []) {
      if (!page.success) continue;
      for (const item of (page.items as ListItem[]) ?? []) {
        if (known.has(item.id)) continue;
        known.add(item.id);
        merged.push(item);
      }
    }
    return merged;
  }, [listQueryResult.data]);

  const firstPage = listQueryResult.data?.pages[0];
  const firstPageCount =
    firstPage?.success && typeof firstPage.total === 'number' && serverListQuery.trim().length === 0
      ? Number(firstPage.total)
      : null;
  const defaultListData = queryClient.getQueryData<InfiniteData<ExerciseListResponse, ExerciseListPageParam>>(
    adminExerciseKeys.list({
      query: '',
      type: 'all',
      qualityStatus: 'all',
      examType: 'all',
      sortBy: serverSortBy,
      sortDir: listSortDir,
    }),
  );
  const defaultFirstPage = defaultListData?.pages[0];
  const cachedTotalItems =
    defaultFirstPage?.success && typeof defaultFirstPage.total === 'number'
      ? Number(defaultFirstPage.total)
      : null;
  const displayedTotalItems = hasActiveListFilter
    ? totalItems ?? cachedTotalItems
    : firstPageCount ?? totalItems ?? cachedTotalItems;
  const displayedMatchingItems = hasActiveListFilter ? firstPageCount ?? matchingItems : null;

  useEffect(() => {
    if (firstPage && !firstPage.success) {
      setIsError(true);
      setMessage(firstPage.error || 'Ошибка загрузки списка заданий.');
    }
  }, [firstPage, setIsError, setMessage]);

  useEffect(() => {
    if (!listQueryResult.error) return;
    setIsError(true);
    setMessage(listQueryResult.error.message || 'Ошибка загрузки списка заданий.');
  }, [listQueryResult.error, setIsError, setMessage]);

  function setItems(updater: SetStateAction<ListItem[]>) {
    queryClient.setQueriesData<InfiniteData<ExerciseListResponse, ExerciseListPageParam>>(
      { queryKey: adminExerciseKeys.lists() },
      (data) => {
        if (!data) return data;
        const current = data.pages.flatMap((page) => (page.success ? (page.items as ListItem[]) : []));
        const next = typeof updater === 'function' ? updater(current) : updater;
        const nextById = new Map(next.map((item) => [item.id, item]));
        return {
          ...data,
          pages: data.pages.map((page) => {
            if (!page.success) return page;
            return {
              ...page,
              items: page.items
                .filter((item) => nextById.has(item.id))
                .map((item) => nextById.get(item.id) ?? item),
            };
          }),
        };
      },
    );
  }

  async function refreshList(options?: { includeTotal?: boolean; force?: boolean }) {
    if (options?.includeTotal) {
      includeTotalOnNextFetchRef.current = true;
    }
    if (options?.force) {
      await queryClient.invalidateQueries({
        queryKey: adminExerciseKeys.lists(),
        refetchType: 'none',
      });
    }
    await listQueryResult.refetch();
  }

  async function loadMore() {
    if (!listQueryResult.hasNextPage || listQueryResult.isFetchingNextPage) return;
    const result = await listQueryResult.fetchNextPage();
    const lastPage = result.data?.pages[result.data.pages.length - 1];
    if (lastPage && !lastPage.success) {
      setIsError(true);
      setMessage(lastPage.error || 'Ошибка подгрузки списка.');
    }
  }

  const sortedFilteredItems = useMemo(() => {
    const q = normalizeSearchText(listQuery);
    const serverQ = normalizeSearchText(serverListQuery);
    const shouldApplyClientTextFilter = Boolean(q && (q !== serverQ || listQueryResult.isPlaceholderData));
    const filtered = items.filter((item) => {
      if (listTypeFilter !== 'all' && item.type !== listTypeFilter) return false;
      if (listStatusFilter !== 'all' && item.qualityStatus !== listStatusFilter) return false;
      if (listExamTypeFilter !== 'all' && examTypeOf(item) !== listExamTypeFilter) return false;
      if (!shouldApplyClientTextFilter) return true;
      const seedNorm = normalizeSearchText(item.seedKey ?? '');
      const promptNorm = normalizeSearchText(item.prompt);
      const explanationNorm = normalizeSearchText(item.explanation ?? '');
      return (
        String(item.id).includes(q) ||
        seedNorm.includes(q) ||
        promptNorm.includes(q) ||
        explanationNorm.includes(q)
      );
    });
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (listSortBy === 'id') cmp = a.id - b.id;
      else if (listSortBy === 'updatedAt') cmp = new Date(a.updatedAtCursor).getTime() - new Date(b.updatedAtCursor).getTime();
      else if (listSortBy === 'type') cmp = a.type.localeCompare(b.type);
      else cmp = a.qualityStatus.localeCompare(b.qualityStatus);
      return listSortDir === 'asc' ? cmp : -cmp;
    });
  }, [
    items,
    listQuery,
    serverListQuery,
    listQueryResult.isPlaceholderData,
    listTypeFilter,
    listStatusFilter,
    listExamTypeFilter,
    listSortBy,
    listSortDir,
  ]);

  const tableSorting = useMemo<SortingState>(
    () => [{ id: listSortBy, desc: listSortDir === 'desc' }],
    [listSortBy, listSortDir],
  );
  // TanStack Table returns a stateful table instance; React Compiler cannot memoize it safely.
  // eslint-disable-next-line react-hooks/incompatible-library
  const exerciseListTable = useReactTable({
    data: sortedFilteredItems,
    columns: EXERCISE_LIST_COLUMNS,
    state: {
      sorting: tableSorting,
    },
    getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(),
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
  });
  const flatFilteredItems = exerciseListTable.getRowModel().rows.map((row) => row.original);
  const filteredItems = flatFilteredItems;

  const groupedItems = useMemo(() => {
    const groups = new Map<string, ListItem[]>();
    for (const item of flatFilteredItems) {
      const key = `ЕГЭ ${examTypeOf(item)} · ${item.type}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return [...groups.entries()];
  }, [flatFilteredItems]);
  const isListRefreshing =
    listQueryResult.isFetching && !listQueryResult.isFetchingNextPage;

  return {
    items,
    setItems,
    totalItems: displayedTotalItems,
    setTotalItems,
    matchingItems: displayedMatchingItems,
    setMatchingItems,
    initialListPending:
      !sortPrefsReady ||
      (items.length === 0 && listQueryResult.isPending && !listQueryResult.isPlaceholderData),
    hasActiveListFilter,
    filteredItems,
    groupedItems,
    flatFilteredItems,
    listQuery,
    setListQuery,
    listTypeFilter,
    setListTypeFilter,
    listStatusFilter,
    setListStatusFilter,
    listExamTypeFilter,
    setListExamTypeFilter,
    listSortBy,
    setListSortBy,
    listSortDir,
    setListSortDir,
    sortPrefsReady,
    hasMore: Boolean(
      listQueryResult.hasNextPage && !isServerQuerySettling && !isListRefreshing,
    ),
    loadingMore: listQueryResult.isFetchingNextPage,
    refreshList,
    loadMore,
  };
}
