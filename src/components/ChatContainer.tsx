'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { RotateCcw } from 'lucide-react';
import type { ExerciseType } from '@/features/exercises/types';
import ExerciseRenderer from '@/features/exercises/renderers/ExerciseRenderer';
import type { Exercise, SubmittedAnswer } from '@/features/exercises/schemas';
import { useChatStore, type Message } from '@/store/chatStore';
import { useBlitzGame } from '@/hooks/useBlitzGame';
import { useEge13QuickGame } from '@/hooks/useEge13QuickGame';
import { useEge15QuickGame } from '@/hooks/useEge15QuickGame';
import {
  isGroupedMessagePair,
  useChatTailHandoff,
} from '@/hooks/useChatTailHandoff';
import {
  isExerciseMessage,
  useRenderedExerciseRefresh,
} from '@/hooks/useRenderedExerciseRefresh';
import { useChatExerciseFetchers } from '@/hooks/useChatExerciseFetchers';
import { useExerciseMessageHighlight } from '@/hooks/useExerciseMessageHighlight';
import { useInitialExerciseRequest } from '@/hooks/useInitialExerciseRequest';
import { useAutoBlitzPrompt } from '@/hooks/useAutoBlitzPrompt';
import { useChatCommandInput } from '@/hooks/useChatCommandInput';
import { useChatExerciseSubmit } from '@/hooks/useChatExerciseSubmit';
import { useChatStatsMessage } from '@/hooks/useChatStatsMessage';
import { createMessageId } from '@/lib/message-id';
import {
  looksLikeBareSeedKey,
  looksLikeQuickSeedCommand,
  normalizeNestedSeedCommand,
  normalizeQuickSeedText,
  normalizeSeedCommandText,
  normalizeSeedKeyInput,
  parseQuickSeedCommand,
  quickSeedUsageText,
  type SlashCommand,
} from '@/lib/chatCommands';
import BlitzGame from './BlitzGame';
import ChatInputBar from './ChatInputBar';
import Ege13QuickGame from './Ege13QuickGame';
import Ege15QuickGame from './Ege15QuickGame';
import MessageBubble, { MESSAGE_ENTER_DURATION_MS } from './MessageBubble';
import TypingIndicator from './TypingIndicator';

const RENDERED_EXERCISE_REFRESH_POLL_MS = 90_000;

function isFeedbackMessage(message: Message | undefined) {
  return Boolean(
    message?.type === 'text' &&
      message.isBot &&
      (message.feedbackForExerciseId || message.feedbackForExerciseMessageId || message.submittedAnswer),
  );
}

function getMessageStackSpacing(message: Message, previousMessage: Message | undefined) {
  if (!previousMessage) return '';

  if (isGroupedMessagePair(previousMessage, message)) {
    return 'mt-1.5';
  }

  if (previousMessage.type === 'exercise' && !message.isBot) {
    return 'mt-3';
  }

  if (!previousMessage.isBot && isFeedbackMessage(message)) {
    return 'mt-2.5';
  }

  if (isFeedbackMessage(previousMessage) && message.isBot) {
    return 'mt-6';
  }

  if (message.type === 'exercise') {
    return 'mt-2';
  }

  return 'mt-3.5';
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

  const [hasHydrated, setHasHydrated] = useState(false);
  const blitz = useBlitzGame();
  const ege13Quick = useEge13QuickGame();
  const ege15Quick = useEge15QuickGame();
  const {
    tailHoldMessageIds,
    tailSuppressMessageIds,
    resetTailHandoffState,
  } = useChatTailHandoff({
    messages,
    hasHydrated,
    messageEnterDurationMs: MESSAGE_ENTER_DURATION_MS,
  });
  useRenderedExerciseRefresh({
    messages,
    hasHydrated,
    pollMs: RENDERED_EXERCISE_REFRESH_POLL_MS,
    updateExerciseMessages,
    updateFeedbackMessages,
  });
  const {
    highlightedExerciseMessageId,
    highlightLatestExerciseIfSameSeed,
    clearExerciseHighlight,
  } = useExerciseMessageHighlight({ messages });

  const {
    fetchNextExercise,
    fetchExerciseBySeedKey,
    fetchQuickCardsBySeed,
  } = useChatExerciseFetchers({
    sessionId,
    cooldownExerciseIds,
    addMessage,
    markExercisePresented,
    setSessionId,
    setTyping,
    highlightLatestExerciseIfSameSeed,
    blitz,
    ege13Quick,
    ege15Quick,
  });
  const { resetInitialExerciseRequest } = useInitialExerciseRequest({
    hasHydrated,
    messages,
    hasRequestedInitialExercise,
    seenExerciseIds,
    markInitialExerciseRequested,
    setTyping,
    fetchNextExercise,
  });
  useAutoBlitzPrompt({
    hasHydrated,
    streak,
    blitz,
    ege13Quick,
    ege15Quick,
  });
  const {
    handleExerciseSubmit,
    clearPendingNextExercise,
  } = useChatExerciseSubmit({
    sessionId,
    cooldownExerciseIds,
    seenExerciseIds,
    addMessage,
    setTyping,
    recordExerciseResult,
    markExercisePresented,
    fetchNextExercise,
  });
  const showStats = useChatStatsMessage({ addMessage, score, streak });

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

    setTyping(false);
    resetInitialExerciseRequest();
    clearPendingNextExercise();
    clearExerciseHighlight();
    resetTailHandoffState();
    blitz.close();
    ege13Quick.close();
    ege15Quick.close();
    resetProgress();
  };

  const fetchExerciseTypeFromCommand = useCallback(
    (exerciseType: ExerciseType) => {
      fetchNextExercise([...seenExerciseIds], exerciseType);
    },
    [fetchNextExercise, seenExerciseIds],
  );

  const commandInput = useChatCommandInput({
    isDemoMode,
    onResetProgress: handleResetProgress,
    onFetchExerciseByType: fetchExerciseTypeFromCommand,
    onOpenBlitz: () => void blitz.open(),
    onOpenEge13Quick: () => void ege13Quick.open(),
    onOpenEge15Quick: () => void ege15Quick.open(),
    onShowStats: showStats,
  });

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [hasHydrated, messages, isTyping]);

  const handleGlobalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    commandInput.closeCommandMenu();
    const text = commandInput.value.trim();
    if (!text) return;
    const normalizedCommandText = normalizeQuickSeedText(normalizeSeedCommandText(text));

    const command = normalizedCommandText.toLowerCase();

    if (command === '/demo' || command === '/demo on') {
      commandInput.clearValue();
      setDemoMode(true);
      return;
    }

    if (command === '/demo off') {
      commandInput.clearValue();
      setDemoMode(false);
      return;
    }

    if (isDemoMode) {
      commandInput.clearValue();
      return;
    }

    const quickSeed = parseQuickSeedCommand(normalizedCommandText);
    if (quickSeed) {
      commandInput.clearValue();
      void fetchQuickCardsBySeed(quickSeed);
      return;
    }

    if (looksLikeBareSeedKey(normalizedCommandText)) {
      commandInput.clearValue();
      void fetchExerciseBySeedKey(normalizedCommandText);
      return;
    }

    if (looksLikeQuickSeedCommand(normalizedCommandText)) {
      commandInput.clearValue();
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
        commandInput.clearValue();
        void fetchQuickCardsBySeed(quickSeedFromSeedCommand);
        return;
      }

      const seedKey = normalizeSeedKeyInput(seedMatch[1]);
      commandInput.clearValue();
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
      commandInput.runSlashCommand(command as SlashCommand);
      return;
    }

    if (!supportsGlobalInput || !activeExerciseMessage) {
      addMessage({
        id: createMessageId('unsupported-input'),
        isBot: true,
        content: 'Сейчас это поле принимает команды: /seed <seed_key>, /qseed <mode> <seed_key> <selector>, /dictation, /blitz, /ege13_quick, /ege15_quick, /stats, /start, /punctuation_constructor, /orthography_repair.',
        type: 'text',
      });
      commandInput.clearValue();
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

    commandInput.clearValue();
    handleExerciseSubmit(activeExerciseMessage.exercise, answer, text, activeExerciseMessage.id);
  };

  return (
    <div className="relative mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[var(--stroke)] bg-[var(--surface-strong)] shadow-sm sm:h-[calc(100dvh-2rem)]">
      <AnimatePresence initial={false}>
        {blitz.isOpen && (
          <BlitzGame
            key={blitz.instanceKey}
            cards={blitz.cards}
            mode={blitz.mode}
            onClose={blitz.close}
            onFinish={blitz.onFinish}
          />
        )}
        {ege13Quick.isOpen && (
          <Ege13QuickGame
            key={ege13Quick.instanceKey}
            cards={ege13Quick.cards}
            mode={ege13Quick.mode}
            onClose={ege13Quick.close}
            onFinish={ege13Quick.onFinish}
          />
        )}
        {ege15Quick.isOpen && (
          <Ege15QuickGame
            key={ege15Quick.instanceKey}
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
              const stackSpacing = getMessageStackSpacing(msg, prevMsg);

              return (
              <div key={`${msg.id}-${index}`} className={`w-full ${stackSpacing}`}>
                <MessageBubble
                  content={msg.content}
                  isBot={msg.isBot}
                  isQuestion={msg.type === 'exercise'}
                  createdAt={msg.createdAt}
                  isFirstInGroup={isFirstInGroup}
                  isLastInGroup={isLastInGroup}
                  holdTail={tailHoldMessageIds.has(msg.id)}
                  suppressTail={tailSuppressMessageIds.has(msg.id)}
                  exerciseSeedKey={msg.seedKey ?? (isExerciseMessage(msg) ? msg.exercise?.seedKey : undefined)}
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

      <ChatInputBar
        {...commandInput}
        supportsGlobalInput={supportsGlobalInput}
        hasHydrated={hasHydrated}
        onSubmit={handleGlobalSubmit}
      />
    </div>
  );
}
