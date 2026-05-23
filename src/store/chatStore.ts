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
  resetProgress: () => void;
};

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

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [
        {
          id: 'welcome',
          isBot: true,
          content: WELCOME_TEXT,
          type: 'text',
        },
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

          return { messages: [...state.messages, msg] };
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
            score: state.score + scoreDelta,
            streak: isCorrect ? streak : 0,
          };
        }),
      resetProgress: () =>
        set({
          messages: [
            {
              id: 'welcome',
              isBot: true,
              content: pickRandom(RESTART_TEXTS),
              type: 'text',
            },
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
      migrate: (persistedState) => {
        const state = (persistedState ?? {}) as Partial<ChatState>;
        const messages = Array.isArray(state.messages)
          ? state.messages.filter((message) => message.type !== 'question')
          : [];

        return {
          ...state,
          messages:
            messages.length > 0
              ? messages
              : [
                  {
                    id: 'welcome',
                    isBot: true,
                    content: WELCOME_TEXT,
                    type: 'text' as const,
                  },
                ],
          seenQuestionIds: [],
          cooldownExerciseIds: Array.isArray(state.cooldownExerciseIds)
            ? state.cooldownExerciseIds.filter((id): id is number => Number.isInteger(id))
            : [],
        };
      },
    },
  ),
);

