import { useEffect, useRef } from 'react';
import type * as Types from '@/module_bindings/types';

interface UseMediaSessionOptions {
  nowPlaying: Types.NowPlaying | null;
  isPlaying: boolean;
  onPlayPause: () => void;
  onSkip: () => void;
}

/**
 * Wires the Media Session API so the current track and play/pause/skip
 * appear on the device lock screen and in the notification/control center.
 * Helps keep playback usable when the app is in background or screen is locked
 * (especially on Android with PWA installed).
 */
export function useMediaSession({
  nowPlaying,
  isPlaying,
  onPlayPause,
  onSkip,
}: UseMediaSessionOptions): void {
  const onPlayPauseRef = useRef(onPlayPause);
  const onSkipRef = useRef(onSkip);
  onPlayPauseRef.current = onPlayPause;
  onSkipRef.current = onSkip;

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const nav = navigator as Navigator & { mediaSession: MediaSession };

    if (nowPlaying) {
      nav.mediaSession.metadata = new MediaMetadata({
        title: nowPlaying.title,
        artist: 'factree.fm',
        artwork: nowPlaying.thumbnailUrl
          ? [{ src: nowPlaying.thumbnailUrl, sizes: 'default', type: 'image/jpeg' }]
          : [],
      });
      nav.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } else {
      nav.mediaSession.metadata = null;
      nav.mediaSession.playbackState = 'none';
    }

    nav.mediaSession.setActionHandler('play', () => {
      onPlayPauseRef.current();
    });
    nav.mediaSession.setActionHandler('pause', () => {
      onPlayPauseRef.current();
    });
    nav.mediaSession.setActionHandler('stop', () => {
      onPlayPauseRef.current();
    });
    nav.mediaSession.setActionHandler('nexttrack', () => {
      onSkipRef.current();
    });
    nav.mediaSession.setActionHandler('previoustrack', null);

    return () => {
      nav.mediaSession.setActionHandler('play', null);
      nav.mediaSession.setActionHandler('pause', null);
      nav.mediaSession.setActionHandler('stop', null);
      nav.mediaSession.setActionHandler('nexttrack', null);
    };
  }, [nowPlaying, isPlaying]);
}
