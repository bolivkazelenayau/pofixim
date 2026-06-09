export type DatabaseIndicator = {
  label: string;
  detail: string;
  box: string;
  dot: string;
};

type DatabaseSaveIndicatorProps = {
  indicator: DatabaseIndicator;
  className?: string;
};

export default function DatabaseSaveIndicator({
  indicator,
  className = '',
}: DatabaseSaveIndicatorProps) {
  return (
    <div
      aria-live="polite"
      className={`${className} inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide ${indicator.box}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${indicator.dot}`} />
      <span>{indicator.label}</span>
      {indicator.detail && <span className="opacity-70">· {indicator.detail}</span>}
    </div>
  );
}
