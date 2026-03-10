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
// On now_playing change: seeks the player to (now - started_at) seconds, ensuring
// all clients — including late joiners — see the same position.
//
// On video end: calls play_next with the current queue_item_id. SpacetimeDB
// serializes reducer calls, so only the first client to fire advances playback;
// subsequent calls whose queueItemId no longer matches now_playing are no-ops.
export function useYouTubeSync(
  playerRef: React.MutableRefObject<YT.Player | null>,
  playerReady: boolean
): UseYouTubeSyncResult {
  const [nowPlayingRows] = useTable(tables.now_playing);
  const playNext = useReducer(reducers.playNext);

  const nowPlaying = nowPlayingRows[0] ?? null;

  // Stable refs so callbacks don't need to be recreated on every render
  const nowPlayingRef = useRef<Types.NowPlaying | null>(nowPlaying);
  nowPlayingRef.current = nowPlaying;

  const playNextRef = useRef(playNext);
  playNextRef.current = playNext;

  // Track last-synced item to avoid re-seeking when unrelated state updates arrive
  const lastSyncedIdRef = useRef<bigint | null>(null);

  useEffect(() => {
    if (!playerReady) return;
    const player = playerRef.current;
    if (!player || !nowPlaying) return;

    if (lastSyncedIdRef.current === nowPlaying.queueItemId) return;
    lastSyncedIdRef.current = nowPlaying.queueItemId;

    const elapsedSeconds = (Date.now() - nowPlaying.startedAt.toDate().getTime()) / 1000;

    player.loadVideoById({
      videoId: nowPlaying.videoId,
      startSeconds: Math.max(0, elapsedSeconds),
    });
  }, [nowPlaying, playerRef, playerReady]);

  const onPlayerStateChange = useCallback((event: YT.OnStateChangeEvent) => {
    if (event.data !== YT.PlayerState.ENDED) return;

    const current = nowPlayingRef.current;
    if (!current) return;

    playNextRef.current({ queueItemId: current.queueItemId });
  }, []);

  return { nowPlaying, onPlayerStateChange };
}
