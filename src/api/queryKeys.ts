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
    /** Every suggestion (all statuses): the UI shows the newest per group while it is pending. */
    list: () => ['profileSuggestions', 'list'] as const,
  },
  meetings: {
    list: () => ['meetings', 'list'] as const,
    detail: (id: string) => ['meetings', 'detail', id] as const,
    connection: () => ['meetings', 'connection'] as const,
  },
  whatsapp: () => ['whatsapp'] as const,
  projects: {
    list: () => ['projects', 'list'] as const,
    detail: (id: string) => ['projects', 'detail', id] as const,
  },
  calendar: {
    events: () => ['calendar', 'events'] as const,
    upcoming: () => ['calendar', 'upcoming'] as const,
    tasks: () => ['calendar', 'tasks'] as const,
  },
};
