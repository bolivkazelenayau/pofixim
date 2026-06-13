import { inputClass, qualityStatuses } from './constants';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
    <TooltipProvider>
    <div className="mb-3 space-y-2 rounded-xl border border-stroke bg-surface p-2.5">
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-foreground/80">
        <span className="tabular-nums">Выбрано: {selectedCount}</span>
        <Tooltip>
          <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-lg border border-stroke bg-surface-strong text-[11px] font-bold text-foreground/70 transition-colors duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            aria-label="Подсказка по массовым действиям"
          >
            i
          </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Действия применяются к выделенным заданиям.
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onApplyStatus}
            disabled={batchSaving}
            className="h-full w-full rounded-lg border border-stroke bg-surface-strong px-2 py-1.5 text-xs font-medium text-foreground/80 transition-colors duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60"
          >
            Применить статус
          </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-center">
            Изменить статус у выделенных.
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onApplyActivity}
            disabled={batchSaving}
            className="h-full w-full rounded-lg border border-stroke bg-surface-strong px-2 py-1.5 text-xs font-medium text-foreground/80 transition-colors duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60"
          >
            Применить активность
          </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-center">
            Вкл/выкл выделенные задания.
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onToggleMore}
            className="h-full w-full rounded-lg border border-stroke bg-surface-strong px-2 py-1.5 text-xs font-medium text-foreground/80 transition-colors duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60"
          >
            Параметры
          </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-center">
            Показать/скрыть расширенные параметры.
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClearSelection}
            className="h-full w-full rounded-lg border border-stroke bg-surface-strong px-2 py-1.5 text-xs font-medium text-foreground/80 transition-colors duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            Снять выделение
          </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-center">
            Снять текущее выделение.
          </TooltipContent>
        </Tooltip>
      </div>
      {showMoreBatchActions ? (
        <div className="grid grid-cols-1 gap-2">
          <Select
            name="batchQualityStatus"
            value={batchStatus}
            onValueChange={(value) => onBatchStatusChange(value as typeof batchStatus)}
          >
            <SelectTrigger className={inputClass} aria-label="Batch quality status">
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
            name="batchIsActive"
            value={batchIsActive}
            onValueChange={(value) => onBatchIsActiveChange(value as typeof batchIsActive)}
          >
            <SelectTrigger className={inputClass} aria-label="Batch activity">
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
    </TooltipProvider>
  );
}
