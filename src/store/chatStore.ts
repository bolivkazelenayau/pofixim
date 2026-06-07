import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Exercise } from '@/features/exercises/schemas';

export type Message = {
  id: string;
  isBot: boolean;
  content: string;
  type: 'text' | 'question' | 'exercise';
  questionId?: number;
  options?: string[];
  correctOptionIndex?: number;
  explanation?: string;
  exercise?: Exercise;
  createdAt?: number;
};

type ChatState = {
  messages: Message[];
  seenQuestionIds: number[];
  seenExerciseIds: number[];
  cooldownExerciseIds: number[];
  answeredExerciseIds: number[];
  sessionId?: string;
  hasRequestedInitialExercise: boolean;
  score: number;
  streak: number;
  isTyping: boolean;
  addMessage: (msg: Message) => void;
  markExercisePresented: (exerciseId: number) => void;
  setTyping: (typing: boolean) => void;
  setSessionId: (sessionId: string) => void;
  markInitialExerciseRequested: () => void;
  recordAnswer: (questionId: number, isCorrect: boolean) => void;
  recordExerciseResult: (input: {
    exerciseId: number;
    isCorrect: boolean;
    scoreDelta: number;
    streak: number;
  }) => void;
  recordBlitzScore: (scoreDelta: number) => void;
  spendScore: (amount: number) => void;
  resetProgress: () => void;
};

type PersistedChatState = Pick<
  ChatState,
  | 'messages'
  | 'seenQuestionIds'
  | 'seenExerciseIds'
  | 'cooldownExerciseIds'
  | 'answeredExerciseIds'
  | 'sessionId'
  | 'hasRequestedInitialExercise'
  | 'score'
  | 'streak'
>;

const WELCOME_TEXTS = [
  'Привет! Потренируем орфографию и пунктуацию: начнем с коротких заданий и постепенно усложним, если ответы будут уверенными.',
  'Стартуем мягко: сначала компактные задачи, затем более контекстные. Темп подстрою по твоим ответам.',
  'Готово к практике: даю сначала быстрые задания, потом добавляю сложность по мере стабильных ответов.',
] as const;

const RESTART_TEXTS = [
  'Начинаем заново: сначала короткие задания, затем более контекстные, если ответы идут уверенно.',
  'Перезапуск тренировки: вначале быстрые упражнения, дальше — сложнее по результату.',
  'Стартуем с нуля: беру короткие задания и постепенно повышаю сложность.',
] as const;

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] ?? items[0];
}

const WELCOME_TEXT = WELCOME_TEXTS[0];

function createWelcomeMessage(content: string = WELCOME_TEXT): Message {
  return {
    id: 'welcome',
    isBot: true,
    content,
    type: 'text',
    createdAt: Date.now(),
  };
}

function integerArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((id): id is number => Number.isInteger(id))
    : [];
}

function normalizePersistedChatState(
  persistedState: unknown,
): Partial<PersistedChatState> {
  const state = (persistedState ?? {}) as Partial<ChatState>;
  const messages = Array.isArray(state.messages)
    ? state.messages.filter((message) => message.type !== 'question')
    : [];

  return {
    messages: messages.length > 0 ? messages : [createWelcomeMessage()],
    seenQuestionIds: integerArray(state.seenQuestionIds),
    seenExerciseIds: integerArray(state.seenExerciseIds),
    cooldownExerciseIds: integerArray(state.cooldownExerciseIds).slice(-200),
    answeredExerciseIds: integerArray(state.answeredExerciseIds),
    sessionId:
      typeof state.sessionId === 'string' && state.sessionId.length > 0
        ? state.sessionId
        : undefined,
    hasRequestedInitialExercise:
      typeof state.hasRequestedInitialExercise === 'boolean'
        ? state.hasRequestedInitialExercise
        : false,
    score: typeof state.score === 'number' ? state.score : 0,
    streak: typeof state.streak === 'number' ? state.streak : 0,
  };
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [
        createWelcomeMessage(),
      ],
      seenQuestionIds: [],
      seenExerciseIds: [],
      cooldownExerciseIds: [],
      answeredExerciseIds: [],
      sessionId: undefined,
      hasRequestedInitialExercise: false,
      score: 0,
      streak: 0,
      isTyping: false,
      addMessage: (msg) =>
        set((state) => {
          if (
            msg.type === 'exercise' &&
            msg.exercise?.id &&
            state.messages.some(
              (message) =>
                message.type === 'exercise' &&
                message.exercise?.id === msg.exercise?.id,
            )
          ) {
            return state;
          }

          const messageWithTimestamp = msg.createdAt ? msg : { ...msg, createdAt: Date.now() };

          return { messages: [...state.messages, messageWithTimestamp] };
        }),
      markExercisePresented: (exerciseId) =>
        set((state) => ({
          seenExerciseIds: [...new Set([...state.seenExerciseIds, exerciseId])],
          cooldownExerciseIds: [
            ...new Set([...state.cooldownExerciseIds, exerciseId]),
          ].slice(-200),
        })),
      setTyping: (typing) => set({ isTyping: typing }),
      setSessionId: (sessionId) => set({ sessionId }),
      markInitialExerciseRequested: () =>
        set({ hasRequestedInitialExercise: true }),
      recordAnswer: (questionId, isCorrect) =>
        set((state) => ({
          seenQuestionIds: [...state.seenQuestionIds, questionId],
          score: state.score + (isCorrect ? 10 : 0),
          streak: isCorrect ? state.streak + 1 : 0,
        })),
      recordExerciseResult: ({ exerciseId, isCorrect, scoreDelta, streak }) =>
        set((state) => {
          const seenExerciseIds = [...new Set([...state.seenExerciseIds, exerciseId])];
          const cooldownExerciseIds = [
            ...new Set([...state.cooldownExerciseIds, exerciseId]),
          ].slice(-150);
          return {
            seenExerciseIds,
            cooldownExerciseIds,
            answeredExerciseIds: [
              ...new Set([...state.answeredExerciseIds, exerciseId]),
            ],
            score: Math.max(0, state.score + scoreDelta),
            streak: isCorrect ? streak : 0,
          };
        }),
      recordBlitzScore: (scoreDelta) =>
        set((state) => ({
          score: Math.max(0, state.score + Math.round(scoreDelta)),
        })),
      spendScore: (amount) =>
        set((state) => ({
          score: state.score - amount,
        })),
      resetProgress: () =>
        set({
          messages: [
            createWelcomeMessage(pickRandom(RESTART_TEXTS)),
          ],
          seenQuestionIds: [],
          seenExerciseIds: [],
          answeredExerciseIds: [],
          sessionId: undefined,
          hasRequestedInitialExercise: false,
          score: 0,
          streak: 0,
        }),
    }),
    {
      name: 'literacy-chat-storage-v2',
      version: 3,
      skipHydration: true,
      partialize: (state): PersistedChatState => ({
        messages: state.messages,
        seenQuestionIds: state.seenQuestionIds,
        seenExerciseIds: state.seenExerciseIds,
        cooldownExerciseIds: state.cooldownExerciseIds,
        answeredExerciseIds: state.answeredExerciseIds,
        sessionId: state.sessionId,
        hasRequestedInitialExercise: state.hasRequestedInitialExercise,
        score: state.score,
        streak: state.streak,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...normalizePersistedChatState(persistedState),
        isTyping: false,
      }),
      migrate: (persistedState) => {
        return normalizePersistedChatState(persistedState);
      },
    },
  ),
);

