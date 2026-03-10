import { useState } from 'react';
import type { JSX } from 'react';
import { useTable, useSpacetimeDB } from 'spacetimedb/react';
import { motion, AnimatePresence } from 'framer-motion';
import { tables } from '@/module_bindings';
import type { MobileTab } from '@/types';
import { AppHeader, ConnectingScreen, JoinSplash, MobileTabs } from '@/components/layout';
import { ChatPanel } from '@/components/chat';
import { PlayerPanel } from '@/components/player';
import { QueuePanel } from '@/components/queue';
import './App.css';

function App(): JSX.Element {
  const { isActive: connected } = useSpacetimeDB();
  const [hasJoined, setHasJoined] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('queue');
  const [onlineUsers] = useTable(tables.user.where(r => r.online.eq(true)));
  const [queueItems] = useTable(tables.queue_item);

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
