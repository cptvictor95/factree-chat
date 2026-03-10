import { useEffect, useRef, useState, useCallback } from 'react';
import type { JSX } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSpacetimeDB, useReducer, useTable } from 'spacetimedb/react';
import { reducers, tables } from '@/module_bindings';
import { useBackgroundAudioKeepAlive } from '@/hooks/useBackgroundAudioKeepAlive';
import { useMediaSession } from '@/hooks/useMediaSession';
import { useYouTubeSync } from '@/hooks/useYouTubeSync';
import { DEFAULTS, STORAGE_KEYS } from '@/constants';
import { identityToColor, identityToShortId } from '@/utils/identity';
import './player.css';

const REACTION_EMOJIS = ['❤️', '🔥', '😂', '🎸', '👏', '😍'] as const;

interface FloatingReaction {
  uid: string;
  emoji: string;
  x: number;
}

function AudioViz({ isPlaying, title }: { isPlaying: boolean; title: string | null }): JSX.Element {
  return (
    <>
      <div className="audio-viz" aria-hidden="true">
        {[0.08, 0.2, 0, 0.14, 0.3].map((delay, i) => (
          <div
            key={i}
            className={`eq-bar${isPlaying ? ' eq-bar--playing' : ''}`}
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </div>
      {title && (
        <div className="audio-viz-meta">
          <p className="audio-viz-title">{title}</p>
          <p className="audio-viz-label">audio only</p>
        </div>
      )}
    </>
  );
}

function loadYouTubeAPI(): Promise<void> {
  return new Promise(resolve => {
    if (window.YT?.Player) {
      resolve();
      return;
    }

    if (!document.getElementById('yt-api-script')) {
      const script = document.createElement('script');
      script.id = 'yt-api-script';
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    }

    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
  });
}

function VolumeIcon({ volume, muted }: { volume: number; muted: boolean }): JSX.Element {
  if (muted || volume === 0) return <span className="volume-icon">🔇</span>;
  if (volume < 40) return <span className="volume-icon">🔈</span>;
  if (volume < 70) return <span className="volume-icon">🔉</span>;
  return <span className="volume-icon">🔊</span>;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function PlayerPanel(): JSX.Element {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.volume);
    return saved !== null ? parseInt(saved, 10) : DEFAULTS.volume;
  });
  const [muted, setMuted] = useState(false);
  const preMuteVolumeRef = useRef<number>(DEFAULTS.volume);

  const [videoOff, setVideoOff] = useState(
    () => localStorage.getItem(STORAGE_KEYS.videoOff) === 'true'
  );

  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  // Floating emoji reactions — each entry auto-removes after 2.2s
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const sessionStartRef = useRef<Date>(new Date());

  const { nowPlaying, onPlayerStateChange } = useYouTubeSync(playerRef, playerReady);
  const { identity } = useSpacetimeDB();
  const playNext = useReducer(reducers.playNext);
  const togglePlayback = useReducer(reducers.togglePlayback);
  const sendReaction = useReducer(reducers.sendReaction);

  // Watch reaction table — animate only reactions that arrived after we joined
  const addFloatingReaction = useCallback((emoji: string): void => {
    const uid = `${Date.now()}-${Math.random()}`;
    const x = 15 + Math.random() * 70; // 15–85% horizontal within the player
    setFloatingReactions(prev => [...prev, { uid, emoji, x }]);
    setTimeout(() => {
      setFloatingReactions(prev => prev.filter(r => r.uid !== uid));
    }, 2200);
  }, []);

  useTable(tables.reaction, {
    onInsert: reaction => {
      // Only animate reactions that arrive after we joined this session
      if (reaction.sentAt.toDate() < sessionStartRef.current) return;
      addFloatingReaction(reaction.emoji);
    },
  });

  // ── YouTube player init ────────────────────────────────────────────────────
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    let cancelled = false;

    loadYouTubeAPI().then(() => {
      if (cancelled || playerRef.current) return;

      const playerTarget = document.createElement('div');
      wrapper.appendChild(playerTarget);

      playerRef.current = new YT.Player(playerTarget, {
        height: '100%',
        width: '100%',
        playerVars: {
          autoplay: 1,
          controls: 1,
          rel: 0,
          modestbranding: 1,
        },
        events: {
          onReady: () => {
            const savedVolume = parseInt(
              localStorage.getItem(STORAGE_KEYS.volume) ?? String(DEFAULTS.volume),
              10
            );
            playerRef.current?.setVolume(savedVolume);
            setPlayerReady(true);
          },
          onStateChange: onPlayerStateChange,
        },
      });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Progress bar update ────────────────────────────────────────────────────
  useEffect(() => {
    if (!playerReady || !nowPlaying) {
      setProgress(0);
      setDuration(0);
      return;
    }

    const update = (): void => {
      const player = playerRef.current;
      if (!player) return;
      const total = player.getDuration();
      if (!total) return;
      setDuration(total);

      if (!nowPlaying.isPlaying) {
        setProgress(Number(nowPlaying.pausedAtOffset) / 1_000_000 / total);
        return;
      }

      const elapsed = (Date.now() - nowPlaying.startedAt.toDate().getTime()) / 1000;
      setProgress(Math.min(1, Math.max(0, elapsed / total)));
    };

    update();
    if (!nowPlaying.isPlaying) return;

    const interval = setInterval(update, 500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    playerReady,
    nowPlaying?.isPlaying,
    nowPlaying?.startedAt?.microsSinceUnixEpoch,
    nowPlaying?.pausedAtOffset,
    nowPlaying?.queueItemId,
  ]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const value = parseInt(e.target.value, 10);
    setVolume(value);
    localStorage.setItem(STORAGE_KEYS.volume, String(value));

    if (value === 0) {
      playerRef.current?.mute();
      setMuted(true);
    } else {
      playerRef.current?.unMute();
      playerRef.current?.setVolume(value);
      setMuted(false);
    }
  };

  const handleMuteToggle = (): void => {
    if (!playerRef.current) return;
    if (muted) {
      const restore = preMuteVolumeRef.current > 0 ? preMuteVolumeRef.current : DEFAULTS.volume;
      playerRef.current.unMute();
      playerRef.current.setVolume(restore);
      setVolume(restore);
      setMuted(false);
    } else {
      preMuteVolumeRef.current = volume > 0 ? volume : DEFAULTS.volume;
      playerRef.current.mute();
      setMuted(true);
    }
  };

  const handleSkip = (): void => {
    if (!nowPlaying) return;
    playNext({ queueItemId: nowPlaying.queueItemId });
  };

  const handlePlayPause = (): void => {
    togglePlayback();
  };

  const handleVideoToggle = (): void => {
    const next = !videoOff;
    setVideoOff(next);
    localStorage.setItem(STORAGE_KEYS.videoOff, String(next));
  };

  const handleReaction = (emoji: string): void => {
    sendReaction({ emoji });
  };

  useMediaSession({
    nowPlaying,
    isPlaying: nowPlaying?.isPlaying ?? false,
    onPlayPause: handlePlayPause,
    onSkip: handleSkip,
  });

  // Best-effort: keep a silent audio session so the browser may not pause when app is backgrounded
  useBackgroundAudioKeepAlive(Boolean(nowPlaying?.isPlaying));

  const addedByColor = nowPlaying ? identityToColor(nowPlaying.addedBy) : undefined;
  const addedByName = nowPlaying
    ? identity && nowPlaying.addedBy.isEqual(identity)
      ? 'you'
      : identityToShortId(nowPlaying.addedBy)
    : '';
  const elapsedSeconds = duration > 0 ? progress * duration : 0;

  return (
    <div className="player-panel">
      <div className={`player-embed-wrapper${videoOff ? ' player-embed-wrapper--audio-only' : ''}`}>
        {/* Floating reaction emojis — rendered within the player area */}
        <div className="reactions-overlay" aria-hidden="true">
          <AnimatePresence>
            {floatingReactions.map(r => (
              <motion.span
                key={r.uid}
                className="floating-reaction"
                style={{ left: `${r.x}%` }}
                initial={{ opacity: 0, y: 0, scale: 0.5 }}
                animate={{ opacity: [0, 1, 1, 0], y: -120, scale: [0.5, 1.3, 1.1, 0.9] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2, ease: 'easeOut' }}
              >
                {r.emoji}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>

        {!videoOff && !nowPlaying && (
          <div className="player-idle">
            <div className="vinyl-record" aria-hidden="true" />
            <p>Queue is empty</p>
            <p className="player-idle-hint">Add a YouTube URL below to start the room</p>
          </div>
        )}
        {videoOff && (
          <AudioViz isPlaying={nowPlaying?.isPlaying ?? false} title={nowPlaying?.title ?? null} />
        )}
        <div ref={wrapperRef} className="player-embed" />
      </div>

      {/* Progress bar */}
      {nowPlaying && (
        <div
          className="player-progress"
          title={duration > 0 ? `${formatTime(elapsedSeconds)} / ${formatTime(duration)}` : ''}
          aria-label="Playback progress"
        >
          <div className="player-progress-fill" style={{ width: `${progress * 100}%` }} />
          {duration > 0 && (
            <span className="player-progress-time">
              {formatTime(elapsedSeconds)} / {formatTime(duration)}
            </span>
          )}
        </div>
      )}

      {/* Reaction bar — emoji buttons, visible whenever connected */}
      <div className="player-reactions-bar">
        {REACTION_EMOJIS.map(emoji => (
          <button
            key={emoji}
            className="reaction-btn"
            onClick={() => handleReaction(emoji)}
            aria-label={`React with ${emoji}`}
            title={`Send ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>

      <div className="player-controls">
        <AnimatePresence mode="wait">
          {nowPlaying ? (
            <motion.div
              key={nowPlaying.queueItemId.toString()}
              className="now-playing-info"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <img
                src={nowPlaying.thumbnailUrl}
                alt={nowPlaying.title}
                className="now-playing-thumb"
              />
              <div className="now-playing-meta">
                <p className="now-playing-title">{nowPlaying.title}</p>
                <p className="now-playing-by">
                  added by{' '}
                  <span className="now-playing-username" style={{ color: addedByColor }}>
                    {addedByName}
                  </span>
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              className="now-playing-empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
          )}
        </AnimatePresence>

        <div className="player-actions">
          {nowPlaying && (
            <>
              <button
                className="playpause-btn"
                onClick={handlePlayPause}
                aria-label={nowPlaying.isPlaying ? 'Pause' : 'Play'}
                title={nowPlaying.isPlaying ? 'Pause (synced)' : 'Play (synced)'}
              >
                {nowPlaying.isPlaying ? '⏸' : '▶'}
              </button>
              <button
                className="skip-btn"
                onClick={handleSkip}
                aria-label="Skip song"
                title="Skip to next song"
              >
                ⏭
              </button>
            </>
          )}

          <button
            className={`video-toggle-btn${videoOff ? ' video-toggle-btn--active' : ''}`}
            onClick={handleVideoToggle}
            aria-label={videoOff ? 'Show video' : 'Hide video'}
            title={videoOff ? 'Show video' : 'Audio only (saves data)'}
          >
            {videoOff ? '[video]' : '[audio]'}
          </button>

          <div className="volume-control">
            <button
              className="volume-mute-btn"
              onClick={handleMuteToggle}
              aria-label={muted ? 'Unmute' : 'Mute'}
              title={muted ? 'Unmute' : 'Mute'}
            >
              <VolumeIcon volume={volume} muted={muted} />
            </button>
            <input
              type="range"
              className="volume-slider"
              min={0}
              max={100}
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              aria-label="Volume"
            />
            <span className="volume-value">{muted ? 0 : volume}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
