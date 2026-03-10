import { createContext, useContext } from 'react';

export interface ReconnectContextValue {
  reconnect: () => void;
}

export const ReconnectContext = createContext<ReconnectContextValue | null>(null);

export function useReconnect(): ReconnectContextValue {
  const ctx = useContext(ReconnectContext);
  if (!ctx) throw new Error('useReconnect must be used within ReconnectContext.Provider');
  return ctx;
}
