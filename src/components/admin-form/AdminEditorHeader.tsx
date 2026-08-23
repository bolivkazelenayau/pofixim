'use client';

import { useEffect, useState } from 'react';
import { Bean } from 'lucide-react';
import { copyTextToClipboard } from '@/lib/clipboard';
import DatabaseSaveIndicator, { type DatabaseIndicator } from './DatabaseSaveIndicator';

type AdminEditorHeaderProps = {
  isEdit: boolean;
  databaseIndicator: DatabaseIndicator;
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
  databaseIndicator,
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
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="mr-1 min-w-0 text-balance text-xl font-semibold leading-tight text-foreground">
            {isEdit ? `#${formMeta.id}` : 'Новое задание'}
          </h2>
          <span className="text-xs text-foreground/65">Тип: {formMeta.type}</span>
          <span className="text-xs text-foreground/65">Качество: {qualityLabel(formMeta.qualityStatus)}</span>
          <span className="text-xs text-foreground/65">
            Доступность: {formMeta.isActive ? 'активно' : 'неактивно'}
          </span>
        </div>
        <DatabaseSaveIndicator indicator={databaseIndicator} className="mt-3" />
        {formMeta.seedKey ? (
          <p className="relative mt-1 flex items-center gap-1.5 font-mono text-[11px] text-foreground/70">
            <Bean className="h-3 w-3" aria-hidden="true" />
            <span>seed:</span>
            <button
              type="button"
              onClick={copySeed}
              className="min-h-10 max-w-[50ch] truncate font-mono transition-colors duration-150 ease-out hover:text-primary focus:outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary/30"
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
            seed key не задан
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-foreground/70">
          <ShortcutKeys keys="Ctrl + S" label="сохранить" />
          <ShortcutKeys keys="Ctrl + K" label="команды" />
          <ShortcutKeys keys="Alt Up/Down" label="перейти" />
        </div>
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <HeaderAction onClick={onUndo} title="Отменить последнее изменение">
          Отменить
        </HeaderAction>
        <HeaderAction onClick={onRedo} title="Повторить отменённое изменение">
          Повторить
        </HeaderAction>
        <button
          type="button"
          className="min-h-10 rounded-lg border border-stroke bg-surface px-2.5 py-1.5 text-xs font-semibold text-foreground/80 transition-[background-color,border-color,color,transform] duration-150 ease-out hover:bg-stroke focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96]"
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
      className="min-h-10 rounded-lg border border-transparent px-2.5 py-1.5 text-xs font-medium text-foreground/70 transition-[background-color,border-color,color,transform] duration-150 ease-out hover:border-stroke hover:bg-stroke hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] dark:hover:bg-stroke"
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

function qualityLabel(status: string) {
  switch (status) {
    case 'draft':
      return 'черновик';
    case 'review':
      return 'на проверке';
    case 'approved':
      return 'одобрено';
    case 'archived':
      return 'в архиве';
    default:
      return status;
  }
}
