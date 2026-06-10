'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';

type ExerciseMessage = Message & {
  type: 'exercise';
  exercise: Exercise & { id: number };
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

  const [hasHydrated, setHasHydrated] = useState(false);
  const [globalInputValue, setGlobalInputValue] = useState('');
  const globalInputRef = useRef<HTMLTextAreaElement>(null);
  const blitz = useBlitzGame();
  const ege13Quick = useEge13QuickGame();
  const ege15Quick = useEge15QuickGame();

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
          const returnedId = res.success ? res.exercise?.id : undefined;
          const isBlocked = typeof returnedId === 'number' && dynamicBlocked.includes(returnedId);
          if (!isBlocked) break;
          dynamicBlocked = [...new Set([...dynamicBlocked, returnedId])];
          attempt += 1;
        } while (attempt < 4);
      } finally {
        isFetchingExercise.current = false;
      }

      if (!res.success) {
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

      if (res.exercise?.id) {
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

      if (res.noMoreExercises) {
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
        <td class="py-1.5 px-3 text-right">${row.score}</td>
        <td class="py-1.5 pl-3 text-right text-foreground/60">${row.streak}</td>
      </tr>`;
    });

    const tableHtml = `<div class="w-full max-h-[280px] overflow-y-auto overflow-x-auto mt-3 rounded-xl border border-[var(--stroke)] bg-[var(--surface-strong)]">
      <table class="w-full text-sm text-left relative">
        <thead class="bg-[var(--surface)] sticky top-0 z-10 shadow-sm">
          <tr class="border-b border-[var(--stroke)] text-foreground/60 text-[11px] uppercase tracking-wider">
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
      messages[0].id === 'welcome' &&
      !initialized.current &&
      !hasRequestedInitialExercise
    ) {
      initialized.current = true;
      markInitialExerciseRequested();
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        fetchNextExercise(seenExerciseIds);
      }, 700);
    }
  }, [
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
    <div className="relative mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--stroke)] bg-[var(--surface-strong)] shadow-lg sm:h-[calc(100vh-2rem)]">
      <AnimatePresence>
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

      <div className="z-10 flex h-[68px] shrink-0 items-center justify-between border-b border-[var(--stroke)] bg-[var(--surface-strong)] px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-base font-bold text-white">
            П
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight tracking-tight text-foreground">
              Пофиксим
            </h1>
            <p className="text-xs font-medium text-primary">Тренируемся вместе</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-1.5 shadow-sm">
          <div className="flex min-w-14 items-center gap-1 text-sm font-semibold text-foreground/80">
            <span>Очки:</span>
            {hasHydrated ? (
              <span>{score}</span>
            ) : (
              <span className="h-4 w-5 rounded bg-[var(--stroke)]" aria-hidden="true" />
            )}
          </div>
          <div className="h-4 w-px bg-[var(--stroke)]" />
          <div className="flex min-w-16 items-center gap-1 text-sm font-semibold text-orange-600">
            <span>Серия:</span>
            {hasHydrated ? (
              <span>{streak}</span>
            ) : (
              <span className="h-4 w-5 rounded bg-[var(--stroke)]" aria-hidden="true" />
            )}
          </div>
          <div className="h-4 w-px bg-[var(--stroke)]" />
          <button
            onClick={handleResetProgress}
            disabled={!hasHydrated}
            className="rounded-md px-2 py-1 text-xs font-medium text-foreground/70 transition hover:bg-[var(--stroke)] hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            title="Начать заново"
          >
            Сброс
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto chat-pattern-bg p-5">
        {hasHydrated ? (
          <AnimatePresence initial={false}>
            {messages.map((msg, index) => {
              const prevMsg = messages[index - 1];
              const nextMsg = messages[index + 1];
              
              let isFirstInGroup = true;
              let isLastInGroup = true;
              
              if (prevMsg && prevMsg.isBot === msg.isBot) {
                const timeDiff = msg.createdAt && prevMsg.createdAt ? msg.createdAt - prevMsg.createdAt : 0;
                if (timeDiff < 5 * 60 * 1000) isFirstInGroup = false;
              }
              if (nextMsg && nextMsg.isBot === msg.isBot) {
                const timeDiff = nextMsg.createdAt && msg.createdAt ? nextMsg.createdAt - msg.createdAt : 0;
                if (timeDiff < 5 * 60 * 1000) isLastInGroup = false;
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

      <div className="shrink-0 border-t border-[var(--stroke)] bg-[var(--surface-strong)] p-4">
        {!hasHydrated ? (
          <div className="flex h-11 w-full items-center rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-4" aria-hidden="true">
            <div className="h-4 w-64 max-w-full rounded bg-[var(--stroke)]" />
          </div>
        ) : (
          <div className="relative">
            <AnimatePresence>
              {showSlashCommands && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-[calc(100%+0.5rem)] left-0 z-20 w-full overflow-hidden rounded-2xl border border-[var(--stroke)] bg-[var(--surface-strong)] shadow-xl"
                >
                  {visibleSlashCommands.map((item) => {
                    const Icon = item.command === '/blitz' ? Zap : item.command === '/stats' ? BarChart3 : item.command === '/ege13_quick' || item.command === '/ege15_quick' || item.command.startsWith('/punctuation') || item.command.startsWith('/orthography') ? PenTool : RotateCcw;
                    return (
                      <button
                        key={item.command}
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          runSlashCommand(item.command);
                        }}
                        className="flex w-full items-center gap-3 border-b border-[var(--stroke)] px-3 py-2.5 text-left transition last:border-b-0 hover:bg-[var(--surface)]"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black text-foreground">
                            <span className="font-mono">{item.command}</span>
                            <span className="ml-2 text-foreground/55">{item.title}</span>
                          </span>
                          <span className="block truncate text-xs font-medium text-foreground/55">
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
                  setGlobalInputValue(prev => prev.startsWith('/') ? '' : '/');
                  globalInputRef.current?.focus();
                }}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--stroke)] bg-[var(--surface)] text-foreground/50 transition hover:bg-[var(--stroke)] hover:text-foreground"
                title="Меню команд"
              >
                <span className="font-mono text-xl font-bold leading-none opacity-80">/</span>
              </button>
              <textarea
                ref={globalInputRef}
                rows={1}
                value={globalInputValue}
                onChange={(e) => setGlobalInputValue(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowUp' && !globalInputValue.trim()) {
                    event.preventDefault();
                    setGlobalInputValue('/');
                    return;
                  }
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={supportsGlobalInput ? 'Ваш ответ...' : 'Написать сообщение...'}
                className="max-h-40 min-h-11 w-full resize-none overflow-y-auto rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-sm leading-5 text-foreground outline-none transition placeholder:text-foreground/45 focus:border-primary focus:ring-1 focus:ring-primary"
                autoFocus
              />
              <button
                type="submit"
                disabled={!globalInputValue.trim()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition hover:bg-primary-strong disabled:opacity-50"
                title="Отправить"
              >
                <svg className="h-5 w-5 translate-x-0.5 rotate-45" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
