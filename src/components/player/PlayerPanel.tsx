import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSpacetimeDB, useReducer } from 'spacetimedb/react';
import { reducers } from '@/module_bindings';
import { useYouTubeSync } from '@/hooks/useYouTubeSync';
import { DEFAULTS, STORAGE_KEYS } from '@/constants';
import './player.css';

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
  // The wrapper div is React-controlled. We manually append the YT target element
  // inside it so YouTube can replace it with an iframe without React interfering.
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

  // Progress bar state: 0–1 fraction and total duration in seconds
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const { nowPlaying, onPlayerStateChange } = useYouTubeSync(playerRef, playerReady);
  const { identity } = useSpacetimeDB();
  const playNext = useReducer(reducers.playNext);
  const togglePlayback = useReducer(reducers.togglePlayback);

  // ── YouTube player init ────────────────────────────────────────────────────
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    let cancelled = false;

    loadYouTubeAPI().then(() => {
      if (cancelled || playerRef.current) return;

      // Create the target element manually — React never knows about it.
      // YouTube replaces this div with an <iframe>. Since it's outside React's
      // virtual DOM tree, there's no reconciliation conflict.
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
    // onPlayerStateChange is stable (useCallback with no deps in the hook)
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
    // Intentional: deps are primitive extractions from nowPlaying to avoid running
    // on every render (useTable returns a new object reference each time).
    // The full nowPlaying object is accessed inside via closure — safe because the
    // effect re-runs whenever any of these meaningful values actually change.
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

  const addedByName = nowPlaying?.addedBy.toHexString().substring(0, 8) ?? '';
  const elapsedSeconds = duration > 0 ? progress * duration : 0;

  return (
    <div className="player-panel">
      <div className={`player-embed-wrapper${videoOff ? ' player-embed-wrapper--audio-only' : ''}`}>
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
        {/* wrapperRef div is always in the DOM — no display toggling.
            YouTube creates its <iframe> inside here, outside React's tree.
            In audio-only mode the embed is rendered at 1px via CSS but stays
            in the DOM so YouTube keeps the audio stream alive. */}
        <div ref={wrapperRef} className="player-embed" />
      </div>

      {/* Progress bar — sits between embed and controls, spans full width */}
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
                  <span className="now-playing-username">
                    {identity && nowPlaying.addedBy.isEqual(identity) ? 'you' : addedByName}
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
