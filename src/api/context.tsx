import { createContext, useContext, type ReactNode } from 'react';
import type { ApiAdapter } from './services';

const ApiContext = createContext<ApiAdapter | null>(null);

/** Provides the active adapter (mock today, HTTP later). Tests inject a fast mock. */
export function ApiProvider({ adapter, children }: { adapter: ApiAdapter; children: ReactNode }) {
  return <ApiContext.Provider value={adapter}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiAdapter {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <ApiProvider>');
  return api;
}
