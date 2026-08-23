'use client';

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import CompactMarkdown from '@/components/admin-form/markdown/CompactMarkdown';
import type { ListItem } from './types';

type AdminCommandPaletteProps = {
  open: boolean;
  selectedId: number | null;
  items: ListItem[];
  onOpenChange: (open: boolean) => void;
  onOpenExercise: (id: number) => void;
  onSave: () => void;
  onNewDraft: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onFocusSearch: () => void;
  onSetStatusView: (status: 'all' | 'draft' | 'review' | 'approved') => void;
};

export default function AdminCommandPalette({
  open,
  selectedId,
  items,
  onOpenChange,
  onOpenExercise,
  onSave,
  onNewDraft,
  onNext,
  onPrevious,
  onFocusSearch,
  onSetStatusView,
}: AdminCommandPaletteProps) {
  function run(action: () => void) {
    onOpenChange(false);
    window.setTimeout(action, 0);
  }

  const visibleItems = items.slice(0, 24);
  const selectedItem = selectedId
    ? items.find((item) => item.id === selectedId)
    : null;

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Панель команд администратора"
      description="Запускайте действия и открывайте задания."
      className="max-w-xl"
    >
      <Command>
        <CommandInput placeholder="Поиск команд или заданий..." />
        {selectedItem ? (
          <div className="border-b border-stroke px-3 py-2 text-xs text-foreground/55">
            <span className="font-semibold text-foreground/75">Текущее:</span>{' '}
            <span className="font-mono text-xs font-semibold text-foreground">#{selectedItem.id}</span>
            <CompactMarkdown inline className="text-pretty mt-0.5">
              {selectedItem.prompt}
            </CompactMarkdown>
          </div>
        ) : null}
        <CommandList>
          <CommandEmpty>
            <div className="py-6 text-center">
              <div className="text-sm font-semibold text-foreground">Ничего не найдено</div>
              <p className="mt-1 text-xs text-foreground/55">
                Попробуйте номер задания, seed key, статус или название действия.
              </p>
            </div>
          </CommandEmpty>
          <CommandGroup heading="Действия">
            <CommandItem value="save current exercise" onSelect={() => run(onSave)}>
              Сохранить текущее задание
              <CommandShortcut>Ctrl S</CommandShortcut>
            </CommandItem>
            <CommandItem value="new draft create exercise" onSelect={() => run(onNewDraft)}>
              Новый черновик
              <CommandShortcut>N</CommandShortcut>
            </CommandItem>
            <CommandItem value="focus sidebar search" onSelect={() => run(onFocusSearch)}>
              Перейти к поиску списка
              <CommandShortcut>/</CommandShortcut>
            </CommandItem>
            <CommandItem value="next exercise" onSelect={() => run(onNext)}>
              Открыть следующее задание
              <CommandShortcut>Alt ↓</CommandShortcut>
            </CommandItem>
            <CommandItem value="previous exercise" onSelect={() => run(onPrevious)}>
              Открыть предыдущее задание
              <CommandShortcut>Alt ↑</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Представления">
            <CommandItem value="view all exercises clear filters" onSelect={() => run(() => onSetStatusView('all'))}>
              Все статусы
            </CommandItem>
            <CommandItem value="view review exercises" onSelect={() => run(() => onSetStatusView('review'))}>
              Очередь проверки
            </CommandItem>
            <CommandItem value="view draft exercises" onSelect={() => run(() => onSetStatusView('draft'))}>
              Очередь черновиков
            </CommandItem>
            <CommandItem value="view approved exercises" onSelect={() => run(() => onSetStatusView('approved'))}>
              Очередь одобренных
            </CommandItem>
          </CommandGroup>
          {visibleItems.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Открыть задание">
                {visibleItems.map((item, index) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.id} ${item.seedKey ?? ''} ${item.type} ${item.qualityStatus} ${item.prompt}`}
                    onSelect={() => run(() => onOpenExercise(item.id))}
                    data-checked={selectedId === item.id}
                    className={index > 0 ? 'border-t border-stroke/50' : ''}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-mono text-xs font-semibold text-foreground">#{item.id}</span>
                      <CompactMarkdown inline className="text-pretty">
                        {item.prompt}
                      </CompactMarkdown>
                    </span>
                    <CommandShortcut>
                      {selectedId === item.id ? 'открыто' : item.qualityStatus}
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
