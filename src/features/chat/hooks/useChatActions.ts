import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useApi } from '@/api';
import { createChatActions, type ChatActions } from '../lib/chatStream';

export function useChatActions(): ChatActions {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMemo(() => createChatActions({ api, queryClient }), [api, queryClient]);
}
