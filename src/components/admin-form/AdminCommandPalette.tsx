'use client';

import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
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
import { renderEditorMarkdown } from '@/components/admin-form/markdown/formatting';
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
      title="Admin command palette"
      description="Run admin actions and open exercises."
      className="max-w-xl"
    >
      <Command>
        <CommandInput placeholder="Search commands or exercises..." />
        {selectedItem ? (
          <div className="border-b border-stroke px-3 py-2 text-xs text-foreground/55">
            <span className="font-semibold text-foreground/75">Current:</span>{' '}
            <span className="font-mono text-xs font-semibold text-foreground">#{selectedItem.id}</span>
            <div className="text-pretty mt-0.5 [&_p]:inline">
              <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                {renderEditorMarkdown(selectedItem.prompt)}
              </ReactMarkdown>
            </div>
          </div>
        ) : null}
        <CommandList>
          <CommandEmpty>
            <div className="py-6 text-center">
              <div className="text-sm font-semibold text-foreground">Nothing matched</div>
              <p className="mt-1 text-xs text-foreground/55">
                Try an exercise id, seed key, status, or action name.
              </p>
            </div>
          </CommandEmpty>
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
                      <span className="text-pretty [&_p]:inline">
                        <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                          {renderEditorMarkdown(item.prompt)}
                        </ReactMarkdown>
                      </span>
                    </span>
                    <CommandShortcut>
                      {selectedId === item.id ? 'open' : item.qualityStatus}
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
