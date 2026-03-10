import { StrictMode, useCallback, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import type { Identity } from 'spacetimedb';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { DbConnection } from './module_bindings/index.ts';
import type { ErrorContext } from './module_bindings/index.ts';
import { STORAGE_KEYS } from './constants';
import { ReconnectContext } from './contexts/ReconnectContext';

const HOST = import.meta.env.VITE_SPACETIMEDB_HOST ?? 'ws://localhost:3000';
const DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? 'quickstart-chat';
const TOKEN_KEY = STORAGE_KEYS.authToken(HOST, DB_NAME);

function Root(): React.ReactElement {
  const [connectionKey, setConnectionKey] = useState(0);

  const connectionBuilder = useMemo(() => {
    return DbConnection.builder()
      .withUri(HOST)
      .withDatabaseName(DB_NAME)
      .withToken(localStorage.getItem(TOKEN_KEY) ?? undefined)
      .onConnect((_conn: DbConnection, identity: Identity, token: string) => {
        localStorage.setItem(TOKEN_KEY, token);
        console.log('Connected to SpacetimeDB with identity:', identity.toHexString());
      })
      .onDisconnect(() => {
        console.log('Disconnected from SpacetimeDB');
      })
      .onConnectError((_ctx: ErrorContext, err: Error) => {
        console.log('Error connecting to SpacetimeDB:', err);
      });
  }, [connectionKey]);

  const reconnect = useCallback(() => {
    setConnectionKey(k => k + 1);
  }, []);

  return (
    <ReconnectContext.Provider value={{ reconnect }}>
      <SpacetimeDBProvider key={connectionKey} connectionBuilder={connectionBuilder}>
        <App />
      </SpacetimeDBProvider>
    </ReconnectContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
