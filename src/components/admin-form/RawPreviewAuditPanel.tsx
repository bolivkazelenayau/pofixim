import { inputClass } from './constants';
import type { RawPreviewItem } from './types';

type RawPreviewAuditPanelProps = {
  filter: string;
  limit: number;
  loading: boolean;
  items: RawPreviewItem[];
  onFilterChange: (value: string) => void;
  onLimitChange: (value: number) => void;
  onRun: () => void;
};

export default function RawPreviewAuditPanel({
  filter,
  limit,
  loading,
  items,
  onFilterChange,
  onLimitChange,
  onRun,
}: RawPreviewAuditPanelProps) {
  return (
    <div className="mt-4 rounded-[20px] border border-dashed border-stroke/70 bg-surface/30 p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase text-foreground/50">
        Raw HTML Preview
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_72px] gap-2">
        <input
          name="rawPreviewFilter"
          className={`${inputClass} bg-surface-strong`}
          placeholder="Файл (напр. 56151015)"
          value={filter}
          onChange={(event) => onFilterChange(event.target.value)}
        />
        <input
          name="rawPreviewLimit"
          className={`${inputClass} bg-surface-strong`}
          type="number"
          min={1}
          max={20}
          value={limit}
          onChange={(event) =>
            onLimitChange(Math.max(1, Math.min(20, Number(event.target.value) || 3)))
          }
        />
      </div>
      <button
        type="button"
        className="mt-2 w-full rounded-lg bg-foreground/5 px-3 py-2 text-xs font-medium text-foreground/80 transition-colors duration-150 ease-out hover:bg-foreground/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onRun}
        disabled={loading}
      >
        {loading ? 'Сканирование...' : 'Сканировать raw HTML'}
      </button>
      {items.length > 0 ? (
        <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
          {items.map((item) => (
            <div key={item.file} className="rounded-2xl border border-stroke bg-surface-strong p-2 text-xs">
              <div className="font-semibold text-foreground/80">{item.file}</div>
              <div className="mt-1 text-foreground/70">
                пробелы-перед-пунктуацией: {item.beforeIssues.spacesBeforePunct} →{' '}
                {item.afterIssues.spacesBeforePunct}
              </div>
              <div className="mt-1 grid gap-1">
                <div className="rounded border border-stroke bg-surface p-1 text-foreground/70">
                  <span className="font-medium">До:</span> {item.beforeSnippet}
                </div>
                <div className="rounded border border-stroke bg-surface p-1 text-foreground/70">
                  <span className="font-medium">После:</span> {item.afterSnippet}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
