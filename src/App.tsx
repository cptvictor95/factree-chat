import { useTable, useSpacetimeDB } from 'spacetimedb/react';
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
      <div className="connecting">
        <p>Connecting to the room...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-logo">factree.fm</span>
        <span className="app-online-count">
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
