'use client';

import { AnimatePresence, motion } from 'motion/react';
import {
  AudioWaveform,
  BadgeCheck,
  BarChart3,
  Bean,
  BookOpenCheck,
  ListChecks,
  RotateCcw,
  Send,
  Wrench,
  Zap,
} from 'lucide-react';

import type { ChatCommandInputController } from '@/hooks/useChatCommandInput';
import type { SlashCommand } from '@/lib/chatCommands';

type ChatInputBarProps = {
  commandInput: ChatCommandInputController;
  supportsGlobalInput: boolean | null;
  hasHydrated: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

function getSlashCommandIcon(command: SlashCommand) {
  switch (command) {
    case '/dictation':
      return AudioWaveform;
    case '/punctuation_constructor':
      return ListChecks;
    case '/orthography_repair':
      return Wrench;
    case '/blitz':
      return Zap;
    case '/ege13_quick':
      return BookOpenCheck;
    case '/ege15_quick':
      return BadgeCheck;
    case '/seed':
    case '/qseed':
      return Bean;
    case '/stats':
      return BarChart3;
    case '/start':
      return RotateCcw;
  }
}

export default function ChatInputBar({
  commandInput,
  supportsGlobalInput,
  hasHydrated,
  onSubmit,
}: ChatInputBarProps) {
  return (
    <div className="shrink-0 border-t border-[var(--stroke)] bg-[var(--surface-strong)] p-3 sm:p-4">
      {!hasHydrated ? (
        <div className="flex h-11 w-full items-center rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-4" aria-hidden="true">
          <div className="h-4 w-64 max-w-full rounded bg-[var(--stroke)]" />
        </div>
      ) : (
        <div ref={commandInput.shellRef} className="relative">
          <AnimatePresence initial={false}>
            {commandInput.showCommands && (
              <motion.div
                id="slash-command-list"
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                role="listbox"
                aria-activedescendant={commandInput.activeCommand ? `slash-command-${commandInput.activeCommand.command.slice(1)}` : undefined}
                className="absolute bottom-[calc(100%+0.5rem)] left-0 z-popover w-full overflow-hidden rounded-2xl border border-[var(--stroke)] bg-[var(--surface-strong)] shadow-xl"
              >
                {commandInput.visibleCommands.map((item, index) => {
                  const Icon = getSlashCommandIcon(item.command);
                  const isActive = index === commandInput.activeIndex;
                  return (
                    <button
                      id={`slash-command-${item.command.slice(1)}`}
                      key={item.command}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => commandInput.setActiveIndex(index)}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        commandInput.runSlashCommand(item.command);
                      }}
                      className={`flex w-full items-center gap-3 border-b border-[var(--stroke)] px-3 py-2.5 text-left transition-colors duration-150 ease-out last:border-b-0 focus:outline-none focus-visible:bg-[var(--surface)] ${
                        isActive ? 'bg-[var(--surface)]' : 'hover:bg-[var(--surface)]'
                      }`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-foreground">
                          <span className="font-mono">{item.command}</span>
                          <span className="ml-2 text-foreground/55">{item.title}</span>
                        </span>
                        <span className="block truncate text-pretty text-xs font-medium text-foreground/55">
                          {item.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={onSubmit} className="flex items-end gap-2">
            <button
              type="button"
              onClick={commandInput.handleSlashButtonClick}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--stroke)] bg-[var(--surface)] text-foreground/50 transition-[background-color,border-color,color,transform] duration-150 ease-out hover:bg-[var(--stroke)] hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96]"
              aria-label="Open command menu"
              aria-expanded={commandInput.showCommands}
              aria-controls="slash-command-list"
              title="Меню команд"
            >
              <span className="font-mono text-xl font-bold leading-none opacity-80">/</span>
            </button>
            <textarea
              ref={commandInput.inputRef}
              name="chat-message"
              rows={1}
              value={commandInput.value}
              onChange={commandInput.handleInputChange}
              onFocus={commandInput.handleInputFocus}
              onPaste={commandInput.handleInputPaste}
              onKeyDown={commandInput.handleInputKeyDown}
              placeholder={supportsGlobalInput ? 'Ваш ответ...' : 'Написать сообщение...'}
              className="max-h-40 min-h-11 w-full resize-none overflow-y-auto rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-pretty text-sm leading-5 text-foreground outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-foreground/45 focus:border-primary focus:ring-1 focus:ring-primary"
              aria-label={supportsGlobalInput ? 'Exercise answer' : 'Message or command'}
              autoFocus
            />
            <button
              type="submit"
              disabled={!commandInput.value.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-[background-color,opacity,transform] duration-150 ease-out hover:bg-primary-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] disabled:opacity-50 disabled:active:scale-100"
              aria-label="Send"
              title="Отправить"
            >
              <Send className="h-5 w-5 translate-x-0.5 rotate-45" aria-hidden="true" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
