/** Central TanStack Query key factory. */
export const queryKeys = {
  conversations: {
    all: ['conversations'] as const,
    list: () => ['conversations', 'list'] as const,
    detail: (id: string) => ['conversations', 'detail', id] as const,
  },
  /** `conversationKey` is a conversation id, or 'new' for an unsaved chat. */
  messages: (conversationKey: string) => ['messages', conversationKey] as const,
  models: () => ['models'] as const,
  profiles: {
    all: ['profiles'] as const,
    list: () => ['profiles', 'list'] as const,
  },
  /** Every pending suggestion (all profiles): card badges and the detail view read the same list. */
  profileSuggestions: {
    pending: () => ['profileSuggestions', 'pending'] as const,
  },
};
