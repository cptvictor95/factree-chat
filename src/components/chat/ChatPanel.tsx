import { useState, useEffect, useRef, useMemo } from 'react';
import type { JSX } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTable, useReducer, useSpacetimeDB } from 'spacetimedb/react';
import { Identity, Timestamp } from 'spacetimedb';
import { tables, reducers } from '../../module_bindings';
import type * as Types from '../../module_bindings/types';
import { identityToColor, identityToShortId } from '../../utils/identity';

interface PrettyMessage {
  key: string;
  senderIdentity: Identity;
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

function TypingDots(): JSX.Element {
  return (
    <span className="typing-dots" aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}

export function ChatPanel(): JSX.Element {
  const [newMessage, setNewMessage] = useState('');
  const [newName, setNewName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [systemMessages, setSystemMessages] = useState<Types.Message[]>([]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Typing indicator: track if we're currently broadcasting a typing status.
  // We debounce stop_typing to avoid calling it too aggressively.
  const isTypingRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { identity } = useSpacetimeDB();
  const setName = useReducer(reducers.setName);
  const sendMessage = useReducer(reducers.sendMessage);
  const startTyping = useReducer(reducers.startTyping);
  const stopTyping = useReducer(reducers.stopTyping);
  const clearChat = useReducer(reducers.clearChat);

  const [messages] = useTable(tables.message);
  const [typingRows] = useTable(tables.typing);
  const [roomSettingsRows] = useTable(tables.room_settings);

  const [onlineUsers] = useTable(
    tables.user.where(r => r.online.eq(true)),
    {
      onInsert: user => {
        const name = user.name ?? identityToShortId(user.identity);
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
        const name = user.name ?? identityToShortId(user.identity);
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

  // Who is typing right now (excluding ourselves)?
  const typingOthers = useMemo(() => {
    const now = Date.now();
    return typingRows.filter(t => {
      if (identity && t.identity.isEqual(identity)) return false;
      // Stale if the typing_at is older than 5 seconds (in case stop_typing was missed)
      const ageMs = now - Number(t.typingAt.microsSinceUnixEpoch / 1000n);
      return ageMs < 5000;
    });
  }, [typingRows, identity]);

  const typingLabel = useMemo(() => {
    if (typingOthers.length === 0) return null;
    const names = typingOthers.map(t => {
      const user = onlineUsers.find(u => u.identity.isEqual(t.identity));
      return user?.name ?? identityToShortId(t.identity);
    });
    return `${names.join(', ')} is typing…`;
  }, [typingOthers, onlineUsers]);

  // The soft-clear timestamp — messages older than this are hidden
  const clearTime = roomSettingsRows[0]?.messagesClearedAt ?? null;

  const prettyMessages = useMemo<PrettyMessage[]>(() => {
    return [...messages, ...systemMessages]
      .sort((a, b) => (a.sent.toDate() > b.sent.toDate() ? 1 : -1))
      .filter(msg => {
        if (!clearTime) return true;
        return msg.sent.toDate() > clearTime.toDate();
      })
      .map(msg => {
        const isSystem = Identity.zero().isEqual(msg.sender);
        const sender = isSystem ? null : onlineUsers.find(u => u.identity.isEqual(msg.sender));
        return {
          key: `${msg.sender.toHexString()}-${msg.sent.toDate().getTime()}`,
          senderIdentity: msg.sender,
          senderName: sender?.name ?? identityToShortId(msg.sender),
          text: msg.text,
          sent: msg.sent,
          kind: isSystem ? 'system' : 'user',
          isOwn: !!identity && !isSystem && msg.sender.isEqual(identity),
        };
      });
  }, [messages, systemMessages, onlineUsers, identity, clearTime]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [prettyMessages.length]);

  // Clean up typing status when component unmounts
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (isTypingRef.current) {
        isTypingRef.current = false;
        stopTyping();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setNewMessage(e.target.value);
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      startTyping();
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      stopTyping();
    }, 2500);
  };

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
    // Stop typing indicator immediately on send
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      stopTyping();
    }
    try {
      await sendMessage({ text });
    } catch {
      setNewMessage(text);
    }
  };

  const handleClearChat = (): void => {
    clearChat();
    setSystemMessages([]);
    setShowClearConfirm(false);
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
                placeholder="Enter name…"
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
              <span
                className="chat-user-dot"
                style={{ background: identityToColor(user.identity) }}
              />
              <span className="chat-user-name" style={{ color: identityToColor(user.identity) }}>
                {user.name ?? identityToShortId(user.identity)}
                {identity && user.identity.isEqual(identity) && (
                  <span className="chat-user-you"> (you)</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="chat-messages-container">
        <div className="chat-messages-header">
          <span className="chat-messages-label">Messages</span>
          {showClearConfirm ? (
            <span className="chat-clear-confirm">
              <span>Clear all?</span>
              <button className="chat-clear-yes" onClick={handleClearChat}>
                Yes
              </button>
              <button className="chat-clear-no" onClick={() => setShowClearConfirm(false)}>
                No
              </button>
            </span>
          ) : (
            <button
              className="chat-clear-btn"
              onClick={() => setShowClearConfirm(true)}
              title="Clear chat"
            >
              Clear
            </button>
          )}
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
                    <span
                      className="chat-message-sender"
                      style={{ color: identityToColor(msg.senderIdentity) }}
                    >
                      {msg.senderName}
                    </span>
                    <span className="chat-message-time">{timeString}</span>
                  </div>
                  <p className="chat-message-text">{msg.text}</p>
                </motion.div>
              );
            })}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {typingLabel && (
          <div className="chat-typing-indicator">
            <TypingDots />
            <span>{typingLabel}</span>
          </div>
        )}
      </div>

      <form className="chat-input-form" onSubmit={handleSubmitMessage}>
        <input
          type="text"
          className="chat-input"
          value={newMessage}
          onChange={handleMessageChange}
          onBlur={() => {
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            if (isTypingRef.current) {
              isTypingRef.current = false;
              stopTyping();
            }
          }}
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
