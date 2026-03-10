import type { JSX } from 'react';
import { useTable, useSpacetimeDB } from 'spacetimedb/react';
import { motion } from 'framer-motion';
import { tables } from './module_bindings';
import { PlayerPanel } from './components/player/PlayerPanel';
import { QueuePanel } from './components/queue/QueuePanel';
import { ChatPanel } from './components/chat/ChatPanel';
import './App.css';

function App(): JSX.Element {
  const { isActive: connected } = useSpacetimeDB();
  const [onlineUsers] = useTable(tables.user.where(r => r.online.eq(true)));

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
    <div className="app">
      <header className="app-header">
        <span className="app-logo">factree.fm</span>
        <span className="app-online-count">
          <span className="app-online-dot" aria-hidden="true" />
          {onlineUsers.length} {onlineUsers.length === 1 ? 'person' : 'people'} listening
        </span>
      </header>

      <main className="app-main">
        <div className="app-player">
          <PlayerPanel />
        </div>
        <div className="app-chat">
          <ChatPanel />
        </div>
      </main>

      <footer className="app-queue">
        <QueuePanel />
      </footer>
    </div>
  );
}

export default App;
