'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import {
  getNextExerciseAction,
  submitExerciseAnswerAction,
} from '@/app/actions/exercises';
import ExerciseRenderer from '@/features/exercises/renderers/ExerciseRenderer';
import type { Exercise, SubmittedAnswer } from '@/features/exercises/schemas';
import { useChatStore, type Message } from '@/store/chatStore';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';

type ExerciseMessage = Message & {
  type: 'exercise';
  exercise: Exercise & { id: number };
};

function createMessageId(suffix?: string) {
  const c = globalThis.crypto as Crypto | undefined;
  let baseId: string;

  if (c && typeof c.randomUUID === 'function') {
    baseId = c.randomUUID();
  } else if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    baseId = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } else {
    baseId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  return suffix ? `${baseId}-${suffix}` : baseId;
}

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

function buildFeedbackText(
  result: Awaited<ReturnType<typeof submitExerciseAnswerAction>>['result'],
  exerciseType?: Exercise['type'],
) {
  if (!result) return '';
  const prefix = answerFeedbackPrefix(result.isCorrect);

  if (
    exerciseType === 'ege_multi_select' &&
    result.feedback.correctAnswer &&
    result.feedback.detailedExplanation
  ) {
    const correctAnswerLabel = '\u041f\u0440\u0430\u0432\u0438\u043b\u044c\u043d\u044b\u0439 \u043e\u0442\u0432\u0435\u0442';
    const explanationLabel = '\u041e\u0431\u044a\u044f\u0441\u043d\u0435\u043d\u0438\u0435';
    return `${prefix}\n\n${correctAnswerLabel}:\n${result.feedback.correctAnswer}\n\n${explanationLabel}:\n${result.feedback.detailedExplanation}`;
  }

  return `${prefix}\n\n${result.feedback.explanation}${buildStepFeedbackText(result, exerciseType)}`;
}

function buildStepFeedbackText(
  result: Awaited<ReturnType<typeof submitExerciseAnswerAction>>['result'],
  exerciseType?: Exercise['type'],
) {
  if (exerciseType === 'ege_multi_select') {
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

  const [globalInputValue, setGlobalInputValue] = useState('');

  const lastMessage = messages[messages.length - 1];
  const activeExerciseMessage = 
    lastMessage && isExerciseMessage(lastMessage) && !answeredExerciseIds.includes(lastMessage.exercise.id)
      ? lastMessage
      : null;

  const supportsGlobalInput = activeExerciseMessage && [
    'ege21_punctuation_analysis',
    'ege20_complex_sentence_punctuation',
    'fill_blank',
  ].includes(activeExerciseMessage.exercise.type);

  const handleResetProgress = () => {
    initialized.current = false;
    setTyping(false);
    resetProgress();
  };

  const fetchNextExercise = useCallback(
    async (currentSeenIds: number[]) => {
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
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

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

  const handleGlobalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportsGlobalInput || !activeExerciseMessage || !globalInputValue.trim()) return;

    const text = globalInputValue.trim();
    const type = activeExerciseMessage.exercise.type;
    let answer: SubmittedAnswer;

    if (type === 'ege21_punctuation_analysis') {
      answer = { type, value: text.replace(/[^0-9]/g, '') };
    } else if (type === 'ege20_complex_sentence_punctuation') {
      answer = { type, value: text.replace(/[^0-9]/g, '') };
    } else if (type === 'fill_blank') {
      answer = { type, value: text };
    } else {
      return;
    }

    setGlobalInputValue('');
    handleExerciseSubmit(activeExerciseMessage.exercise, answer, text);
  };

  useEffect(() => {
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
    hasRequestedInitialExercise,
    markInitialExerciseRequested,
    messages,
    seenExerciseIds,
    setTyping,
  ]);

  return (
    <div className="relative mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--stroke)] bg-[var(--surface-strong)] shadow-lg sm:h-[calc(100vh-2rem)]">
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
          <div className="text-sm font-semibold text-foreground/80">Очки: {score}</div>
          <div className="h-4 w-px bg-[var(--stroke)]" />
          <div className="text-sm font-semibold text-orange-600">Серия: {streak}</div>
          <div className="h-4 w-px bg-[var(--stroke)]" />
          <button
            onClick={handleResetProgress}
            className="rounded-md px-2 py-1 text-xs font-medium text-foreground/70 transition hover:bg-[var(--stroke)] hover:text-foreground"
            title="Начать заново"
          >
            Сброс
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[var(--surface)] p-5">
        <AnimatePresence initial={false}>
          {messages.map((msg, index) => (
            <div key={`${msg.id}-${index}`} className="w-full">
              <MessageBubble
                content={msg.content}
                isBot={msg.isBot}
                isQuestion={msg.type === 'exercise'}
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
          ))}
          {isTyping && <TypingIndicator key="typing" />}
        </AnimatePresence>
        <div ref={bottomRef} className="h-4" />
      </div>

      <div className="shrink-0 border-t border-[var(--stroke)] bg-[var(--surface-strong)] p-4">
        {supportsGlobalInput ? (
          <form onSubmit={handleGlobalSubmit} className="flex gap-2">
            <input
              type="text"
              value={globalInputValue}
              onChange={(e) => setGlobalInputValue(e.target.value)}
              placeholder="Введите ваш ответ..."
              className="h-11 w-full rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-4 text-sm text-foreground outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
              autoFocus
            />
            <button
              type="submit"
              disabled={!globalInputValue.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition hover:bg-primary-strong disabled:opacity-50"
              title="Отправить"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>
        ) : (
          <div className="flex h-11 w-full cursor-not-allowed items-center rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-4 text-sm font-medium text-foreground/50">
            Отвечайте в карточке задания выше.
          </div>
        )}
      </div>
    </div>
  );
}
