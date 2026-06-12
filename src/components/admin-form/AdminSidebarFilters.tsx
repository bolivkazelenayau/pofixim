import { ArrowDown, ArrowUp, Search, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { inputClass, qualityStatuses } from './constants';

type AdminSidebarFiltersProps = {
  listQuery: string;
  listTypeFilter: string;
  listExamTypeFilter: string;
  listStatusFilter: string;
  listSortBy: 'id' | 'updatedAt' | 'type' | 'status';
  listSortDir: 'asc' | 'desc';
  sortPrefsReady: boolean;
  listTypes: string[];
  listExamTypes: string[];
  onListQueryChange: (value: string) => void;
  onListTypeFilterChange: (value: string) => void;
  onListExamTypeFilterChange: (value: string) => void;
  onListStatusFilterChange: (value: string) => void;
  onListSortByChange: (value: 'id' | 'updatedAt' | 'type' | 'status') => void;
  onListSortDirChange: (value: 'asc' | 'desc') => void;
};

export default function AdminSidebarFilters({
  listQuery,
  listTypeFilter,
  listExamTypeFilter,
  listStatusFilter,
  listSortBy,
  listSortDir,
  sortPrefsReady,
  listTypes,
  listExamTypes,
  onListQueryChange,
  onListTypeFilterChange,
  onListExamTypeFilterChange,
  onListStatusFilterChange,
  onListSortByChange,
  onListSortDirChange,
}: AdminSidebarFiltersProps) {
  const savedViews = [
    {
      label: 'Review',
      active: listStatusFilter === 'review' && listExamTypeFilter === 'all',
      onClick: () => {
        onListStatusFilterChange(listStatusFilter === 'review' ? 'all' : 'review');
        onListExamTypeFilterChange('all');
      },
    },
    {
      label: 'Draft',
      active: listStatusFilter === 'draft' && listExamTypeFilter === 'all',
      onClick: () => {
        onListStatusFilterChange(listStatusFilter === 'draft' ? 'all' : 'draft');
        onListExamTypeFilterChange('all');
      },
    },
    {
      label: 'Approved',
      active: listStatusFilter === 'approved',
      onClick: () => {
        onListStatusFilterChange(listStatusFilter === 'approved' ? 'all' : 'approved');
        onListExamTypeFilterChange('all');
      },
    },
  ];

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {savedViews.map((view) => (
          <button
            key={view.label}
            type="button"
            onClick={view.onClick}
            className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-[background-color,border-color,color,transform] duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] ${
              view.active
                ? 'border-foreground/20 bg-foreground text-background'
                : 'border-stroke bg-surface-strong text-foreground/65 hover:bg-stroke hover:text-foreground'
            }`}
          >
            {view.label}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" aria-hidden="true" />
        <input
          id="admin-list-search"
          className={`${inputClass} pl-9 pr-9`}
          placeholder="Поиск: id / seed_key / текст"
          value={listQuery}
          onChange={(event) => onListQueryChange(event.target.value)}
        />
        {listQuery ? (
          <button
            type="button"
            onClick={() => onListQueryChange('')}
            aria-label="Очистить поиск"
            className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-foreground/45 transition-colors duration-150 ease-out hover:bg-stroke hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select value={listTypeFilter} onValueChange={onListTypeFilterChange}>
          <SelectTrigger className={inputClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {listTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type === 'all' ? 'Все типы' : type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={listExamTypeFilter} onValueChange={onListExamTypeFilterChange}>
          <SelectTrigger className={inputClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {listExamTypes.map((examType) => (
              <SelectItem key={examType} value={examType}>
                {examType === 'all' ? 'ЕГЭ: все' : `ЕГЭ: ${examType}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-2">
        <Select value={listStatusFilter} onValueChange={onListStatusFilterChange}>
          <SelectTrigger className={inputClass}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            {qualityStatuses.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-foreground/50">
          <span className="uppercase tracking-wider">Сортировка</span>
          {sortPrefsReady && (listSortBy !== 'id' || listSortDir !== 'asc') && (
            <button
              type="button"
              onClick={() => {
                onListSortByChange('id');
                onListSortDirChange('asc');
              }}
              className="group relative flex items-center gap-1 hover:text-foreground"
            >
              <X className="h-3 w-3" />
              Сбросить
              <span className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden w-max rounded-md border border-stroke bg-surface-strong px-2 py-1 text-[11px] font-normal text-foreground/80 shadow-md group-hover:block">
                Сбросить сортировку
              </span>
            </button>
          )}
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          {sortPrefsReady ? (
            <>
              <Select
                value={listSortBy}
                onValueChange={(value) =>
                  onListSortByChange(value as typeof listSortBy)
                }
              >
                <SelectTrigger className={inputClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="id">По номеру</SelectItem>
                  <SelectItem value="updatedAt">По дате изменения</SelectItem>
                  <SelectItem value="type">По типу</SelectItem>
                  <SelectItem value="status">По статусу</SelectItem>
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => onListSortDirChange(listSortDir === 'asc' ? 'desc' : 'asc')}
                className="group relative flex w-8 self-stretch items-center justify-center rounded-lg border border-stroke bg-surface-strong text-foreground/70 transition-colors duration-150 ease-out hover:bg-stroke hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                {listSortDir === 'asc' ? <ArrowUp className="h-4 w-4" aria-hidden="true" /> : <ArrowDown className="h-4 w-4" aria-hidden="true" />}
                <span className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden w-max rounded-md border border-stroke bg-surface-strong px-2 py-1 text-[11px] font-normal text-foreground/80 shadow-md group-hover:block">
                  {listSortDir === 'asc' ? 'По возрастанию' : 'По убыванию'}
                </span>
              </button>
            </>
          ) : (
            <>
              <div className="h-8 w-full animate-pulse rounded-lg border border-stroke bg-surface" />
              <div className="h-8 w-8 animate-pulse rounded-lg border border-stroke bg-surface" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
