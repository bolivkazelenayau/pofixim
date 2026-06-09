import { inputClass, qualityStatuses } from './constants';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type AdminBatchActionsProps = {
  selectedCount: number;
  batchSaving: boolean;
  showMoreBatchActions: boolean;
  batchStatus: (typeof qualityStatuses)[number];
  batchIsActive: 'active' | 'inactive';
  onApplyStatus: () => void;
  onApplyActivity: () => void;
  onToggleMore: () => void;
  onClearSelection: () => void;
  onBatchStatusChange: (value: (typeof qualityStatuses)[number]) => void;
  onBatchIsActiveChange: (value: 'active' | 'inactive') => void;
};

export default function AdminBatchActions({
  selectedCount,
  batchSaving,
  showMoreBatchActions,
  batchStatus,
  batchIsActive,
  onApplyStatus,
  onApplyActivity,
  onToggleMore,
  onClearSelection,
  onBatchStatusChange,
  onBatchIsActiveChange,
}: AdminBatchActionsProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="mb-3 space-y-2 rounded-lg border border-stroke bg-surface p-2">
      <div className="flex items-center gap-1 text-xs font-semibold text-foreground/80">
        <span>Выбрано: {selectedCount}</span>
        <span className="relative inline-flex">
          <button
            type="button"
            className="group inline-flex h-4 w-4 items-center justify-center rounded-full border border-stroke bg-surface-strong text-[10px] font-bold text-foreground/70 hover:bg-stroke focus:outline-none"
            aria-label="Подсказка по массовым действиям"
          >
            i
            <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-52 -translate-x-1/2 rounded-md border border-stroke bg-surface-strong px-2 py-1 text-[11px] font-normal text-foreground/80 shadow-md group-hover:block group-focus-visible:block">
              Действия применяются к выделенным заданиям.
            </span>
          </button>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <span className="group relative block h-full w-full">
          <button
            type="button"
            onClick={onApplyStatus}
            disabled={batchSaving}
            className="h-full w-full rounded-md border border-stroke bg-surface-strong px-2 py-1 text-xs font-medium text-foreground/80 hover:bg-stroke disabled:opacity-60"
          >
            Применить статус
          </button>
          <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-48 -translate-x-1/2 rounded-md border border-stroke bg-surface-strong px-2.5 py-1.5 text-center text-[11px] font-normal leading-snug text-foreground/80 shadow-md whitespace-normal group-hover:block">
            Изменить статус у выделенных.
          </span>
        </span>
        <span className="group relative block h-full w-full">
          <button
            type="button"
            onClick={onApplyActivity}
            disabled={batchSaving}
            className="h-full w-full rounded-md border border-stroke bg-surface-strong px-2 py-1 text-xs font-medium text-foreground/80 hover:bg-stroke disabled:opacity-60"
          >
            Применить активность
          </button>
          <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-48 -translate-x-1/2 rounded-md border border-stroke bg-surface-strong px-2.5 py-1.5 text-center text-[11px] font-normal leading-snug text-foreground/80 shadow-md whitespace-normal group-hover:block">
            Вкл/выкл выделенные задания.
          </span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <span className="group relative block h-full w-full">
          <button
            type="button"
            onClick={onToggleMore}
            className="h-full w-full rounded-md border border-stroke bg-surface-strong px-2 py-1 text-xs font-medium text-foreground/80 hover:bg-stroke disabled:opacity-60"
          >
            Параметры
          </button>
          <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-48 -translate-x-1/2 rounded-md border border-stroke bg-surface-strong px-2.5 py-1.5 text-center text-[11px] font-normal leading-snug text-foreground/80 shadow-md whitespace-normal group-hover:block">
            Показать/скрыть расширенные параметры.
          </span>
        </span>
        <span className="group relative block h-full w-full">
          <button
            type="button"
            onClick={onClearSelection}
            className="h-full w-full rounded-md border border-stroke bg-surface-strong px-2 py-1 text-xs font-medium text-foreground/80 hover:bg-stroke"
          >
            Снять выделение
          </button>
          <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-48 -translate-x-1/2 rounded-md border border-stroke bg-surface-strong px-2.5 py-1.5 text-center text-[11px] font-normal leading-snug text-foreground/80 shadow-md whitespace-normal group-hover:block">
            Снять текущее выделение.
          </span>
        </span>
      </div>
      {showMoreBatchActions ? (
        <div className="grid grid-cols-1 gap-2">
          <Select
            value={batchStatus}
            onValueChange={(value) => onBatchStatusChange(value as typeof batchStatus)}
          >
            <SelectTrigger className={inputClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {qualityStatuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={batchIsActive}
            onValueChange={(value) => onBatchIsActiveChange(value as typeof batchIsActive)}
          >
            <SelectTrigger className={inputClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Активно</SelectItem>
              <SelectItem value="inactive">Неактивно</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}
