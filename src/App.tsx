import { useState } from 'react';
import type { JSX } from 'react';
import { useTable, useSpacetimeDB } from 'spacetimedb/react';
import { motion, AnimatePresence } from 'framer-motion';
import { tables } from './module_bindings';
import { PlayerPanel } from './components/player/PlayerPanel';
import { QueuePanel } from './components/queue/QueuePanel';
import { ChatPanel } from './components/chat/ChatPanel';
import './App.css';

type MobileTab = 'queue' | 'chat';

function JoinSplash({ onJoin }: { onJoin: () => void }): JSX.Element {
  return (
    <motion.div
      className="join-splash"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="join-splash-content">
        <motion.div
          className="join-vinyl"
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          aria-hidden="true"
        />
        <h1 className="join-logo">factree.fm</h1>
        <p className="join-tagline">Your private listening room</p>
        <motion.button
          className="join-btn"
          onClick={onJoin}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
        >
          Join the room →
        </motion.button>
      </div>
    </motion.div>
  );
}

function App(): JSX.Element {
  const { isActive: connected } = useSpacetimeDB();
  const [hasJoined, setHasJoined] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('queue');
  const [onlineUsers] = useTable(tables.user.where(r => r.online.eq(true)));
  const [queueItems] = useTable(tables.queue_item);

  if (!connected) {
    return (
      <motion.div
        className="connecting"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <motion.span
          className="connecting-logo"
          animate={{ opacity: [1, 0.35, 1] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          factree.fm
        </motion.span>
        <p className="connecting-text">Connecting to the room…</p>
      </motion.div>
    );
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

      {/* Flat children let CSS grid areas place them freely on desktop and
          stack them as a flex column on mobile without extra wrappers. */}
      <div className="app">
        <header className="app-header">
          <span className="app-logo">factree.fm</span>
          <span className="app-online-count">
            <span className="app-online-dot" aria-hidden="true" />
            {onlineUsers.length} {onlineUsers.length === 1 ? 'person' : 'people'} listening
          </span>
        </header>

        <div className="app-player">
          <PlayerPanel />
        </div>

        {/* Visible only on mobile — CSS hides it on desktop */}
        <nav className="app-mobile-tabs" aria-label="View">
          <button
            className={`app-tab-btn${mobileTab === 'queue' ? ' app-tab-btn--active' : ''}`}
            onClick={() => setMobileTab('queue')}
          >
            Up Next
            {queueItems.length > 0 && <span className="app-tab-badge">{queueItems.length}</span>}
          </button>
          <button
            className={`app-tab-btn${mobileTab === 'chat' ? ' app-tab-btn--active' : ''}`}
            onClick={() => setMobileTab('chat')}
          >
            Chat
          </button>
        </nav>

        {/* data-mobile-active drives show/hide inside the mobile media query */}
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
