import { useCallback } from 'react';

import { buildStatsMessageContent } from '@/lib/chatStats';
import { createMessageId } from '@/lib/message-id';
import type { Message } from '@/store/chatStore';

type UseChatStatsMessageOptions = {
  addMessage: (message: Message) => void;
  score: number;
  streak: number;
};

export function useChatStatsMessage({
  addMessage,
  score,
  streak,
}: UseChatStatsMessageOptions) {
  return useCallback(() => {
    addMessage({
      id: createMessageId('stats'),
      isBot: true,
      content: buildStatsMessageContent(score, streak),
      type: 'text',
    });
  }, [addMessage, score, streak]);
}
