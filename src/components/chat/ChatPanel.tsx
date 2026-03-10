import { useState, useEffect, useRef, useMemo } from 'react';
import type { JSX } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTable, useReducer, useSpacetimeDB } from 'spacetimedb/react';
import { Identity, Timestamp } from 'spacetimedb';
import { tables, reducers } from '@/module_bindings';
import './chat.css';
import type * as Types from '@/module_bindings/types';

interface PrettyMessage {
  key: string;
  senderName: string;
  text: string;
  sent: Timestamp;
  kind: 'system' | 'user';
  isOwn: boolean;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const messageVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.18, ease: 'easeOut' as const } },
  exit: { opacity: 0, transition: { duration: 0.12 } },
};

export function ChatPanel(): JSX.Element {
  const [newMessage, setNewMessage] = useState('');
  const [newName, setNewName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [systemMessages, setSystemMessages] = useState<Types.Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { identity } = useSpacetimeDB();
  const setName = useReducer(reducers.setName);
  const sendMessage = useReducer(reducers.sendMessage);

  const [messages] = useTable(tables.message);

  // Only subscribe to online users — offline users are not needed for the UI.
  // Unknown message senders (e.g. users who left before we joined) fall back to
  // truncated hex, which is acceptable for this use case.
  const [onlineUsers] = useTable(
    tables.user.where(r => r.online.eq(true)),
    {
      onInsert: user => {
        const name = user.name ?? user.identity.toHexString().substring(0, 8);
        setSystemMessages(prev => [
          ...prev,
          {
            sender: Identity.zero(),
            text: `${name} joined the room`,
            sent: Timestamp.now(),
          },
        ]);
      },
      onDelete: user => {
        const name = user.name ?? user.identity.toHexString().substring(0, 8);
        setSystemMessages(prev => [
          ...prev,
          {
            sender: Identity.zero(),
            text: `${name} left the room`,
            sent: Timestamp.now(),
          },
        ]);
      },
    }
  );

  const currentUser = useMemo(
    () => (identity ? onlineUsers.find(u => u.identity.isEqual(identity)) : null),
    [identity, onlineUsers]
  );

  const displayName = currentUser?.name ?? identity?.toHexString().substring(0, 8) ?? '';

  // Merge DB messages + local system messages, sort once, and map to display shape.
  // useMemo prevents re-sorting on every render when unrelated state changes.
  const prettyMessages = useMemo<PrettyMessage[]>(() => {
    return [...messages, ...systemMessages]
      .sort((a, b) => (a.sent.toDate() > b.sent.toDate() ? 1 : -1))
      .map(msg => {
        const isSystem = Identity.zero().isEqual(msg.sender);
        const sender = isSystem ? null : onlineUsers.find(u => u.identity.isEqual(msg.sender));
        return {
          // Stable key: sender hex + microsecond timestamp avoids index-based keys
          key: `${msg.sender.toHexString()}-${msg.sent.toDate().getTime()}`,
          senderName: sender?.name ?? msg.sender.toHexString().substring(0, 8),
          text: msg.text,
          sent: msg.sent,
          kind: isSystem ? 'system' : 'user',
          isOwn: !!identity && !isSystem && msg.sender.isEqual(identity),
        };
      });
  }, [messages, systemMessages, onlineUsers, identity]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [prettyMessages.length]);

  const handleSubmitName = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setIsEditingName(false);
    setName({ name: newName });
  };

  const handleSubmitMessage = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const text = newMessage.trim();
    if (!text) return;
    setNewMessage('');
    try {
      await sendMessage({ text });
    } catch {
      // Restore the message so the user doesn't lose what they typed
      setNewMessage(text);
    }
  };

  return (
    <div className="chat-panel">
      <div className="chat-users">
        <div className="chat-users-header">
          <span className="chat-users-count">{onlineUsers.length} online</span>
          {!isEditingName ? (
            <button
              className="chat-name-btn"
              onClick={() => {
                setIsEditingName(true);
                setNewName(displayName);
              }}
              title="Change your name"
            >
              ✏ {displayName}
            </button>
          ) : (
            <form className="chat-name-form" onSubmit={handleSubmitName}>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                autoFocus
                aria-label="username input"
                className="chat-name-input"
                placeholder="Enter name..."
              />
              <button type="submit" className="chat-name-save">
                ✓
              </button>
            </form>
          )}
        </div>
        <ul className="chat-users-list">
          {onlineUsers.map(user => (
            <li key={user.identity.toHexString()} className="chat-user-item">
              <span className="chat-user-dot" />
              <span className="chat-user-name">
                {user.name ?? user.identity.toHexString().substring(0, 8)}
                {identity && user.identity.isEqual(identity) && (
                  <span className="chat-user-you"> (you)</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="chat-messages">
        {prettyMessages.length === 0 && <p className="chat-empty">No messages yet. Say hello!</p>}
        <AnimatePresence initial={false}>
          {prettyMessages.map(msg => {
            const timeString = formatTime(msg.sent.toDate());

            if (msg.kind === 'system') {
              return (
                <motion.div
                  key={msg.key}
                  className="chat-message chat-message--system"
                  variants={messageVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <span className="chat-message-text">{msg.text}</span>
                  <span className="chat-message-time">{timeString}</span>
                </motion.div>
              );
            }

            return (
              <motion.div
                key={msg.key}
                className={`chat-message chat-message--user${msg.isOwn ? ' chat-message--own' : ''}`}
                variants={messageVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <div className="chat-message-header">
                  <span className="chat-message-sender">{msg.senderName}</span>
                  <span className="chat-message-time">{timeString}</span>
                </div>
                <p className="chat-message-text">{msg.text}</p>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={handleSubmitMessage}>
        <input
          type="text"
          className="chat-input"
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          placeholder="Say something…"
          aria-label="message input"
        />
        <button type="submit" className="chat-send-btn" disabled={!newMessage.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
