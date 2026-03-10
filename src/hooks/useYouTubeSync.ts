import { useCallback, useEffect, useRef } from 'react';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '@/module_bindings';
import type * as Types from '@/module_bindings/types';

interface UseYouTubeSyncResult {
  nowPlaying: Types.NowPlaying | null;
  onPlayerStateChange: (event: YT.OnStateChangeEvent) => void;
}

// Manages synchronized YouTube playback via SpacetimeDB now_playing state.
//
// Sync cases handled:
//   1. New song      → loadVideoById at elapsed position and play
//   2. Pause         → is_playing becomes false → seek to paused_at_offset, pauseVideo()
//   3. Resume        → is_playing becomes true  → seek to new elapsed from updated
//                      started_at, playVideo()
//   4. Late joiner   → initial render with an already-playing/paused now_playing row
//                      → same logic applies since refs start as null
//
// On video end: calls play_next. SpacetimeDB serialises reducer calls so only the
// first client whose queueItemId still matches advances playback; the rest are no-ops.
export function useYouTubeSync(
  playerRef: React.MutableRefObject<YT.Player | null>,
  playerReady: boolean
): UseYouTubeSyncResult {
  const [nowPlayingRows] = useTable(tables.now_playing);
  const playNext = useReducer(reducers.playNext);

  const nowPlaying = nowPlayingRows[0] ?? null;

  // Stable refs — avoid stale closures in the onPlayerStateChange callback
  const nowPlayingRef = useRef<Types.NowPlaying | null>(nowPlaying);
  nowPlayingRef.current = nowPlaying;

  const playNextRef = useRef(playNext);
  playNextRef.current = playNext;

  // Track what we last synced so we can detect meaningful changes
  const lastSyncedIdRef = useRef<bigint | null>(null);
  const lastIsPlayingRef = useRef<boolean | null>(null);
  const lastStartedAtMicrosRef = useRef<bigint | null>(null);

  useEffect(() => {
    if (!playerReady) return;
    const player = playerRef.current;
    if (!player || !nowPlaying) return;

    const isNewSong = lastSyncedIdRef.current !== nowPlaying.queueItemId;
    const isPlayingChanged = lastIsPlayingRef.current !== nowPlaying.isPlaying;
    // started_at changes server-side on resume to encode the new offset
    const startedAtChanged =
      lastStartedAtMicrosRef.current !== nowPlaying.startedAt.microsSinceUnixEpoch;

    if (!isNewSong && !isPlayingChanged && !startedAtChanged) return;

    lastSyncedIdRef.current = nowPlaying.queueItemId;
    lastIsPlayingRef.current = nowPlaying.isPlaying;
    lastStartedAtMicrosRef.current = nowPlaying.startedAt.microsSinceUnixEpoch;

    if (isNewSong) {
      // New track: load and start from the synced elapsed position
      const elapsedSeconds = (Date.now() - nowPlaying.startedAt.toDate().getTime()) / 1000;
      player.loadVideoById({
        videoId: nowPlaying.videoId,
        startSeconds: Math.max(0, elapsedSeconds),
      });
      return;
    }

    if (isPlayingChanged || startedAtChanged) {
      if (nowPlaying.isPlaying) {
        // Resumed: started_at was updated server-side, so elapsed is correct
        const elapsedSeconds = (Date.now() - nowPlaying.startedAt.toDate().getTime()) / 1000;
        player.seekTo(Math.max(0, elapsedSeconds), true);
        player.playVideo();
      } else {
        // Paused: seek to the exact captured offset so both clients show same frame
        const pausedSeconds = Number(nowPlaying.pausedAtOffset) / 1_000_000;
        player.seekTo(pausedSeconds, true);
        player.pauseVideo();
      }
    }
  }, [nowPlaying, playerRef, playerReady]);

  // Background-return detection:
  // The YouTube iframe self-pauses when visibilitychange fires inside it (cross-origin,
  // YouTube policy). We cannot prevent that pause. Instead we detect "just returned"
  // and resume with server-time drift correction via two complementary paths:
  //
  //  Path A (PAUSED event): YouTube fires YT.PlayerState.PAUSED after self-pausing.
  //    If that happens while justReturnedFromBackground is true and the server says
  //    isPlaying, we seek to server time and call playVideo() immediately.
  //    This is the reliable path — we react to the actual pause, no timing guessing.
  //
  //  Path B (deferred timeout): We schedule a 400ms fallback seekTo+playVideo.
  //    This covers the case where the PAUSED event fires before our listener was set,
  //    or on reconnect where the player just mounted with a stale position.
  //
  // The 400ms delay gives YouTube's internal pause cycle time to complete, so our
  // playVideo() call arrives after YouTube is done pausing (not mid-cycle).

  const visibilitySyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justReturnedFromBackgroundRef = useRef(false);
  const backgroundReturnClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markReturnedFromBackground = useCallback((): void => {
    justReturnedFromBackgroundRef.current = true;
    if (backgroundReturnClearTimerRef.current) clearTimeout(backgroundReturnClearTimerRef.current);
    // Clear the flag after 2s — any PAUSED event after that is a real user action
    backgroundReturnClearTimerRef.current = setTimeout(() => {
      justReturnedFromBackgroundRef.current = false;
    }, 2000);
  }, []);

  const seekAndPlay = useCallback((): void => {
    if (visibilitySyncTimeoutRef.current) {
      clearTimeout(visibilitySyncTimeoutRef.current);
      visibilitySyncTimeoutRef.current = null;
    }
    const current = nowPlayingRef.current;
    if (!current?.isPlaying) return;
    const player = playerRef.current;
    if (!player) return;
    const elapsedSeconds = (Date.now() - current.startedAt.toDate().getTime()) / 1000;
    player.seekTo(Math.max(0, elapsedSeconds), true);
    player.playVideo();
  }, [playerRef]);

  useEffect(() => {
    const onVisibilityChange = (): void => {
      if (document.visibilityState !== 'visible') return;
      markReturnedFromBackground();
      if (visibilitySyncTimeoutRef.current) clearTimeout(visibilitySyncTimeoutRef.current);
      // Path B: deferred fallback — 400ms to allow YouTube's iframe to finish its own pause cycle
      visibilitySyncTimeoutRef.current = setTimeout(seekAndPlay, 400);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    // On mount while visible (e.g. after reconnect): treat as "just returned" and sync
    if (
      document.visibilityState === 'visible' &&
      nowPlaying?.isPlaying &&
      playerRef.current &&
      playerReady
    ) {
      markReturnedFromBackground();
      seekAndPlay();
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (visibilitySyncTimeoutRef.current) {
        clearTimeout(visibilitySyncTimeoutRef.current);
        visibilitySyncTimeoutRef.current = null;
      }
      if (backgroundReturnClearTimerRef.current) {
        clearTimeout(backgroundReturnClearTimerRef.current);
        backgroundReturnClearTimerRef.current = null;
      }
    };
  }, [playerRef, playerReady, nowPlaying, markReturnedFromBackground, seekAndPlay]);

  const onPlayerStateChange = useCallback(
    (event: YT.OnStateChangeEvent) => {
      if (event.data === YT.PlayerState.ENDED) {
        const current = nowPlayingRef.current;
        if (!current) return;
        playNextRef.current({ queueItemId: current.queueItemId });
        return;
      }

      // Path A: YouTube self-paused right after we returned from background → auto-resume
      if (event.data === YT.PlayerState.PAUSED && justReturnedFromBackgroundRef.current) {
        const current = nowPlayingRef.current;
        if (!current?.isPlaying) return;
        seekAndPlay();
      }
    },
    [seekAndPlay]
  );

  return { nowPlaying, onPlayerStateChange };
}
