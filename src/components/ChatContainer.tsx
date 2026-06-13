'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BarChart3, RotateCcw, Zap, PenTool } from 'lucide-react';
import type { ExerciseType } from '@/features/exercises/types';
import {
  getNextExerciseAction,
  submitExerciseAnswerAction,
} from '@/app/actions/exercises';
import ExerciseRenderer from '@/features/exercises/renderers/ExerciseRenderer';
import type { Exercise, SubmittedAnswer } from '@/features/exercises/schemas';
import { buildDictationFeedbackText } from '@/features/exercises/dictationFeedback';
import { useChatStore, type Message } from '@/store/chatStore';
import { useBlitzGame } from '@/hooks/useBlitzGame';
import { useEge13QuickGame } from '@/hooks/useEge13QuickGame';
import { useEge15QuickGame } from '@/hooks/useEge15QuickGame';
import { createMessageId } from '@/lib/message-id';
import BlitzGame from './BlitzGame';
import Ege13QuickGame from './Ege13QuickGame';
import Ege15QuickGame from './Ege15QuickGame';
import MessageBubble, { MESSAGE_ENTER_DURATION_MS } from './MessageBubble';
import TypingIndicator from './TypingIndicator';

const TAIL_HANDOFF_RATIO = 0.25;
const TAIL_HANDOFF_MS = Math.round(MESSAGE_ENTER_DURATION_MS * TAIL_HANDOFF_RATIO);

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

function answerFeedbackPrefix(isCorrect: boolean) {
  return isCorrect ? 'Верно. ' : 'Почти, но есть ловушка. ';
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
  result: Awaited<ReturnType<typeof submitExerciseAnswerAction>>['result'],
  exerciseType?: Exercise['type'],
) {
  if (!result) return '';
  if (exerciseType === 'dictation') {
    return result.isCorrect
      ? 'Верно.'
      : buildDictationFeedbackText(result.normalizedAnswer);
  }
  const prefix =
    exerciseType === 'punctuation_constructor' && !result.isCorrect
      ? ''
      : answerFeedbackPrefix(result.isCorrect);
  const prefixText = prefix ? `${prefix}\n\n` : '';

  if (result.feedback.correctAnswer && result.feedback.detailedExplanation) {
    const correctAnswerLabel = '\u041f\u0440\u0430\u0432\u0438\u043b\u044c\u043d\u044b\u0439 \u043e\u0442\u0432\u0435\u0442';
    const explanationLabel = '\u041e\u0431\u044a\u044f\u0441\u043d\u0435\u043d\u0438\u0435';
    return `${prefixText}${correctAnswerLabel}:\n${result.feedback.correctAnswer}\n\n${explanationLabel}:\n${result.feedback.detailedExplanation}`;
  }

  return `${prefixText}${result.feedback.explanation}${buildStepFeedbackText(result, exerciseType)}`;
}

function buildStepFeedbackText(
  result: Awaited<ReturnType<typeof submitExerciseAnswerAction>>['result'],
  exerciseType?: Exercise['type'],
) {
  if (
    exerciseType === 'ege_multi_select' ||
    exerciseType === 'punctuation_constructor'
  ) {
    return '';
  }
  if (!result || result.stepFeedback.length === 0) {
    return '';
  }

  const lines = result.stepFeedback.map(
    (step, index) => `${index + 1}. ${step.message}`,
  );

  return `\n\nРазбор по шагам:\n${lines.join('\n')}\n\nДальше: ${result.nextRecommendation.reason}`;
}

export default function ChatContainer() {
  const {
    messages,
    isTyping,
    addMessage,
    markExercisePresented,
    setTyping,
    setSessionId,
    recordExerciseResult,
    score,
    streak,
    seenExerciseIds,
    cooldownExerciseIds,
    answeredExerciseIds,
    sessionId,
    hasRequestedInitialExercise,
    markInitialExerciseRequested,
    resetProgress,
  } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const isFetchingExercise = useRef(false);
  const previousMessagesRef = useRef<Message[]>([]);
  const hasInitializedTailTrackingRef = useRef(false);
  const tailHandoffsRef = useRef(new Map<TailHandoffAuthor, TailHandoff>());
  const initialExerciseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [hasHydrated, setHasHydrated] = useState(false);
  const [globalInputValue, setGlobalInputValue] = useState('');
  const [activeSlashCommandIndex, setActiveSlashCommandIndex] = useState(0);
  const [tailHoldMessageIds, setTailHoldMessageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [tailSuppressMessageIds, setTailSuppressMessageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const globalInputRef = useRef<HTMLTextAreaElement>(null);
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
    };
  }, [clearInitialExerciseTimer, clearTailHandoffTimers]);

  const lastMessage = messages[messages.length - 1];
  const activeExerciseMessage = 
    lastMessage && isExerciseMessage(lastMessage) && !answeredExerciseIds.includes(lastMessage.exercise.id)
      ? lastMessage
      : null;
  const slashCommandQuery = globalInputValue.startsWith('/')
    ? globalInputValue.slice(1).toLowerCase()
    : null;
  const visibleSlashCommands = slashCommandQuery === null
    ? []
    : SLASH_COMMANDS.filter((item) => {
        const command = item.command.slice(1);
        return (
          command.startsWith(slashCommandQuery) ||
          item.title.toLowerCase().includes(slashCommandQuery)
        );
      });
  const showSlashCommands = slashCommandQuery !== null && visibleSlashCommands.length > 0;
  const activeSlashCommand =
    showSlashCommands
      ? visibleSlashCommands[Math.min(activeSlashCommandIndex, visibleSlashCommands.length - 1)]
      : null;

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
    if (!hasHydrated) return;

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

  const handleGlobalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = globalInputValue.trim();
    if (!text) return;

    const command = text.toLowerCase();
    if (
      command === '/start' ||
      command === '/blitz' ||
      command === '/ege13_quick' ||
      command === '/ege15_quick' ||
      command === '/stats' ||
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
        content: 'Сейчас это поле принимает команды: /dictation, /blitz, /ege13_quick, /ege15_quick, /stats, /start, /punctuation_constructor, /orthography_repair.',
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
    handleExerciseSubmit(activeExerciseMessage.exercise, answer, text);
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
          <BlitzGame cards={blitz.cards} onClose={blitz.close} onFinish={blitz.onFinish} />
        )}
        {ege13Quick.isOpen && (
          <Ege13QuickGame cards={ege13Quick.cards} onClose={ege13Quick.close} onFinish={ege13Quick.onFinish} />
        )}
        {ege15Quick.isOpen && (
          <Ege15QuickGame cards={ege15Quick.cards} onClose={ege15Quick.close} onFinish={ege15Quick.onFinish} />
        )}
      </AnimatePresence>

      <div className="z-sticky grid min-h-[68px] shrink-0 grid-cols-[1fr_auto] items-center gap-4 border-b border-[var(--stroke)] bg-[var(--surface-strong)] px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-base font-bold text-white">
            П
          </div>
          <div className="min-w-0">
            <h1 className="text-balance text-lg font-bold leading-tight text-foreground">
              Пофиксим
            </h1>
            <p className="truncate text-xs font-medium text-primary">Тренируемся вместе</p>
          </div>
        </div>
        <div className="grid grid-cols-[auto_auto_auto] items-center gap-2 rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-2.5 py-1.5 shadow-sm sm:grid-cols-[auto_auto_auto_auto] sm:gap-3 sm:px-3">
          <div className="grid min-w-12 gap-0.5 text-right tabular-nums sm:min-w-14">
            <span className="text-[10px] font-semibold uppercase leading-none text-foreground/70">Очки</span>
            {hasHydrated ? (
              <span className="text-sm font-bold leading-none text-foreground/85">{score}</span>
            ) : (
              <span className="ml-auto h-4 w-5 rounded bg-[var(--stroke)]" aria-hidden="true" />
            )}
          </div>
          <div className="h-4 w-px bg-[var(--stroke)]" />
          <div className="grid min-w-12 gap-0.5 text-right tabular-nums sm:min-w-16">
            <span className="text-[10px] font-semibold uppercase leading-none text-foreground/70">Серия</span>
            {hasHydrated ? (
              <span className="text-sm font-bold leading-none text-orange-600">{streak}</span>
            ) : (
              <span className="ml-auto h-4 w-5 rounded bg-[var(--stroke)]" aria-hidden="true" />
            )}
          </div>
          <button
            onClick={handleResetProgress}
            disabled={!hasHydrated}
            className="hidden rounded-md px-2 py-1 text-xs font-medium text-foreground/70 transition-colors duration-150 ease-out hover:bg-[var(--stroke)] hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:pointer-events-none disabled:opacity-50 sm:block"
            title="Начать заново"
          >
            Сброс
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
                    disabled={answeredExerciseIds.includes(msg.exercise.id)}
                    onSubmit={(answer, label) =>
                      handleExerciseSubmit(msg.exercise, answer, label)
                    }
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
          <div className="relative">
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
                  {visibleSlashCommands.map((item, index) => {
                    const Icon = item.command === '/blitz' ? Zap : item.command === '/stats' ? BarChart3 : item.command === '/ege13_quick' || item.command === '/ege15_quick' || item.command.startsWith('/punctuation') || item.command.startsWith('/orthography') ? PenTool : RotateCcw;
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
                  setGlobalInputValue(prev => prev.startsWith('/') ? '' : '/');
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
                rows={1}
                value={globalInputValue}
                onChange={(e) => {
                  setActiveSlashCommandIndex(0);
                  setGlobalInputValue(e.target.value);
                }}
                onKeyDown={(event) => {
                  if (showSlashCommands && visibleSlashCommands.length > 0) {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      setActiveSlashCommandIndex((current) =>
                        (current + 1) % visibleSlashCommands.length,
                      );
                      return;
                    }
                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      setActiveSlashCommandIndex((current) =>
                        (current - 1 + visibleSlashCommands.length) % visibleSlashCommands.length,
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
