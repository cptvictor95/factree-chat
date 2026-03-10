import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useTable, useSpacetimeDB } from 'spacetimedb/react';
import { motion, AnimatePresence } from 'framer-motion';
import { tables } from '@/module_bindings';
import type { MobileTab } from '@/types';
import { AppHeader, ConnectingScreen, JoinSplash, MobileTabs } from '@/components/layout';
import { ChatPanel } from '@/components/chat';
import { PlayerPanel } from '@/components/player';
import { QueuePanel } from '@/components/queue';
import { useReconnect } from '@/contexts/ReconnectContext';
import './App.css';

function App(): JSX.Element {
  const { isActive: connected } = useSpacetimeDB();
  const { reconnect } = useReconnect();
  const reconnectingRef = useRef(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('queue');
  const [onlineUsers] = useTable(tables.user.where(r => r.online.eq(true)));
  const [queueItems] = useTable(tables.queue_item);

  // When the user returns to the app and we're disconnected (e.g. WebSocket dropped in background),
  // trigger a reconnect so the chat session and messages/reactions come back without a full refresh.
  useEffect(() => {
    const onVisibilityChange = (): void => {
      if (document.visibilityState !== 'visible') return;
      if (connected) return;
      if (reconnectingRef.current) return;
      reconnectingRef.current = true;
      reconnect();
      // Allow another reconnect after a short delay (e.g. if first attempt fails)
      setTimeout(() => {
        reconnectingRef.current = false;
      }, 3000);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [connected, reconnect]);

  if (!connected) {
    return <ConnectingScreen />;
  }

  return (
    <>
      <AnimatePresence>
        {!hasJoined && (
          <motion.div
            key="splash"
            exit={{ opacity: 0, scale: 1.04 }}
            transition={{ duration: 0.35 }}
            style={{ position: 'fixed', inset: 0, zIndex: 1000 }}
          >
            <JoinSplash onJoin={() => setHasJoined(true)} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="app">
        <AppHeader onlineCount={onlineUsers.length} />

        <div className="app-player">
          <PlayerPanel />
        </div>

        <MobileTabs
          activeTab={mobileTab}
          onTabChange={setMobileTab}
          queueCount={queueItems.length}
        />

        <div className="app-chat" data-mobile-active={mobileTab === 'chat'}>
          <ChatPanel />
        </div>

        <div className="app-queue" data-mobile-active={mobileTab === 'queue'}>
          <QueuePanel />
        </div>
      </div>
    </>
  );
}

export default App;
