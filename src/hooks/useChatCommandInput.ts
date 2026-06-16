import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';

import type { ExerciseType } from '@/features/exercises/types';
import {
  getCommandAwarePasteValue,
  SLASH_COMMANDS,
  type SlashCommand,
} from '@/lib/chatCommands';

type UseChatCommandInputOptions = {
  isDemoMode: boolean;
  onResetProgress: () => void;
  onFetchExerciseByType: (type: ExerciseType) => void;
  onOpenBlitz: () => void;
  onOpenEge13Quick: () => void;
  onOpenEge15Quick: () => void;
  onShowStats: () => void;
};

export function useChatCommandInput({
  isDemoMode,
  onResetProgress,
  onFetchExerciseByType,
  onOpenBlitz,
  onOpenEge13Quick,
  onOpenEge15Quick,
  onShowStats,
}: UseChatCommandInputOptions) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMenuDismissed, setIsMenuDismissed] = useState(false);
  const [isMenuForcedOpen, setIsMenuForcedOpen] = useState(false);

  const currentCommands = useMemo(() => {
    if (!isDemoMode) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter((command) => command.command !== '/seed' && command.command !== '/qseed')
      .map((command) => {
        if (command.command === '/dictation') return { ...command, title: 'Мини-диктант' };
        if (command.command === '/ege13_quick') {
          return { ...command, title: 'Тренажёр заданий ЕГЭ' };
        }
        if (command.command === '/ege15_quick') return { ...command, title: 'Мини-упражнения' };
        return command;
      });
  }, [isDemoMode]);

  const query = value.startsWith('/') ? value.slice(1).toLowerCase() : null;
  const filteredCommands =
    query === null || isMenuForcedOpen
      ? []
      : currentCommands.filter((item) => {
          const command = item.command.slice(1);
          return command.startsWith(query) || item.title.toLowerCase().includes(query);
        });
  const visibleCommands = isMenuForcedOpen ? currentCommands : filteredCommands;
  const showCommands =
    !isMenuDismissed &&
    (isMenuForcedOpen || query !== null) &&
    visibleCommands.length > 0;
  const activeCommand = showCommands
    ? visibleCommands[Math.min(activeIndex, visibleCommands.length - 1)]
    : null;

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const closeCommandMenu = useCallback(() => {
    setIsMenuDismissed(false);
    setIsMenuForcedOpen(false);
  }, []);

  const dismissCommandMenu = useCallback(() => {
    setIsMenuDismissed(true);
    setIsMenuForcedOpen(false);
    setActiveIndex(0);
    setValue((current) => (current.trim() === '/' ? '' : current));
  }, []);

  const clearValue = useCallback(() => {
    setValue('');
  }, []);

  const runSlashCommand = useCallback(
    (command: SlashCommand) => {
      closeCommandMenu();

      if (isDemoMode) {
        clearValue();
        return;
      }

      if (command === '/seed' || command === '/qseed') {
        setValue(command === '/seed' ? '/seed ' : '/qseed ');
        focusInput();
        return;
      }

      clearValue();

      if (command === '/start') {
        onResetProgress();
        return;
      }

      if (
        command === '/dictation' ||
        command === '/punctuation_constructor' ||
        command === '/orthography_repair'
      ) {
        onFetchExerciseByType(command.replace('/', '') as ExerciseType);
        return;
      }

      if (command === '/blitz') {
        onOpenBlitz();
        return;
      }

      if (command === '/ege13_quick') {
        onOpenEge13Quick();
        return;
      }

      if (command === '/ege15_quick') {
        onOpenEge15Quick();
        return;
      }

      if (command === '/stats') {
        onShowStats();
      }
    },
    [
      clearValue,
      closeCommandMenu,
      focusInput,
      isDemoMode,
      onFetchExerciseByType,
      onOpenBlitz,
      onOpenEge13Quick,
      onOpenEge15Quick,
      onResetProgress,
      onShowStats,
    ],
  );

  const handleSlashButtonClick = useCallback(() => {
    setActiveIndex(0);
    if (showCommands) {
      dismissCommandMenu();
    } else {
      setIsMenuDismissed(false);
      setIsMenuForcedOpen(true);
      setValue((current) => (current.trim() ? current : '/'));
    }
    inputRef.current?.focus();
  }, [dismissCommandMenu, showCommands]);

  const handleInputChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setActiveIndex(0);
    setIsMenuDismissed(false);
    setIsMenuForcedOpen(false);
    setValue(event.target.value);
  }, []);

  const handleInputPaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const pastedText = event.clipboardData.getData('text').trim();
      const nextValue = getCommandAwarePasteValue(
        value,
        pastedText,
        event.currentTarget.selectionStart,
        event.currentTarget.selectionEnd,
      );
      if (!nextValue) return;

      event.preventDefault();
      setActiveIndex(0);
      closeCommandMenu();
      setValue(nextValue);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(nextValue.length, nextValue.length);
      });
    },
    [closeCommandMenu, value],
  );

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (showCommands && visibleCommands.length > 0) {
        if (event.key === 'Escape') {
          event.preventDefault();
          dismissCommandMenu();
          return;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setActiveIndex((current) => (current + 1) % visibleCommands.length);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setActiveIndex((current) => (current - 1 + visibleCommands.length) % visibleCommands.length);
          return;
        }
        if (event.key === 'Tab') {
          event.preventDefault();
          if (activeCommand) runSlashCommand(activeCommand.command);
          return;
        }
        if (event.key === 'Enter' && !event.shiftKey && activeCommand) {
          event.preventDefault();
          runSlashCommand(activeCommand.command);
          return;
        }
      }

      if (event.key === 'ArrowUp' && !value.trim()) {
        event.preventDefault();
        setActiveIndex(0);
        setValue('/');
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        event.currentTarget.form?.requestSubmit();
      }
    },
    [activeCommand, dismissCommandMenu, runSlashCommand, showCommands, value, visibleCommands],
  );

  useEffect(() => {
    if (!showCommands) return;

    const handlePointerDown = (event: PointerEvent) => {
      const shell = shellRef.current;
      const target = event.target;
      if (!shell || !(target instanceof Node) || shell.contains(target)) return;

      dismissCommandMenu();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [dismissCommandMenu, showCommands]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = '44px';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }, [value]);

  return {
    inputRef,
    shellRef,
    value,
    setValue,
    clearValue,
    activeIndex,
    setActiveIndex,
    visibleCommands,
    showCommands,
    activeCommand,
    closeCommandMenu,
    runSlashCommand,
    handleSlashButtonClick,
    handleInputChange,
    handleInputFocus: () => setIsMenuDismissed(false),
    handleInputPaste,
    handleInputKeyDown,
  };
}

export type ChatCommandInputController = ReturnType<typeof useChatCommandInput>;
