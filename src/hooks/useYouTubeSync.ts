import { useCallback, useEffect, useRef } from 'react';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings';
import type * as Types from '../module_bindings/types';

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

  const onPlayerStateChange = useCallback((event: YT.OnStateChangeEvent) => {
    if (event.data !== YT.PlayerState.ENDED) return;

    const current = nowPlayingRef.current;
    if (!current) return;

    playNextRef.current({ queueItemId: current.queueItemId });
  }, []);

  return { nowPlaying, onPlayerStateChange };
}
