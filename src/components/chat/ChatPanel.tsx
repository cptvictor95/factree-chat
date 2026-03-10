import { useState, useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { useTable, useReducer, useSpacetimeDB } from 'spacetimedb/react';
import { Identity, Timestamp } from 'spacetimedb';
import { tables, reducers } from '../../module_bindings';
import type * as Types from '../../module_bindings/types';

interface PrettyMessage {
  senderName: string;
  text: string;
  sent: Timestamp;
  kind: 'system' | 'user';
  isOwn: boolean;
}

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

  const [offlineUsers] = useTable(tables.user.where(r => r.online.eq(false)));
  const allUsers = [...onlineUsers, ...offlineUsers];

  const currentUser = identity
    ? allUsers.find(u => u.identity.isEqual(identity))
    : null;

  const displayName =
    currentUser?.name ?? identity?.toHexString().substring(0, 8) ?? '';

  const prettyMessages: PrettyMessage[] = [...messages, ...systemMessages]
    .sort((a, b) => (a.sent.toDate() > b.sent.toDate() ? 1 : -1))
    .map(msg => {
      const sender = allUsers.find(
        u => u.identity.toHexString() === msg.sender.toHexString()
      );
      const isSystem = Identity.zero().isEqual(msg.sender);
      return {
        senderName: sender?.name ?? msg.sender.toHexString().substring(0, 8),
        text: msg.text,
        sent: msg.sent,
        kind: isSystem ? 'system' : 'user',
        isOwn: !!identity && msg.sender.isEqual(identity),
      };
    });

  // Auto-scroll to bottom when new messages arrive
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
    if (!newMessage.trim()) return;
    const text = newMessage;
    setNewMessage('');
    await sendMessage({ text });
  };

  return (
    <div className="chat-panel">
      {/* User list + name editing */}
      <div className="chat-users">
        <div className="chat-users-header">
          <span className="chat-users-count">
            {onlineUsers.length} online
          </span>
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
              <button type="submit" className="chat-name-save">✓</button>
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

      {/* Message list */}
      <div className="chat-messages">
        {prettyMessages.length === 0 && (
          <p className="chat-empty">No messages yet. Say hello!</p>
        )}
        {prettyMessages.map((msg, i) => {
          const sentDate = msg.sent.toDate();
          const timeString = sentDate.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });

          if (msg.kind === 'system') {
            return (
              <div key={i} className="chat-message chat-message--system">
                <span className="chat-message-text">{msg.text}</span>
                <span className="chat-message-time">{timeString}</span>
              </div>
            );
          }

          return (
            <div
              key={i}
              className={`chat-message chat-message--user${msg.isOwn ? ' chat-message--own' : ''}`}
            >
              <div className="chat-message-header">
                <span className="chat-message-sender">{msg.senderName}</span>
                <span className="chat-message-time">{timeString}</span>
              </div>
              <p className="chat-message-text">{msg.text}</p>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Message input */}
      <form className="chat-input-form" onSubmit={handleSubmitMessage}>
        <input
          type="text"
          className="chat-input"
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          placeholder="Say something..."
          aria-label="message input"
        />
        <button
          type="submit"
          className="chat-send-btn"
          disabled={!newMessage.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}
