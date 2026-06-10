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

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Admin command palette"
      description="Run admin actions and open exercises."
      className="max-w-xl"
    >
      <Command>
        <CommandInput placeholder="Search commands or exercises..." />
        <CommandList>
          <CommandEmpty>No command found.</CommandEmpty>
          <CommandGroup heading="Actions">
            <CommandItem value="save current exercise" onSelect={() => run(onSave)}>
              Save current exercise
              <CommandShortcut>Ctrl S</CommandShortcut>
            </CommandItem>
            <CommandItem value="new draft create exercise" onSelect={() => run(onNewDraft)}>
              New draft
              <CommandShortcut>N</CommandShortcut>
            </CommandItem>
            <CommandItem value="focus sidebar search" onSelect={() => run(onFocusSearch)}>
              Focus list search
              <CommandShortcut>/</CommandShortcut>
            </CommandItem>
            <CommandItem value="next exercise" onSelect={() => run(onNext)}>
              Open next exercise
              <CommandShortcut>Alt ↓</CommandShortcut>
            </CommandItem>
            <CommandItem value="previous exercise" onSelect={() => run(onPrevious)}>
              Open previous exercise
              <CommandShortcut>Alt ↑</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Views">
            <CommandItem value="view all exercises clear filters" onSelect={() => run(() => onSetStatusView('all'))}>
              All statuses
            </CommandItem>
            <CommandItem value="view review exercises" onSelect={() => run(() => onSetStatusView('review'))}>
              Review queue
            </CommandItem>
            <CommandItem value="view draft exercises" onSelect={() => run(() => onSetStatusView('draft'))}>
              Draft queue
            </CommandItem>
            <CommandItem value="view approved exercises" onSelect={() => run(() => onSetStatusView('approved'))}>
              Approved queue
            </CommandItem>
          </CommandGroup>
          {visibleItems.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Open exercise">
                {visibleItems.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.id} ${item.seedKey ?? ''} ${item.type} ${item.qualityStatus} ${item.prompt}`}
                    onSelect={() => run(() => onOpenExercise(item.id))}
                    data-checked={selectedId === item.id}
                  >
                    <span className="font-mono text-xs text-muted-foreground">#{item.id}</span>
                    <span className="truncate">{item.prompt}</span>
                    <CommandShortcut>{item.qualityStatus}</CommandShortcut>
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
