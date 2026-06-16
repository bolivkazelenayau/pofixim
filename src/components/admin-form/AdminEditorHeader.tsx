'use client';

import { useEffect, useState } from 'react';
import { Bean } from 'lucide-react';
import { copyTextToClipboard } from '@/lib/clipboard';

type AdminEditorHeaderProps = {
  isEdit: boolean;
  hasUnsavedChanges: boolean;
  formMeta: {
    id?: number;
    type: string;
    qualityStatus: string;
    isActive: boolean;
    seedKey: string;
  };
  onUndo: () => void;
  onRedo: () => void;
  onNewDraft: () => void;
};

export default function AdminEditorHeader({
  isEdit,
  hasUnsavedChanges,
  formMeta,
  onUndo,
  onRedo,
  onNewDraft,
}: AdminEditorHeaderProps) {
  const [copyToast, setCopyToast] = useState<string | null>(null);

  useEffect(() => {
    if (!copyToast) return;
    const timer = window.setTimeout(() => setCopyToast(null), 1400);
    return () => window.clearTimeout(timer);
  }, [copyToast]);

  async function copySeed() {
    const didCopy = await copyTextToClipboard(formMeta.seedKey);
    setCopyToast(didCopy ? 'Seed скопирован' : 'Не удалось скопировать');
  }

  return (
    <div className="mb-5 grid gap-3 border-b border-stroke pb-4 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="mr-1 text-balance text-xl font-semibold leading-tight text-foreground">
            {isEdit ? `#${formMeta.id}` : 'New exercise'}
          </h2>
          <HeaderBadge>{formMeta.type}</HeaderBadge>
          <HeaderBadge tone={statusTone(formMeta.qualityStatus)}>
            {formMeta.qualityStatus}
          </HeaderBadge>
          <HeaderBadge tone={formMeta.isActive ? 'green' : 'muted'}>
            {formMeta.isActive ? 'active' : 'inactive'}
          </HeaderBadge>
          {hasUnsavedChanges ? <HeaderBadge tone="amber">unsaved</HeaderBadge> : null}
        </div>
        {formMeta.seedKey ? (
          <p className="relative mt-1 flex items-center gap-1.5 font-mono text-[11px] text-foreground/70">
            <Bean className="h-3 w-3" aria-hidden="true" />
            <span>seed:</span>
            <button
              type="button"
              onClick={copySeed}
              className="max-w-[50ch] truncate font-mono transition-colors duration-150 ease-out hover:text-primary focus:outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary/30"
              title="Скопировать seed key"
            >
              {formMeta.seedKey}
            </button>
            {copyToast && (
              <span className="pointer-events-none absolute left-0 top-full mt-1 animate-[feedback-explanation-in_180ms_cubic-bezier(0.2,0,0,1)] rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold text-background shadow-lg">
                {copyToast}
              </span>
            )}
          </p>
        ) : (
          <div className="mt-1 max-w-3xl truncate font-mono text-[11px] text-foreground/70">
            seed key not set
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-foreground/70">
          <ShortcutKeys keys="Ctrl + S" label="save" />
          <ShortcutKeys keys="Ctrl + K" label="command" />
          <ShortcutKeys keys="Alt Up/Down" label="navigate" />
        </div>
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <HeaderAction onClick={onUndo} title="Undo">
          Undo
        </HeaderAction>
        <HeaderAction onClick={onRedo} title="Redo">
          Redo
        </HeaderAction>
        <button
          type="button"
          className="rounded-lg border border-stroke bg-surface px-2.5 py-1.5 text-xs font-semibold text-foreground/80 transition-[background-color,border-color,color,transform] duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96]"
          onClick={onNewDraft}
        >
          Новый черновик
        </button>
      </div>
    </div>
  );
}

function HeaderAction({
  children,
  onClick,
  title,
}: {
  children: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      className="rounded-lg border border-transparent px-2.5 py-1.5 text-xs font-medium text-foreground/70 transition-[background-color,border-color,color,transform] duration-150 ease-out hover:border-stroke hover:bg-stroke hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] dark:hover:bg-stroke"
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

function ShortcutKeys({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <kbd className="rounded border border-stroke bg-surface px-1 py-0.5 font-mono text-[10px] text-foreground/75">
        {keys}
      </kbd>
      <span>{label}</span>
    </span>
  );
}

function HeaderBadge({
  children,
  tone = 'default',
}: {
  children: string;
  tone?: 'default' | 'green' | 'amber' | 'red' | 'muted';
}) {
  const className = {
    default: 'border-stroke bg-surface text-foreground/70',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200',
    amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200',
    red: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200',
    muted: 'border-stroke bg-foreground/5 text-foreground/65',
  }[tone];

  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${className}`}>
      {children}
    </span>
  );
}

function statusTone(status: string): 'green' | 'amber' | 'red' | 'muted' {
  if (status === 'approved') return 'green';
  if (status === 'review') return 'amber';
  if (status === 'archived') return 'muted';
  return 'red';
}
