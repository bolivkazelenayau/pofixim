import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Message } from '@/store/chatStore';

type TailHandoffAuthor = 'bot' | 'user';

type TailHandoff = {
  previousId: string;
  currentId: string;
  timer: ReturnType<typeof setTimeout>;
};

type UseChatTailHandoffOptions = {
  messages: Message[];
  hasHydrated: boolean;
  messageEnterDurationMs: number;
};

const TAIL_HANDOFF_RATIO = 0.25;

export function isGroupedMessagePair(previous: Message | undefined, current: Message | undefined) {
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

export function useChatTailHandoff({
  messages,
  hasHydrated,
  messageEnterDurationMs,
}: UseChatTailHandoffOptions) {
  const handoffMs = Math.round(messageEnterDurationMs * TAIL_HANDOFF_RATIO);
  const previousMessagesRef = useRef<Message[]>([]);
  const hasInitializedTailTrackingRef = useRef(false);
  const tailHandoffsRef = useRef(new Map<TailHandoffAuthor, TailHandoff>());
  const [tailHoldMessageIds, setTailHoldMessageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [tailSuppressMessageIds, setTailSuppressMessageIds] = useState<Set<string>>(
    () => new Set(),
  );

  const clearTailHandoffTimers = useCallback(() => {
    tailHandoffsRef.current.forEach(({ timer }) => clearTimeout(timer));
    tailHandoffsRef.current.clear();
  }, []);

  const clearTailHandoffState = useCallback(() => {
    clearTailHandoffTimers();
    setTailHoldMessageIds((current) => (current.size > 0 ? new Set() : current));
    setTailSuppressMessageIds((current) => (current.size > 0 ? new Set() : current));
  }, [clearTailHandoffTimers]);

  const resetTailHandoffState = useCallback(() => {
    clearTailHandoffState();
    previousMessagesRef.current = [];
    hasInitializedTailTrackingRef.current = false;
  }, [clearTailHandoffState]);

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
      resetTailHandoffState();
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
          }, handoffMs);

          tailHandoffsRef.current.set(author, { previousId, currentId, timer });
        });
      }
    }

    previousMessagesRef.current = messages;
  }, [clearTailHandoffState, hasHydrated, handoffMs, messages, resetTailHandoffState]);

  useEffect(() => clearTailHandoffTimers, [clearTailHandoffTimers]);

  return {
    tailHoldMessageIds,
    tailSuppressMessageIds,
    resetTailHandoffState,
  };
}
