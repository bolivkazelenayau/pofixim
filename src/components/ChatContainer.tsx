'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ClipboardEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AudioWaveform,
  BadgeCheck,
  BarChart3,
  Bean,
  BookOpenCheck,
  ListChecks,
  RotateCcw,
  Wrench,
  Zap,
} from 'lucide-react';
import type { ExerciseType } from '@/features/exercises/types';
import {
  getExerciseBySeedKeyAction,
  getExerciseVersionsByIdsAction,
  getExercisesByIdsAction,
  getQuickCardsBySeedAction,
  getNextExerciseAction,
  submitExerciseAnswerAction,
} from '@/app/actions/exercises';
import ExerciseRenderer from '@/features/exercises/renderers/ExerciseRenderer';
import type { Exercise, SubmittedAnswer } from '@/features/exercises/schemas';
import { checkExerciseAnswer } from '@/features/exercises/checkers';
import { buildDictationFeedbackText } from '@/features/exercises/dictationFeedback';
import { useChatStore, type Message } from '@/store/chatStore';
import { useBlitzGame } from '@/hooks/useBlitzGame';
import { useEge13QuickGame } from '@/hooks/useEge13QuickGame';
import { useEge15QuickGame } from '@/hooks/useEge15QuickGame';
import { createMessageId } from '@/lib/message-id';
import { subscribeToExerciseUpdates } from '@/lib/exercise-update-events';
import BlitzGame from './BlitzGame';
import Ege13QuickGame from './Ege13QuickGame';
import Ege15QuickGame from './Ege15QuickGame';
import MessageBubble, { MESSAGE_ENTER_DURATION_MS } from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import type { Ege9BlitzCard } from '@/features/exercises/ege9Blitz';
import type { Ege13QuickCard } from '@/features/exercises/ege13Quick';
import type { Ege15QuickCard } from '@/features/exercises/ege15Quick';

const TAIL_HANDOFF_RATIO = 0.25;
const TAIL_HANDOFF_MS = Math.round(MESSAGE_ENTER_DURATION_MS * TAIL_HANDOFF_RATIO);
const RENDERED_EXERCISE_REFRESH_POLL_MS = 5000;

type ExerciseMessage = Message & {
  type: 'exercise';
  exercise: Exercise & { id: number };
};

type TailHandoffAuthor = 'bot' | 'user';

type TailHandoff = {
  previousId: string;
  currentId: string;
  timer: ReturnType<typeof setTimeout>;
};

const SLASH_COMMANDS = [
  {
    command: '/dictation',
    title: 'Диктант',
    description: 'Войс с проверкой расшифровки',
  },
  {
    command: '/punctuation_constructor',
    title: 'Конструктор пунктуации',
    description: 'Случайное задание из пула',
  },
  {
    command: '/orthography_repair',
    title: 'Ремонт орфографии',
    description: 'Случайное задание из пула',
  },
  {
    command: '/blitz',
    title: 'Блиц',
    description: 'Открыть быстрый тестовый режим',
  },
  {
    command: '/ege13_quick',
    title: 'Тип 13',
    description: 'Слитно или раздельно',
  },
  {
    command: '/ege15_quick',
    title: 'Тип 15',
    description: 'Одна Н или НН',
  },
  {
    command: '/seed',
    title: 'Seed key',
    description: 'Открыть конкретное задание',
  },
  {
    command: '/qseed',
    title: 'Quick seed',
    description: 'Открыть quick-карточку',
  },
  {
    command: '/stats',
    title: 'Рейтинг',
    description: 'Посмотреть таблицу лидеров',
  },
  {
    command: '/start',
    title: 'Сброс',
    description: 'Начать тренировку заново',
  },
] as const;

type SlashCommand = (typeof SLASH_COMMANDS)[number]['command'];

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

function isExerciseMessage(message: Message): message is ExerciseMessage {
  return (
    message.type === 'exercise' &&
    Boolean(message.exercise) &&
    typeof message.exercise?.id === 'number'
  );
}

function isGroupedMessagePair(previous: Message | undefined, current: Message | undefined) {
  if (!previous || !current || previous.isBot !== current.isBot) return false;

  const timeDiff =
    current.createdAt && previous.createdAt
      ? current.createdAt - previous.createdAt
      : 0;

  return timeDiff < 5 * 60 * 1000;
}

function getTailHandoffAuthor(message: Message): TailHandoffAuthor {
  return message.isBot ? 'bot' : 'user';
}

function isWelcomeMessage(message: Message | undefined) {
  return (
    message?.type === 'text' &&
    (message.id === 'welcome' || message.id.endsWith('-welcome'))
  );
}

function correctAnswerFeedbackPrefix() {
  return 'Верно. ';
}

function isFullTextFillBlankExercise(exercise: Exercise) {
  return (
    exercise.type === 'fill_blank' &&
    (
      exercise.skillTags.includes('ege.18') ||
      exercise.seedKey?.startsWith('ege18-bank-')
    )
  );
}

function buildFeedbackText(
  result: ReturnType<typeof checkExerciseAnswer> | undefined,
  exerciseType?: Exercise['type'],
) {
  if (!result) return '';
  if (exerciseType === 'dictation') {
    return result.isCorrect
      ? 'Верно.'
      : buildDictationFeedbackText(result.normalizedAnswer, result.feedback.explanation);
  }
  const prefix = result.isCorrect ? correctAnswerFeedbackPrefix() : '';
  const prefixText = prefix ? `${prefix}\n\n` : '';

  if (result.feedback.correctAnswer && result.feedback.detailedExplanation) {
    const correctAnswerLabel = '\u041f\u0440\u0430\u0432\u0438\u043b\u044c\u043d\u044b\u0439 \u043e\u0442\u0432\u0435\u0442';
    const explanationLabel = '\u041e\u0431\u044a\u044f\u0441\u043d\u0435\u043d\u0438\u0435';
    return `${prefixText}${correctAnswerLabel}:\n${result.feedback.correctAnswer}\n\n${explanationLabel}:\n${result.feedback.detailedExplanation}`;
  }

  return `${prefixText}${result.feedback.explanation}`;
}

function submittedAnswerFromText(exercise: Exercise, text: string): SubmittedAnswer | null {
  const value = text.trim();
  if (!value) return null;

  if (exercise.type === 'fill_blank') {
    return { type: 'fill_blank', value };
  }

  if (exercise.type === 'dictation') {
    return { type: 'dictation', text: value };
  }

  if (exercise.type === 'ege21_punctuation_analysis') {
    const numericValue = value.replace(/[^0-9]/g, '');
    return numericValue ? { type: 'ege21_punctuation_analysis', value: numericValue } : null;
  }

  if (exercise.type === 'ege20_complex_sentence_punctuation') {
    const numericValue = value.replace(/[^0-9]/g, '');
    return numericValue ? { type: 'ege20_complex_sentence_punctuation', value: numericValue } : null;
  }

  return null;
}

type QuickSeedMode = 'blitz' | 'ege13' | 'ege15';

function parsePositiveInt(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeQuickSeedText(text: string) {
  return text.trim().replace(/^(?:\/?qseed)(?:\/qseed)*(?=\s|$)/iu, (prefix) => {
    const count = prefix.match(/qseed/giu)?.length ?? 0;
    return Array.from({ length: count }, () => '/qseed').join(' ');
  });
}

function normalizeSeedCommandText(text: string) {
  return text.trim().replace(/^\/?(seed|exercise)(?:\/\1)*(?=\s|$)/iu, (prefix) => {
    const command = prefix.match(/exercise/iu) ? '/exercise' : '/seed';
    const count = prefix.match(/seed|exercise/giu)?.length ?? 0;
    return Array.from({ length: count }, () => command).join(' ');
  });
}

function parseQuickSeedCommand(text: string) {
  const parts = normalizeQuickSeedText(text).split(/\s+/u).filter(Boolean);
  while (/^\/?qseed$/iu.test(parts[0] ?? '')) {
    parts.shift();
  }
  if (parts.length < 2) return null;

  const modeAlias = parts[0].toLowerCase();
  const mode: QuickSeedMode | null =
    modeAlias === 'blitz' || modeAlias === 'ege9'
      ? 'blitz'
      : modeAlias === 'ege13' || modeAlias === '13'
        ? 'ege13'
        : modeAlias === 'ege15' || modeAlias === '15'
          ? 'ege15'
          : null;
  if (!mode) return null;

  const seedKey = parts[1];
  const options = new Map<string, string>();
  for (const part of parts.slice(2)) {
    const [rawKey, ...rawValue] = part.split('=');
    const key = rawKey?.toLowerCase();
    const value = rawValue.join('=');
    if (key && value) options.set(key, value);
  }

  const positionalSelector = parts[2]?.includes('=') ? undefined : parts[2];

  return {
    mode,
    seedKey,
    rowIndex: parsePositiveInt(
      options.get('row') ?? options.get('r') ?? (mode === 'ege13' ? positionalSelector : undefined),
    ),
    positionIndex: parsePositiveInt(
      options.get('pos') ?? options.get('position') ?? (mode === 'ege15' ? positionalSelector : undefined),
    ),
    wordIndex: parsePositiveInt(options.get('word') ?? options.get('w')),
    cardId: options.get('card') ?? options.get('id'),
  };
}

function looksLikeQuickSeedCommand(text: string) {
  return /^\/?qseed(?:\s|\/|$)/iu.test(text.trim());
}

function quickSeedUsageText() {
  return 'Команда qseed неполная. Формат: `/qseed blitz <seed> row=1 word=1`, `/qseed ege13 <seed> row=1`, `/qseed ege15 <seed> pos=1`.';
}

function normalizeNestedSeedCommand(text: string) {
  const value = normalizeQuickSeedText(normalizeSeedKeyInput(text));

  if (/^\/?qseed\s+/iu.test(value)) {
    return value.startsWith('/') ? value : `/${value}`;
  }

  if (/^(?:blitz|ege9|ege13|13|ege15|15)\s+\S+/iu.test(value)) {
    return `/qseed ${value}`;
  }

  return null;
}

function normalizeSeedKeyInput(text: string) {
  const parts = normalizeSeedCommandText(text).split(/\s+/u).filter(Boolean);
  while (/^\/?(?:seed|exercise)$/iu.test(parts[0] ?? '')) {
    parts.shift();
  }
  return parts.join(' ');
}

function looksLikeBareSeedKey(text: string) {
  const value = text.trim();
  if (!value || value.startsWith('/') || /\s/u.test(value)) return false;
  if (/^(?:seed|exercise|qseed)$/iu.test(value)) return false;

  return /^(?=.*\d)[a-z0-9]+(?:-[a-z0-9]+)+$/iu.test(value);
}

function getVisiblePastedCommandText(text: string) {
  const value = text.trim();
  const quickSeed = parseQuickSeedCommand(value);
  if (quickSeed && looksLikeQuickSeedCommand(value)) {
    return normalizeQuickSeedText(value)
      .split(/\s+/u)
      .filter((part) => !/^\/?qseed$/iu.test(part))
      .join(' ');
  }

  if (/^\/?(?:seed|exercise)\s+/iu.test(value)) {
    const seedKey = normalizeSeedKeyInput(value);
    return looksLikeBareSeedKey(seedKey) ? seedKey : null;
  }

  return null;
}

function getCommandAwarePasteValue(
  currentValue: string,
  pastedText: string,
  selectionStart: number,
  selectionEnd: number,
) {
  const visibleCommandText = getVisiblePastedCommandText(pastedText);
  const normalizedPastedText = visibleCommandText
    ?? (looksLikeBareSeedKey(pastedText) ? pastedText.trim() : null);
  if (!normalizedPastedText) return null;

  const prefixMatch = currentValue.match(/^(\s*\/(?:seed|exercise|qseed)\s*)/iu);
  const commandPrefix = prefixMatch?.[1];
  if (commandPrefix && selectionStart >= commandPrefix.length) {
    const before = currentValue.slice(0, selectionStart);
    const after = currentValue.slice(selectionEnd);
    const separator = /\s$/u.test(before) ? '' : ' ';
    return `${before}${separator}${normalizedPastedText}${after}`;
  }

  if (currentValue.trim().length > 0) return null;

  return normalizedPastedText;
}

export default function ChatContainer() {
  const {
    messages,
    isTyping,
    addMessage,
    markExercisePresented,
    updateExerciseMessages,
    updateFeedbackMessages,
    setTyping,
    setSessionId,
    recordExerciseResult,
    score,
    streak,
    seenExerciseIds,
    cooldownExerciseIds,
    sessionId,
    hasRequestedInitialExercise,
    markInitialExerciseRequested,
    resetProgress,
    isDemoMode,
    setDemoMode,
  } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const isFetchingExercise = useRef(false);
  const isPollingExerciseVersionsRef = useRef(false);
  const exerciseVersionByIdRef = useRef<Map<number, string>>(new Map());
  const previousMessagesRef = useRef<Message[]>([]);
  const hasInitializedTailTrackingRef = useRef(false);
  const tailHandoffsRef = useRef(new Map<TailHandoffAuthor, TailHandoff>());
  const initialExerciseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exerciseHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [hasHydrated, setHasHydrated] = useState(false);
  const [globalInputValue, setGlobalInputValue] = useState('');
  const [activeSlashCommandIndex, setActiveSlashCommandIndex] = useState(0);
  const [isSlashCommandMenuDismissed, setIsSlashCommandMenuDismissed] = useState(false);
  const [isSlashCommandMenuForcedOpen, setIsSlashCommandMenuForcedOpen] = useState(false);
  const [highlightedExerciseMessageId, setHighlightedExerciseMessageId] = useState<string | null>(null);
  const [tailHoldMessageIds, setTailHoldMessageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [tailSuppressMessageIds, setTailSuppressMessageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const globalInputRef = useRef<HTMLTextAreaElement>(null);
  const globalInputShellRef = useRef<HTMLDivElement>(null);
  const blitz = useBlitzGame();
  const ege13Quick = useEge13QuickGame();
  const ege15Quick = useEge15QuickGame();

  const clearTailHandoffTimers = useCallback(() => {
    tailHandoffsRef.current.forEach(({ timer }) => clearTimeout(timer));
    tailHandoffsRef.current.clear();
  }, []);

  const clearTailHandoffState = useCallback(() => {
    clearTailHandoffTimers();
    setTailHoldMessageIds((current) => (current.size > 0 ? new Set() : current));
    setTailSuppressMessageIds((current) => (current.size > 0 ? new Set() : current));
  }, [clearTailHandoffTimers]);

  const clearInitialExerciseTimer = useCallback(() => {
    if (!initialExerciseTimerRef.current) return;
    clearTimeout(initialExerciseTimerRef.current);
    initialExerciseTimerRef.current = null;
  }, []);

  const highlightLatestExerciseIfSameSeed = useCallback((rawSeedKey: string) => {
    const seedKey = normalizeSeedKeyInput(rawSeedKey);
    const latestExerciseMessage = [...messages].reverse().find(isExerciseMessage);

    if (!latestExerciseMessage || latestExerciseMessage.exercise.seedKey !== seedKey) {
      return false;
    }

    if (exerciseHighlightTimerRef.current) {
      clearTimeout(exerciseHighlightTimerRef.current);
      exerciseHighlightTimerRef.current = null;
    }

    setHighlightedExerciseMessageId(null);
    requestAnimationFrame(() => {
      setHighlightedExerciseMessageId(latestExerciseMessage.id);
      const element = document.querySelector<HTMLElement>(
        `[data-exercise-message-id="${latestExerciseMessage.id}"]`,
      );
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    exerciseHighlightTimerRef.current = setTimeout(() => {
      setHighlightedExerciseMessageId((current) =>
        current === latestExerciseMessage.id ? null : current,
      );
      exerciseHighlightTimerRef.current = null;
    }, 900);

    return true;
  }, [messages]);

  useEffect(() => {
    let isMounted = true;
    const markHydrated = () => {
      if (isMounted) {
        setHasHydrated(true);
      }
    };

    const unsubscribe = useChatStore.persist.onFinishHydration(markHydrated);

    if (useChatStore.persist.hasHydrated()) {
      markHydrated();
    } else {
      const hydration = useChatStore.persist.rehydrate();
      if (hydration instanceof Promise) {
        void hydration.finally(markHydrated);
      } else {
        markHydrated();
      }
    }

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useLayoutEffect(() => {
    if (!hasHydrated) {
      previousMessagesRef.current = messages;
      hasInitializedTailTrackingRef.current = false;
      return;
    }

    if (!hasInitializedTailTrackingRef.current) {
      previousMessagesRef.current = messages;
      hasInitializedTailTrackingRef.current = true;
      clearTailHandoffState();
      return;
    }

    const previousMessages = previousMessagesRef.current;

    if (messages.length < previousMessages.length) {
      clearTailHandoffState();
    } else if (messages.length > previousMessages.length) {
      const handoffs = new Map<
        TailHandoffAuthor,
        { previousId: string; currentId: string }
      >();

      for (let index = Math.max(1, previousMessages.length); index < messages.length; index += 1) {
        const previousMessage = messages[index - 1];
        const currentMessage = messages[index];

        if (isGroupedMessagePair(previousMessage, currentMessage)) {
          handoffs.set(getTailHandoffAuthor(currentMessage), {
            previousId: previousMessage.id,
            currentId: currentMessage.id,
          });
        }
      }

      if (handoffs.size > 0) {
        handoffs.forEach((_, author) => {
          const existingHandoff = tailHandoffsRef.current.get(author);
          if (existingHandoff) clearTimeout(existingHandoff.timer);
        });

        setTailHoldMessageIds((current) => {
          const next = new Set(current);
          handoffs.forEach(({ previousId }, author) => {
            const existingHandoff = tailHandoffsRef.current.get(author);
            if (existingHandoff) next.delete(existingHandoff.previousId);
            next.add(previousId);
          });
          return next;
        });
        setTailSuppressMessageIds((current) => {
          const next = new Set(current);
          handoffs.forEach(({ currentId }, author) => {
            const existingHandoff = tailHandoffsRef.current.get(author);
            if (existingHandoff) next.delete(existingHandoff.currentId);
            next.add(currentId);
          });
          return next;
        });

        handoffs.forEach(({ previousId, currentId }, author) => {
          const timer = setTimeout(() => {
            const activeHandoff = tailHandoffsRef.current.get(author);
            if (
              activeHandoff?.previousId !== previousId ||
              activeHandoff.currentId !== currentId
            ) {
              return;
            }

            tailHandoffsRef.current.delete(author);
            setTailHoldMessageIds((current) => {
              if (!current.has(previousId)) return current;
              const next = new Set(current);
              next.delete(previousId);
              return next;
            });
            setTailSuppressMessageIds((current) => {
              if (!current.has(currentId)) return current;
              const next = new Set(current);
              next.delete(currentId);
              return next;
            });
          }, TAIL_HANDOFF_MS);

          tailHandoffsRef.current.set(author, { previousId, currentId, timer });
        });
      }
    }

    previousMessagesRef.current = messages;
  }, [clearTailHandoffState, hasHydrated, messages]);

  useEffect(() => {
    return () => {
      clearTailHandoffTimers();
      clearInitialExerciseTimer();
      if (exerciseHighlightTimerRef.current) {
        clearTimeout(exerciseHighlightTimerRef.current);
      }
    };
  }, [clearInitialExerciseTimer, clearTailHandoffTimers]);

  const lastMessage = messages[messages.length - 1];
  const answeredExerciseMessageIds = useMemo(() => {
    const ids = new Set<string>();
    for (const message of messages) {
      if (message.feedbackForExerciseMessageId) {
        ids.add(message.feedbackForExerciseMessageId);
      }
    }
    return ids;
  }, [messages]);
  const activeExerciseMessage = 
    lastMessage && isExerciseMessage(lastMessage) && !answeredExerciseMessageIds.has(lastMessage.id)
      ? lastMessage
      : null;
  const currentSlashCommands = useMemo(() => {
    if (!isDemoMode) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter((c) => c.command !== '/seed' && c.command !== '/qseed').map((c) => {
      if (c.command === '/dictation') return { ...c, title: 'Мини-диктант' };
      if (c.command === '/ege13_quick') return { ...c, title: 'Тренажёр заданий ЕГЭ' };
      if (c.command === '/ege15_quick') return { ...c, title: 'Мини-упражнения' };
      return c;
    });
  }, [isDemoMode]);

  const slashCommandQuery = globalInputValue.startsWith('/')
    ? globalInputValue.slice(1).toLowerCase()
    : null;
  const visibleSlashCommands = slashCommandQuery === null || isSlashCommandMenuForcedOpen
    ? []
    : currentSlashCommands.filter((item) => {
        const command = item.command.slice(1);
        return (
          command.startsWith(slashCommandQuery) ||
          item.title.toLowerCase().includes(slashCommandQuery)
        );
      });
  const visibleForcedSlashCommands = isSlashCommandMenuForcedOpen ? currentSlashCommands : visibleSlashCommands;
  const showSlashCommands =
    !isSlashCommandMenuDismissed &&
    (isSlashCommandMenuForcedOpen || slashCommandQuery !== null) &&
    visibleForcedSlashCommands.length > 0;
  const activeSlashCommand =
    showSlashCommands
      ? visibleForcedSlashCommands[Math.min(activeSlashCommandIndex, visibleForcedSlashCommands.length - 1)]
      : null;

  useEffect(() => {
    if (!showSlashCommands) return;

    const handlePointerDown = (event: PointerEvent) => {
      const shell = globalInputShellRef.current;
      const target = event.target;
      if (!shell || !(target instanceof Node) || shell.contains(target)) return;

      setIsSlashCommandMenuDismissed(true);
      setIsSlashCommandMenuForcedOpen(false);
      setActiveSlashCommandIndex(0);
      setGlobalInputValue((current) => (current.trim() === '/' ? '' : current));
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [showSlashCommands]);

  const supportsGlobalInput =
    activeExerciseMessage &&
    !isFullTextFillBlankExercise(activeExerciseMessage.exercise) &&
    [
      'ege21_punctuation_analysis',
      'ege20_complex_sentence_punctuation',
      'fill_blank',
      'dictation',
    ].includes(activeExerciseMessage.exercise.type);

  const handleResetProgress = () => {
    if (!hasHydrated || isDemoMode) return;

    initialized.current = false;
    setTyping(false);
    clearInitialExerciseTimer();
    clearTailHandoffState();
    previousMessagesRef.current = [];
    blitz.close();
    ege13Quick.close();
    ege15Quick.close();
    resetProgress();
  };

  useEffect(() => {
    const input = globalInputRef.current;
    if (!input) return;
    input.style.height = '44px';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }, [globalInputValue]);

  const fetchNextExercise = useCallback(
    async (currentSeenIds: number[], forceType?: ExerciseType) => {
      if (isFetchingExercise.current) return;

      isFetchingExercise.current = true;
      let res: Awaited<ReturnType<typeof getNextExerciseAction>>;
      try {
        const blockedIds = [...new Set([...cooldownExerciseIds, ...currentSeenIds])];
        let dynamicBlocked = [...blockedIds];
        let attempt = 0;
        do {
          res = await getNextExerciseAction({
            sessionId,
            seenExerciseIds: dynamicBlocked,
            forceType,
          });
          const returnedId = res.success && 'exercise' in res ? res.exercise?.id : undefined;
          const isBlocked = typeof returnedId === 'number' && dynamicBlocked.includes(returnedId);
          if (!isBlocked) break;
          dynamicBlocked = [...new Set([...dynamicBlocked, returnedId])];
          attempt += 1;
        } while (attempt < 4);
      } finally {
        isFetchingExercise.current = false;
      }

      if (!res.success || !('sessionId' in res)) {
        addMessage({
          id: createMessageId('error'),
          isBot: true,
          content:
            'Не удалось загрузить следующее упражнение. Проверьте базу данных и миграции.',
          type: 'text',
        });
        return;
      }

      if (res.sessionId) {
        setSessionId(res.sessionId);
      }

      if ('exercise' in res && res.exercise?.id) {
        markExercisePresented(res.exercise.id);
        addMessage({
          id: createMessageId('exercise'),
          isBot: true,
          content: res.exercise.prompt,
          type: 'exercise',
          exercise: res.exercise,
        });
        return;
      }

      if ('noMoreExercises' in res && res.noMoreExercises) {
        addMessage({
          id: createMessageId('end'),
          isBot: true,
          content:
            'Доступные упражнения закончились. Добавьте новые в админке или сбросьте прогресс.',
          type: 'text',
        });
      }
    },
    [addMessage, cooldownExerciseIds, markExercisePresented, sessionId, setSessionId],
  );

  const fetchExerciseBySeedKey = useCallback(
    async (rawSeedKey: string) => {
      const seedKey = normalizeSeedKeyInput(rawSeedKey);
      if (highlightLatestExerciseIfSameSeed(seedKey)) return;
      if (isFetchingExercise.current) return;

      isFetchingExercise.current = true;
      setTyping(true);
      let res: Awaited<ReturnType<typeof getExerciseBySeedKeyAction>>;
      try {
        res = await getExerciseBySeedKeyAction({ sessionId, seedKey });
      } finally {
        isFetchingExercise.current = false;
        setTyping(false);
      }

      if (!res.success || !('exercise' in res) || !res.exercise?.id) {
        addMessage({
          id: createMessageId('seed-error'),
          isBot: true,
          content: `Не нашёл задание с seed key: \`${seedKey}\`. Проверьте написание или статус записи в админке.`,
          type: 'text',
        });
        return;
      }

      if (res.sessionId) {
        setSessionId(res.sessionId);
      }

      markExercisePresented(res.exercise.id);
      addMessage({
        id: createMessageId('exercise'),
        isBot: true,
        content: res.exercise.prompt,
        type: 'exercise',
        exercise: res.exercise,
        allowDuplicateExerciseInstance: true,
      });
    },
    [
      addMessage,
      highlightLatestExerciseIfSameSeed,
      markExercisePresented,
      sessionId,
      setSessionId,
      setTyping,
    ],
  );

  const fetchQuickCardsBySeed = useCallback(
    async (quickSeed: NonNullable<ReturnType<typeof parseQuickSeedCommand>>) => {
      if (isFetchingExercise.current) return;

      isFetchingExercise.current = true;
      setTyping(true);
      let res: Awaited<ReturnType<typeof getQuickCardsBySeedAction>>;
      try {
        res = await getQuickCardsBySeedAction(quickSeed);
      } finally {
        isFetchingExercise.current = false;
        setTyping(false);
      }

      if (!res.success || !res.cards?.length) {
        addMessage({
          id: createMessageId('qseed-error'),
          isBot: true,
          content:
            `Не нашёл quick-карточку для команды. Проверь seed и селектор: ` +
            '`/qseed ege13 <seed> row=5`, `/qseed ege15 <seed> pos=1`, `/qseed blitz <seed> row=2 word=1`.',
          type: 'text',
        });
        return;
      }

      if (quickSeed.mode === 'ege13') {
        ege13Quick.openWithCards(res.cards as Ege13QuickCard[], { mode: 'inspect' });
        return;
      }

      if (quickSeed.mode === 'ege15') {
        ege15Quick.openWithCards(res.cards as Ege15QuickCard[], { mode: 'inspect' });
        return;
      }

      blitz.openWithCards(res.cards as Ege9BlitzCard[], { mode: 'inspect' });
    },
    [addMessage, blitz, ege13Quick, ege15Quick, setTyping],
  );

  const refreshRenderedExercises = useCallback(async (targetExerciseIds?: number[]) => {
    const targetExerciseIdSet = targetExerciseIds?.length ? new Set(targetExerciseIds) : null;
    const exerciseIds = messages
      .filter(isExerciseMessage)
      .map((message) => message.exercise.id)
      .filter((exerciseId) => !targetExerciseIdSet || targetExerciseIdSet.has(exerciseId));
    if (exerciseIds.length === 0) return;

    const res = await getExercisesByIdsAction({ exerciseIds });
    if (!res.success) return;

    const freshExercises = (res.exercises ?? []).filter(
      (exercise): exercise is Exercise & { id: number } =>
        typeof exercise.id === 'number',
    );
    updateExerciseMessages(freshExercises);

    const freshById = new Map(freshExercises.map((exercise) => [exercise.id, exercise]));
    const feedbacks: Array<{ messageId?: string; exerciseId?: number; content: string }> = [];
    let currentExercise: (Exercise & { id: number }) | null = null;
    let latestSubmittedAnswer:
      | { exercise: Exercise & { id: number }; submittedAnswer: SubmittedAnswer }
      | null = null;

    for (const message of messages) {
      if (isExerciseMessage(message)) {
        currentExercise = freshById.get(message.exercise.id) ?? message.exercise;
        latestSubmittedAnswer = null;
        continue;
      }

      if (!message.isBot && message.type === 'text' && currentExercise) {
        const submittedAnswer = submittedAnswerFromText(currentExercise, message.content);
        latestSubmittedAnswer = submittedAnswer
          ? { exercise: currentExercise, submittedAnswer }
          : null;
        continue;
      }

      if (message.isBot && message.type === 'text') {
        const explicitExercise = message.feedbackForExerciseId
          ? freshById.get(message.feedbackForExerciseId)
          : undefined;
        const explicitAnswer = message.submittedAnswer;
        const inferred = latestSubmittedAnswer;
        const exercise = explicitExercise ?? inferred?.exercise;
        const submittedAnswer = explicitAnswer ?? inferred?.submittedAnswer;

        if (exercise && submittedAnswer) {
          try {
            const result = checkExerciseAnswer(exercise, submittedAnswer, { streak: 0 });
            feedbacks.push({
              messageId: message.id,
              exerciseId: exercise.id,
              content: buildFeedbackText(result, exercise.type),
            });
          } catch {
            // Older or malformed local messages should not break live exercise refresh.
          }
        }

        latestSubmittedAnswer = null;
      }
    }
    updateFeedbackMessages(feedbacks);
  }, [messages, updateExerciseMessages, updateFeedbackMessages]);

  const pollRenderedExerciseVersions = useCallback(async () => {
    if (isPollingExerciseVersionsRef.current) return;

    const exerciseIds = [
      ...new Set(messages.filter(isExerciseMessage).map((message) => message.exercise.id)),
    ];
    if (exerciseIds.length === 0) return;

    isPollingExerciseVersionsRef.current = true;
    try {
      const res = await getExerciseVersionsByIdsAction({ exerciseIds });
      if (!res.success) return;

      const changedExerciseIds: number[] = [];
      const nextVersions = new Map(exerciseVersionByIdRef.current);

      for (const version of res.versions ?? []) {
        const previousVersion = exerciseVersionByIdRef.current.get(version.id);
        nextVersions.set(version.id, version.updatedAt);

        if (previousVersion && previousVersion !== version.updatedAt) {
          changedExerciseIds.push(version.id);
        }
      }

      exerciseVersionByIdRef.current = nextVersions;

      if (changedExerciseIds.length > 0) {
        void refreshRenderedExercises(changedExerciseIds);
      }
    } finally {
      isPollingExerciseVersionsRef.current = false;
    }
  }, [messages, refreshRenderedExercises]);

  useEffect(() => {
    if (!hasHydrated) return;

    void refreshRenderedExercises();
    void pollRenderedExerciseVersions();

    const unsubscribeFromExerciseUpdates = subscribeToExerciseUpdates((exerciseId) => {
      void refreshRenderedExercises([exerciseId]);
    });
    const pollTimer = window.setInterval(
      () => void pollRenderedExerciseVersions(),
      RENDERED_EXERCISE_REFRESH_POLL_MS,
    );

    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') {
        void refreshRenderedExercises();
        void pollRenderedExerciseVersions();
      }
    }

    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      unsubscribeFromExerciseUpdates();
      window.clearInterval(pollTimer);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [hasHydrated, pollRenderedExerciseVersions, refreshRenderedExercises]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [hasHydrated, messages, isTyping]);

  const handleExerciseSubmit = async (
    exercise: ExerciseMessage['exercise'],
    submittedAnswer: SubmittedAnswer,
    answerLabel: string,
    exerciseMessageId?: string,
  ) => {
    if (!sessionId) {
      addMessage({
        id: createMessageId('session-missing'),
        isBot: true,
        content: 'Сессия ещё инициализируется. Попробуйте через секунду.',
        type: 'text',
      });
      return;
    }

    addMessage({
      id: createMessageId('answer'),
      isBot: false,
      content: answerLabel,
      type: 'text',
    });

    setTyping(true);

    const res = await submitExerciseAnswerAction({
      sessionId,
      exerciseId: exercise.id,
      submittedAnswer,
      returnNextExercise: true,
      seenExerciseIds: [...new Set([...cooldownExerciseIds, ...seenExerciseIds, exercise.id])],
    });

    setTyping(false);

    if (!res.success || !res.result) {
      addMessage({
        id: createMessageId('submit-error'),
        isBot: true,
        content:
          'Ответ не удалось проверить. Скорее всего, задание есть в UI, но не найдено в таблице exercises.',
        type: 'text',
      });
      return;
    }

    recordExerciseResult({
      exerciseId: exercise.id,
      isCorrect: res.result.isCorrect,
      scoreDelta: res.result.scoreDelta,
      streak: res.session?.currentStreak ?? 0,
    });

    addMessage({
      id: createMessageId('feedback'),
      isBot: true,
      content: buildFeedbackText(res.result, exercise.type),
      type: 'text',
      feedbackForExerciseId: exercise.id,
      feedbackForExerciseMessageId: exerciseMessageId,
      submittedAnswer,
    });

    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      if ('nextExercise' in res && res.nextExercise?.id) {
        markExercisePresented(res.nextExercise.id);
        addMessage({
          id: createMessageId('exercise'),
          isBot: true,
          content: res.nextExercise.prompt,
          type: 'exercise',
          exercise: res.nextExercise,
        });
        return;
      }
      if ('noMoreExercises' in res && res.noMoreExercises) {
        addMessage({
          id: createMessageId('end'),
          isBot: true,
          content:
            'Доступные упражнения закончились. Добавьте новые в админке или сбросьте прогресс.',
          type: 'text',
        });
        return;
      }
      fetchNextExercise([...seenExerciseIds, exercise.id]);
    }, 800);
  };

  function showStats() {
    const FAKE_NAMES = [
      'Алиса М.', '23 года, дизайнер из Петербурга', 'подписаться', 'nasralbek.', '67|8|9',
      'Егор.', 'Жанна Р.', 'Захар В.', 'Ирина Т.', 'скебоб',
      'смешные картинки на сименс', 'Максим Д.', 'пакет naik.', 'Олег Ассистент', 'москвич олег дудка',
      'л@з@нья-голубец', 'света нета.', 'в отрубе ща', 'Александр Дугин Z', 'я клубника ты клубника почему банан',
      'аНгЕл_в_к_ЕД_аХ_', 'charlieкирка', 'сберкактус',
    ];
    const fakeRows = FAKE_NAMES.map((name) => ({
      name,
      score: score + Math.floor(Math.random() * 2000 + 100),
      streak: Math.floor(Math.random() * 18 + 1),
    }));
    fakeRows.push({ name: '🫵 Ты', score, streak });
    fakeRows.sort((a, b) => b.score - a.score);

    const lines = fakeRows.map((row, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      const isYou = row.name === '🫵 Ты';
      const trClass = isYou ? 'bg-primary/15 font-bold' : 'hover:bg-[var(--surface)] transition-colors';
      return `<tr class="${trClass} border-b border-[var(--stroke)] last:border-0">
        <td class="py-1.5 pr-3 text-center w-10">${medal}</td>
        <td class="py-1.5 px-3">${row.name}</td>
        <td class="py-1.5 px-3 text-right tabular-nums">${row.score}</td>
        <td class="py-1.5 pl-3 text-right tabular-nums text-foreground/60">${row.streak}</td>
      </tr>`;
    });

    const tableHtml = `<div class="w-full max-h-[280px] overflow-y-auto overflow-x-auto mt-3 rounded-xl border border-[var(--stroke)] bg-[var(--surface-strong)]">
      <table class="w-full text-sm text-left relative">
        <thead class="bg-[var(--surface)] sticky top-0 z-sticky shadow-sm">
          <tr class="border-b border-[var(--stroke)] text-foreground/60 text-[11px] uppercase">
            <th class="py-1.5 px-3 font-semibold text-center w-10 bg-[var(--surface)]">#</th>
            <th class="py-1.5 px-3 font-semibold bg-[var(--surface)]">Имя</th>
            <th class="py-1.5 px-3 font-semibold text-right bg-[var(--surface)]">Очки</th>
            <th class="py-1.5 px-3 font-semibold text-right bg-[var(--surface)]">Серия</th>
          </tr>
        </thead>
        <tbody>
          ${lines.join('')}
        </tbody>
      </table>
    </div>`;

    addMessage({
      id: createMessageId('stats'),
      isBot: true,
      content: `📊 **Таблица лидеров**\n\n${tableHtml}`,
      type: 'text',
    });
  }

  function runSlashCommand(command: SlashCommand) {
    setIsSlashCommandMenuDismissed(false);
    setIsSlashCommandMenuForcedOpen(false);

    if (isDemoMode) {
      setGlobalInputValue('');
      return;
    }

    if (command === '/seed' || command === '/qseed') {
      setGlobalInputValue(command === '/seed' ? '/seed ' : '/qseed ');
      requestAnimationFrame(() => globalInputRef.current?.focus());
      return;
    }

    setGlobalInputValue('');

    if (command === '/start') {
      handleResetProgress();
      return;
    }

    if (
      command === '/dictation' ||
      command === '/punctuation_constructor' ||
      command === '/orthography_repair'
    ) {
      const exerciseType = command.replace('/', '') as ExerciseType;
      fetchNextExercise([...seenExerciseIds], exerciseType);
      return;
    }

    if (command === '/blitz') {
      void blitz.open();
      return;
    }

    if (command === '/ege13_quick') {
      void ege13Quick.open();
      return;
    }

    if (command === '/ege15_quick') {
      void ege15Quick.open();
      return;
    }

    if (command === '/stats') {
      showStats();
    }
  }

  const handleGlobalInputPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = event.clipboardData.getData('text').trim();
    const nextValue = getCommandAwarePasteValue(
      globalInputValue,
      pastedText,
      event.currentTarget.selectionStart,
      event.currentTarget.selectionEnd,
    );
    if (!nextValue) return;

    event.preventDefault();
    setActiveSlashCommandIndex(0);
    setIsSlashCommandMenuDismissed(false);
    setIsSlashCommandMenuForcedOpen(false);
    setGlobalInputValue(nextValue);
    requestAnimationFrame(() => {
      globalInputRef.current?.focus();
      globalInputRef.current?.setSelectionRange(nextValue.length, nextValue.length);
    });
  };

  const handleGlobalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSlashCommandMenuDismissed(false);
    setIsSlashCommandMenuForcedOpen(false);
    const text = globalInputValue.trim();
    if (!text) return;
    const normalizedCommandText = normalizeQuickSeedText(normalizeSeedCommandText(text));

    const command = normalizedCommandText.toLowerCase();

    if (command === '/demo' || command === '/demo on') {
      setGlobalInputValue('');
      setDemoMode(true);
      return;
    }

    if (command === '/demo off') {
      setGlobalInputValue('');
      setDemoMode(false);
      return;
    }

    if (isDemoMode) {
      setGlobalInputValue('');
      return;
    }

    const quickSeed = parseQuickSeedCommand(normalizedCommandText);
    if (quickSeed) {
      setGlobalInputValue('');
      void fetchQuickCardsBySeed(quickSeed);
      return;
    }

    if (looksLikeBareSeedKey(normalizedCommandText)) {
      setGlobalInputValue('');
      void fetchExerciseBySeedKey(normalizedCommandText);
      return;
    }

    if (looksLikeQuickSeedCommand(normalizedCommandText)) {
      setGlobalInputValue('');
      addMessage({
        id: createMessageId('qseed-usage'),
        isBot: true,
        content: quickSeedUsageText(),
        type: 'text',
      });
      return;
    }

    const seedMatch = normalizedCommandText.match(/^\/(?:seed|exercise)\s+(.+)$/i);
    if (seedMatch) {
      const nestedQuickSeed = normalizeNestedSeedCommand(seedMatch[1]);
      const quickSeedFromSeedCommand = nestedQuickSeed
        ? parseQuickSeedCommand(nestedQuickSeed)
        : null;
      if (quickSeedFromSeedCommand) {
        setGlobalInputValue('');
        void fetchQuickCardsBySeed(quickSeedFromSeedCommand);
        return;
      }

      const seedKey = normalizeSeedKeyInput(seedMatch[1]);
      setGlobalInputValue('');
      void fetchExerciseBySeedKey(seedKey);
      return;
    }

    if (
      command === '/start' ||
      command === '/blitz' ||
      command === '/ege13_quick' ||
      command === '/ege15_quick' ||
      command === '/stats' ||
      command === '/seed' ||
      command === '/qseed' ||
      command === '/dictation' ||
      command === '/punctuation_constructor' ||
      command === '/orthography_repair'
    ) {
      runSlashCommand(command as SlashCommand);
      return;
    }

    if (!supportsGlobalInput || !activeExerciseMessage) {
      addMessage({
        id: createMessageId('unsupported-input'),
        isBot: true,
        content: 'Сейчас это поле принимает команды: /seed <seed_key>, /qseed <mode> <seed_key> <selector>, /dictation, /blitz, /ege13_quick, /ege15_quick, /stats, /start, /punctuation_constructor, /orthography_repair.',
        type: 'text',
      });
      setGlobalInputValue('');
      return;
    }

    const type = activeExerciseMessage.exercise.type;
    let answer: SubmittedAnswer;

    if (type === 'ege21_punctuation_analysis') {
      answer = { type, value: text.replace(/[^0-9]/g, '') };
    } else if (type === 'ege20_complex_sentence_punctuation') {
      answer = { type, value: text.replace(/[^0-9]/g, '') };
    } else if (type === 'fill_blank') {
      answer = { type, value: text };
    } else if (type === 'dictation') {
      answer = { type, text };
    } else {
      return;
    }

    setGlobalInputValue('');
    handleExerciseSubmit(activeExerciseMessage.exercise, answer, text, activeExerciseMessage.id);
  };

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (
      messages.length === 1 &&
      isWelcomeMessage(messages[0]) &&
      !initialized.current &&
      !hasRequestedInitialExercise
    ) {
      initialized.current = true;
      markInitialExerciseRequested();
      setTyping(true);
      clearInitialExerciseTimer();
      initialExerciseTimerRef.current = setTimeout(() => {
        initialExerciseTimerRef.current = null;
        setTyping(false);
        fetchNextExercise(seenExerciseIds);
      }, 700);
    }
  }, [
    clearInitialExerciseTimer,
    fetchNextExercise,
    hasHydrated,
    hasRequestedInitialExercise,
    markInitialExerciseRequested,
    messages,
    seenExerciseIds,
    setTyping,
  ]);

  const lastBlitzStreak = useRef(0);

  useEffect(() => {
    if (
      !hasHydrated ||
      blitz.isOpen ||
      ege13Quick.isOpen ||
      ege15Quick.isOpen ||
      blitz.isLoading
    ) {
      return;
    }

    if (streak < 5 || streak < lastBlitzStreak.current + 5) {
      return;
    }

    lastBlitzStreak.current = streak;
    void blitz.open();
  }, [
    hasHydrated,
    blitz.isOpen,
    blitz.isLoading,
    ege13Quick.isOpen,
    ege15Quick.isOpen,
    blitz,
    streak,
  ]);

  return (
    <div className="relative mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[var(--stroke)] bg-[var(--surface-strong)] shadow-sm sm:h-[calc(100dvh-2rem)]">
      <AnimatePresence initial={false}>
        {blitz.isOpen && (
          <BlitzGame
            cards={blitz.cards}
            mode={blitz.mode}
            onClose={blitz.close}
            onFinish={blitz.onFinish}
          />
        )}
        {ege13Quick.isOpen && (
          <Ege13QuickGame
            cards={ege13Quick.cards}
            mode={ege13Quick.mode}
            onClose={ege13Quick.close}
            onFinish={ege13Quick.onFinish}
          />
        )}
        {ege15Quick.isOpen && (
          <Ege15QuickGame
            cards={ege15Quick.cards}
            mode={ege15Quick.mode}
            onClose={ege15Quick.close}
            onFinish={ege15Quick.onFinish}
          />
        )}
      </AnimatePresence>

      <div className="z-sticky grid min-h-[68px] shrink-0 grid-cols-[1fr_auto] items-center gap-4 border-b border-[var(--stroke)] bg-[var(--surface-strong)] px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-white">
            П
          </div>
          <div className="min-w-0">
            <h1 className="text-balance text-lg font-bold leading-tight text-foreground">
              Пофиксим
            </h1>
            <p className="truncate text-xs font-medium text-primary">Тренируемся вместе</p>
          </div>
        </div>
        <div className="grid min-w-[212px] grid-cols-[52px_1px_52px_28px] items-center justify-items-center gap-x-3 rounded-xl border border-[var(--stroke)] bg-[var(--surface)] py-1.5 pl-3 pr-2.5 shadow-sm sm:min-w-[224px] sm:grid-cols-[56px_1px_56px_28px] sm:gap-x-4 sm:pl-3.5 sm:pr-3">
          <div className="grid w-full gap-0.5 text-center tabular-nums">
            <span className="text-[10px] font-semibold uppercase leading-none text-foreground/70">Очки</span>
            {hasHydrated ? (
              <span className="text-sm font-bold leading-none text-foreground/85">{score}</span>
            ) : (
              <span className="mx-auto h-4 w-5 rounded bg-[var(--stroke)]" aria-hidden="true" />
            )}
          </div>
          <div className="h-4 w-px -translate-x-2 bg-[var(--stroke)]" />
          <div className="grid w-full -translate-x-[10px] gap-0.5 text-center tabular-nums">
            <span className="text-[10px] font-semibold uppercase leading-none text-foreground/70">Серия</span>
            {hasHydrated ? (
              <span className="text-sm font-bold leading-none text-orange-600">{streak}</span>
            ) : (
              <span className="mx-auto h-4 w-5 rounded bg-[var(--stroke)]" aria-hidden="true" />
            )}
          </div>
          <button
            onClick={handleResetProgress}
            disabled={!hasHydrated}
            className="hidden size-7 items-center justify-center rounded-lg text-foreground/70 transition-colors duration-150 ease-out hover:bg-[var(--stroke)] hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:pointer-events-none disabled:opacity-50 sm:inline-flex"
            aria-label="Сбросить прогресс"
            title="Начать заново"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto chat-pattern-bg px-3 py-4 sm:p-5">
        {hasHydrated ? (
          <AnimatePresence initial={false}>
            {messages.map((msg, index) => {
              const prevMsg = messages[index - 1];
              const nextMsg = messages[index + 1];
              
              let isFirstInGroup = true;
              let isLastInGroup = true;
              
              if (isGroupedMessagePair(prevMsg, msg)) {
                isFirstInGroup = false;
              }
              if (isGroupedMessagePair(msg, nextMsg)) {
                isLastInGroup = false;
              }

              return (
              <div key={`${msg.id}-${index}`} className="w-full">
                <MessageBubble
                  content={msg.content}
                  isBot={msg.isBot}
                  isQuestion={msg.type === 'exercise'}
                  createdAt={msg.createdAt}
                  isFirstInGroup={isFirstInGroup}
                  isLastInGroup={isLastInGroup}
                  holdTail={tailHoldMessageIds.has(msg.id)}
                  suppressTail={tailSuppressMessageIds.has(msg.id)}
                />
                {isExerciseMessage(msg) && (
                  <ExerciseRenderer
                    exercise={msg.exercise}
                    disabled={answeredExerciseMessageIds.has(msg.id)}
                    highlight={highlightedExerciseMessageId === msg.id}
                    highlightId={msg.id}
                    onSubmit={(answer, label) => {
                      if (isDemoMode) return;
                      handleExerciseSubmit(msg.exercise, answer, label, msg.id);
                    }}
                  />
                )}
              </div>
            )})}
            {isTyping && <TypingIndicator key="typing" />}
          </AnimatePresence>
        ) : (
          <div className="w-full" aria-hidden="true">
            <div className="max-w-3xl rounded-xl border border-[var(--stroke)] bg-[var(--surface-strong)] p-5 shadow-sm">
              <div className="h-4 w-11/12 rounded bg-[var(--stroke)]" />
              <div className="mt-3 h-4 w-2/3 rounded bg-[var(--stroke)]" />
            </div>
          </div>
        )}
        <div ref={bottomRef} className="h-4" />
      </div>

      <div className="shrink-0 border-t border-[var(--stroke)] bg-[var(--surface-strong)] p-3 sm:p-4">
        {!hasHydrated ? (
          <div className="flex h-11 w-full items-center rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-4" aria-hidden="true">
            <div className="h-4 w-64 max-w-full rounded bg-[var(--stroke)]" />
          </div>
        ) : (
          <div ref={globalInputShellRef} className="relative">
            <AnimatePresence initial={false}>
              {showSlashCommands && (
                <motion.div
                  id="slash-command-list"
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  role="listbox"
                  aria-activedescendant={activeSlashCommand ? `slash-command-${activeSlashCommand.command.slice(1)}` : undefined}
                  className="absolute bottom-[calc(100%+0.5rem)] left-0 z-popover w-full overflow-hidden rounded-2xl border border-[var(--stroke)] bg-[var(--surface-strong)] shadow-xl"
                >
                  {visibleForcedSlashCommands.map((item, index) => {
                    const Icon = getSlashCommandIcon(item.command);
                    const isActive = index === activeSlashCommandIndex;
                    return (
                      <button
                        id={`slash-command-${item.command.slice(1)}`}
                        key={item.command}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActiveSlashCommandIndex(index)}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          runSlashCommand(item.command);
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

            <form onSubmit={handleGlobalSubmit} className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveSlashCommandIndex(0);
                  if (showSlashCommands) {
                    setIsSlashCommandMenuDismissed(true);
                    setIsSlashCommandMenuForcedOpen(false);
                    setGlobalInputValue((current) => (current.trim() === '/' ? '' : current));
                  } else {
                    setIsSlashCommandMenuDismissed(false);
                    setIsSlashCommandMenuForcedOpen(true);
                    setGlobalInputValue((current) => (current.trim() ? current : '/'));
                  }
                  globalInputRef.current?.focus();
                }}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--stroke)] bg-[var(--surface)] text-foreground/50 transition-[background-color,border-color,color,transform] duration-150 ease-out hover:bg-[var(--stroke)] hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96]"
                aria-label="Open command menu"
                aria-expanded={showSlashCommands}
                aria-controls="slash-command-list"
                title="Меню команд"
              >
                <span className="font-mono text-xl font-bold leading-none opacity-80">/</span>
              </button>
              <textarea
                ref={globalInputRef}
                name="chat-message"
                rows={1}
                value={globalInputValue}
                onChange={(e) => {
                  setActiveSlashCommandIndex(0);
                  setIsSlashCommandMenuDismissed(false);
                  setIsSlashCommandMenuForcedOpen(false);
                  setGlobalInputValue(e.target.value);
                }}
                onFocus={() => setIsSlashCommandMenuDismissed(false)}
                onPaste={handleGlobalInputPaste}
                onKeyDown={(event) => {
                  if (showSlashCommands && visibleForcedSlashCommands.length > 0) {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setIsSlashCommandMenuDismissed(true);
                      setIsSlashCommandMenuForcedOpen(false);
                      setActiveSlashCommandIndex(0);
                      setGlobalInputValue((current) => (current.trim() === '/' ? '' : current));
                      return;
                    }
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      setActiveSlashCommandIndex((current) =>
                        (current + 1) % visibleForcedSlashCommands.length,
                      );
                      return;
                    }
                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      setActiveSlashCommandIndex((current) =>
                        (current - 1 + visibleForcedSlashCommands.length) % visibleForcedSlashCommands.length,
                      );
                      return;
                    }
                    if (event.key === 'Tab') {
                      event.preventDefault();
                      if (activeSlashCommand) runSlashCommand(activeSlashCommand.command);
                      return;
                    }
                    if (event.key === 'Enter' && !event.shiftKey && activeSlashCommand) {
                      event.preventDefault();
                      runSlashCommand(activeSlashCommand.command);
                      return;
                    }
                  }
                  if (event.key === 'ArrowUp' && !globalInputValue.trim()) {
                    event.preventDefault();
                    setActiveSlashCommandIndex(0);
                    setGlobalInputValue('/');
                    return;
                  }
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={supportsGlobalInput ? 'Ваш ответ...' : 'Написать сообщение...'}
                className="max-h-40 min-h-11 w-full resize-none overflow-y-auto rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-pretty text-sm leading-5 text-foreground outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-foreground/45 focus:border-primary focus:ring-1 focus:ring-primary"
                aria-label={supportsGlobalInput ? 'Exercise answer' : 'Message or command'}
                autoFocus
              />
              <button
                type="submit"
                disabled={!globalInputValue.trim()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-[background-color,opacity,transform] duration-150 ease-out hover:bg-primary-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] disabled:opacity-50 disabled:active:scale-100"
                aria-label="Send"
                title="Отправить"
              >
                <svg aria-hidden="true" className="h-5 w-5 translate-x-0.5 rotate-45" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
