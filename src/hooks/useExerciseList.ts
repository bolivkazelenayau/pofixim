'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchExerciseList } from '@/components/admin-form/api';
import type { ExerciseListResponse, ListItem } from '@/components/admin-form/types';

const EXERCISE_LIST_PAGE_SIZE = 100;

type UseExerciseListConfig = {
  initialItems: ListItem[];
  initialTotalItems: number | null | undefined;
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

export function useExerciseList({ initialItems, initialTotalItems, setIsError, setMessage }: UseExerciseListConfig) {
  const [items, setItems] = useState<ListItem[]>(initialItems);
  const [totalItems, setTotalItems] = useState<number | null>(initialTotalItems ?? null);
  const [nextOffset, setNextOffset] = useState<number>(initialItems.length);
  const [hasMore, setHasMore] = useState<boolean>(initialItems.length >= EXERCISE_LIST_PAGE_SIZE);
  const [nextCursorId, setNextCursorId] = useState<number | null>(
    initialItems.length > 0 ? initialItems[initialItems.length - 1].id : null,
  );
  const [nextCursorUpdatedAt, setNextCursorUpdatedAt] = useState<string | null>(
    initialItems.length > 0 ? initialItems[initialItems.length - 1].updatedAtCursor : null,
  );
  const [initialListPending, setInitialListPending] = useState(initialItems.length === 0);
  const [matchingItems, setMatchingItems] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listQuery, setListQuery] = useState('');
  const [serverListQuery, setServerListQuery] = useState('');
  const [listTypeFilter, setListTypeFilter] = useState<string>('all');
  const [listStatusFilter, setListStatusFilter] = useState<string>('all');
  const [listExamTypeFilter, setListExamTypeFilter] = useState<string>('all');
  const [listSortBy, setListSortBy] = useState<'id' | 'updatedAt' | 'type' | 'status'>('id');
  const [listSortDir, setListSortDir] = useState<'asc' | 'desc'>('desc');
  const [sortPrefsReady, setSortPrefsReady] = useState(false);

  const sortPrefsReadyRef = useRef(false);
  const lastAppliedRefreshKeyRef = useRef('');
  const inFlightRefreshKeyRef = useRef<string | null>(null);
  const refreshSeqRef = useRef(0);
  const refreshAbortControllerRef = useRef<AbortController | null>(null);

  const hasActiveListFilter =
    serverListQuery.trim().length > 0 ||
    listTypeFilter !== 'all' ||
    listStatusFilter !== 'all' ||
    listExamTypeFilter !== 'all';

  const listTypes = useMemo(() => ['all'], []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedSortBy = localStorage.getItem('admin_list_sort_by');
        const savedSortDir = localStorage.getItem('admin_list_sort_dir');
        if (savedSortBy === 'id' || savedSortBy === 'updatedAt' || savedSortBy === 'type' || savedSortBy === 'status') {
          setListSortBy(savedSortBy);
        }
        if (savedSortDir === 'asc' || savedSortDir === 'desc') {
          setListSortDir(savedSortDir);
        }
      } catch {}
      sortPrefsReadyRef.current = true;
      setSortPrefsReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!sortPrefsReadyRef.current) return;
    try {
      localStorage.setItem('admin_list_sort_by', listSortBy);
      localStorage.setItem('admin_list_sort_dir', listSortDir);
    } catch {}
  }, [listSortBy, listSortDir]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setServerListQuery(listQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [listQuery]);

  useEffect(() => () => {
    refreshAbortControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!sortPrefsReady) return;
    const timer = setTimeout(() => {
      void refreshList();
    }, 0);
    return () => clearTimeout(timer);
  }, [sortPrefsReady, serverListQuery, listTypeFilter, listStatusFilter, listExamTypeFilter, listSortBy, listSortDir]);

  async function refreshList(options?: { includeTotal?: boolean; force?: boolean }) {
    const hasSearchQuery = serverListQuery.trim().length > 0;
    const includeTotal = options?.includeTotal ?? ((hasActiveListFilter && !hasSearchQuery) || initialListPending);
    const requestKey = JSON.stringify({
      query: serverListQuery,
      type: listTypeFilter,
      qualityStatus: listStatusFilter,
      examType: listExamTypeFilter,
      sortBy: listSortBy === 'updatedAt' ? 'updatedAt' : 'id',
      sortDir: listSortDir,
      includeTotal,
    });
    if (!options?.force) {
      if (requestKey === lastAppliedRefreshKeyRef.current) return;
      if (requestKey === inFlightRefreshKeyRef.current) return;
    }
    refreshAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    refreshAbortControllerRef.current = abortController;
    inFlightRefreshKeyRef.current = requestKey;
    const requestSeq = ++refreshSeqRef.current;
    let res: ExerciseListResponse;
    try {
      res = await fetchExerciseList({
        limit: EXERCISE_LIST_PAGE_SIZE,
        offset: 0,
        sortBy: listSortBy === 'updatedAt' ? 'updatedAt' : 'id',
        sortDir: listSortDir,
        includeTotal,
        query: serverListQuery,
        type: listTypeFilter,
        qualityStatus: listStatusFilter,
        examType: listExamTypeFilter,
        signal: abortController.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        if (inFlightRefreshKeyRef.current === requestKey) {
          inFlightRefreshKeyRef.current = null;
        }
        return;
      }
      throw error;
    }
    if (requestSeq !== refreshSeqRef.current) return;
    if (res.success) {
      setItems(res.items as ListItem[]);
      setNextOffset(res.nextOffset ?? (res.items?.length ?? 0));
      setHasMore(Boolean(res.hasMore));
      const cursorId = typeof res.nextCursorId === 'number' ? res.nextCursorId : null;
      const cursorUpdatedAt = typeof res.nextCursorUpdatedAt === 'string' ? res.nextCursorUpdatedAt : null;
      setNextCursorId(cursorId);
      setNextCursorUpdatedAt(cursorUpdatedAt);
      if (includeTotal) {
        const resultCount = Number(res.total ?? res.items.length);
        if (hasActiveListFilter) {
          setMatchingItems(resultCount);
        } else {
          setTotalItems(resultCount);
          setMatchingItems(null);
        }
      } else {
        setMatchingItems(null);
      }
      lastAppliedRefreshKeyRef.current = requestKey;
    } else {
      setIsError(true);
      setMessage(res.error || 'Ошибка загрузки списка заданий.');
    }
    if (initialListPending) {
      setInitialListPending(false);
    }
    if (inFlightRefreshKeyRef.current === requestKey) {
      inFlightRefreshKeyRef.current = null;
    }
    if (refreshAbortControllerRef.current === abortController) {
      refreshAbortControllerRef.current = null;
    }
  }

  async function loadMore() {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetchExerciseList({
        limit: EXERCISE_LIST_PAGE_SIZE,
        offset: nextOffset,
        cursorId: nextCursorId,
        cursorUpdatedAt: nextCursorUpdatedAt,
        sortBy: listSortBy === 'updatedAt' ? 'updatedAt' : 'id',
        sortDir: listSortDir,
        includeTotal: false,
        query: serverListQuery,
        type: listTypeFilter,
        qualityStatus: listStatusFilter,
        examType: listExamTypeFilter,
      });
      if (res.success) {
        const incoming = (res.items as ListItem[]) ?? [];
        setItems((prev) => {
          const merged = [...prev];
          const known = new Set(prev.map((i) => i.id));
          for (const item of incoming) {
            if (!known.has(item.id)) merged.push(item);
          }
          return merged;
        });
        setNextOffset(res.nextOffset ?? (nextOffset + incoming.length));
        setHasMore(Boolean(res.hasMore));
        const cursorId = typeof res.nextCursorId === 'number' ? res.nextCursorId : null;
        const cursorUpdatedAt = typeof res.nextCursorUpdatedAt === 'string' ? res.nextCursorUpdatedAt : null;
        setNextCursorId(cursorId);
        setNextCursorUpdatedAt(cursorUpdatedAt);
      } else {
        setIsError(true);
        setMessage(res.error || 'Ошибка подгрузки списка.');
      }
    } finally {
      setLoadingMore(false);
    }
  }

  const filteredItems = useMemo(() => {
    const q = normalizeSearchText(listQuery);
    const serverQ = normalizeSearchText(serverListQuery);
    const shouldApplyClientTextFilter = Boolean(q && q !== serverQ);
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
  }, [items, listQuery, serverListQuery, listTypeFilter, listStatusFilter, listExamTypeFilter, listSortBy, listSortDir]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, ListItem[]>();
    for (const item of filteredItems) {
      const key = `ЕГЭ ${examTypeOf(item)} · ${item.type}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return [...groups.entries()];
  }, [filteredItems]);

  const flatFilteredItems = filteredItems;

  return {
    items,
    setItems,
    totalItems,
    setTotalItems,
    matchingItems,
    setMatchingItems,
    initialListPending,
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
    hasMore,
    loadingMore,
    refreshList,
    loadMore,
  };
}
