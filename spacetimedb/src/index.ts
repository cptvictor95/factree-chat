// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS
// ─────────────────────────────────────────────────────────────────────────────
import { schema, t, table, SenderError } from 'spacetimedb/server';
import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

// ─────────────────────────────────────────────────────────────────────────────
// TABLES
// ─────────────────────────────────────────────────────────────────────────────
const user = table(
  { name: 'user', public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string().optional(),
    online: t.bool(),
  }
);

const message = table(
  { name: 'message', public: true },
  {
    sender: t.identity(),
    sent: t.timestamp(),
    text: t.string(),
  }
);

const queue_item = table(
  { name: 'queue_item', public: true },
  {
    id: t.u64().autoInc().primaryKey(),
    video_id: t.string(),
    title: t.string(),
    thumbnail_url: t.string(),
    added_by: t.identity(),
    added_at: t.timestamp(),
    position: t.u32(),
  }
);

// Singleton table — always 0 or 1 rows. id is always 1.
// Stores the currently playing video and a server-authoritative started_at timestamp.
//
// Sync formula (when is_playing = true):
//   elapsed = (client_now - started_at)
//   → seek YouTube player to elapsed seconds
//
// Pause/resume:
//   On pause: record paused_at_offset = (ctx.timestamp - started_at) in microseconds
//   On resume: set started_at = ctx.timestamp - paused_at_offset
//   → the same elapsed formula now correctly returns the pre-pause position
const now_playing = table(
  { name: 'now_playing', public: true },
  {
    id: t.u8().primaryKey(),
    queue_item_id: t.u64(),
    video_id: t.string(),
    title: t.string(),
    thumbnail_url: t.string(),
    added_by: t.identity(),
    started_at: t.timestamp(),
    is_playing: t.bool(),
    // Microseconds of playback elapsed at the moment of pause. 0 when playing.
    paused_at_offset: t.u64(),
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMA
// ─────────────────────────────────────────────────────────────────────────────
const spacetimedb = schema({ user, message, queue_item, now_playing });
export default spacetimedb;

type AppCtx = ReducerCtx<InferSchema<typeof spacetimedb>>;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// Shared helper: advances playback to the next item in the queue.
function tryPlayNext(ctx: AppCtx): void {
  const waiting = [...ctx.db.queue_item.iter()].sort((a, b) => a.position - b.position);

  if (waiting.length === 0) {
    if (ctx.db.now_playing.id.find(1)) {
      ctx.db.now_playing.id.delete(1);
    }
    return;
  }

  const next = waiting[0];

  const nowPlayingRow = {
    id: 1,
    queue_item_id: next.id,
    video_id: next.video_id,
    title: next.title,
    thumbnail_url: next.thumbnail_url,
    added_by: next.added_by,
    started_at: ctx.timestamp,
    is_playing: true,
    paused_at_offset: 0n,
  };

  const existing = ctx.db.now_playing.id.find(1);
  if (existing) {
    ctx.db.now_playing.id.update(nowPlayingRow);
  } else {
    ctx.db.now_playing.insert(nowPlayingRow);
  }

  // Remove the now-playing item from the queue and compact positions
  ctx.db.queue_item.id.delete(next.id);
  for (const remaining of waiting.slice(1)) {
    ctx.db.queue_item.id.update({ ...remaining, position: remaining.position - 1 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXISTING REDUCERS
// ─────────────────────────────────────────────────────────────────────────────
function validateName(name: string): void {
  if (!name) throw new SenderError('Names must not be empty');
}

export const set_name = spacetimedb.reducer({ name: t.string() }, (ctx, { name }) => {
  validateName(name);
  const found = ctx.db.user.identity.find(ctx.sender);
  if (!found) throw new SenderError('Cannot set name for unknown user');
  console.info(`User ${ctx.sender} sets name to ${name}`);
  ctx.db.user.identity.update({ ...found, name });
});

function validateMessage(text: string): void {
  if (!text) throw new SenderError('Messages must not be empty');
}

export const send_message = spacetimedb.reducer({ text: t.string() }, (ctx, { text }) => {
  validateMessage(text);
  console.info(`User ${ctx.sender}: ${text}`);
  ctx.db.message.insert({
    sender: ctx.sender,
    text,
    sent: ctx.timestamp,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// QUEUE REDUCERS
// ─────────────────────────────────────────────────────────────────────────────
export const add_to_queue = spacetimedb.reducer(
  {
    video_id: t.string(),
    title: t.string(),
    thumbnail_url: t.string(),
  },
  (ctx, { video_id, title, thumbnail_url }) => {
    if (!video_id) throw new SenderError('video_id must not be empty');
    if (!title) throw new SenderError('title must not be empty');

    let maxPosition = 0;
    for (const item of ctx.db.queue_item.iter()) {
      if (item.position > maxPosition) maxPosition = item.position;
    }

    ctx.db.queue_item.insert({
      id: 0n,
      video_id,
      title,
      thumbnail_url,
      added_by: ctx.sender,
      added_at: ctx.timestamp,
      position: maxPosition + 1,
    });

    // Auto-play if nothing is currently playing
    if (!ctx.db.now_playing.id.find(1)) {
      tryPlayNext(ctx);
    }
  }
);

export const remove_from_queue = spacetimedb.reducer(
  { queue_item_id: t.u64() },
  (ctx, { queue_item_id }) => {
    const item = ctx.db.queue_item.id.find(queue_item_id);
    if (!item) throw new SenderError('Queue item not found');

    const removedPosition = item.position;
    ctx.db.queue_item.id.delete(queue_item_id);

    const allItems = [...ctx.db.queue_item.iter()];
    for (const remaining of allItems) {
      if (remaining.position > removedPosition) {
        ctx.db.queue_item.id.update({
          ...remaining,
          position: remaining.position - 1,
        });
      }
    }
  }
);

// Called by clients when a video ends. The queue_item_id argument acts as an
// idempotency guard: if multiple clients fire simultaneously, only the first
// call whose queue_item_id still matches now_playing.queue_item_id advances
// playback. SpacetimeDB serializes all reducer calls, so subsequent calls
// see an already-advanced now_playing and become no-ops.
export const play_next = spacetimedb.reducer(
  { queue_item_id: t.u64() },
  (ctx, { queue_item_id }) => {
    const playing = ctx.db.now_playing.id.find(1);
    if (!playing || playing.queue_item_id !== queue_item_id) return;
    tryPlayNext(ctx);
  }
);

// Toggles playback between paused and playing for all clients in the room.
//
// On pause:
//   Captures the current playback offset (ctx.timestamp - started_at) in microseconds
//   and stores it in paused_at_offset. is_playing becomes false.
//
// On resume:
//   Sets started_at = ctx.timestamp - paused_at_offset so that all clients
//   recalculate elapsed = (now - started_at) and land at the correct position.
//   is_playing becomes true, paused_at_offset resets to 0.
export const toggle_playback = spacetimedb.reducer(ctx => {
  const playing = ctx.db.now_playing.id.find(1);
  if (!playing) return;

  if (playing.is_playing) {
    const offset = ctx.timestamp.microsSinceUnixEpoch - playing.started_at.microsSinceUnixEpoch;
    ctx.db.now_playing.id.update({
      ...playing,
      is_playing: false,
      paused_at_offset: offset,
    });
  } else {
    const resumedMicros = ctx.timestamp.microsSinceUnixEpoch - playing.paused_at_offset;
    ctx.db.now_playing.id.update({
      ...playing,
      is_playing: true,
      // Structural object — SpacetimeDB serialises only microsSinceUnixEpoch
      started_at: { microsSinceUnixEpoch: resumedMicros } as typeof ctx.timestamp,
      paused_at_offset: 0n,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// LIFECYCLE HOOKS
// ─────────────────────────────────────────────────────────────────────────────
export const init = spacetimedb.init(_ctx => {});

export const onConnect = spacetimedb.clientConnected(ctx => {
  const found = ctx.db.user.identity.find(ctx.sender);
  if (found) {
    ctx.db.user.identity.update({ ...found, online: true });
  } else {
    ctx.db.user.insert({
      name: undefined,
      identity: ctx.sender,
      online: true,
    });
  }
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  const found = ctx.db.user.identity.find(ctx.sender);
  if (found) {
    ctx.db.user.identity.update({ ...found, online: false });
  } else {
    console.warn(`Disconnect event for unknown user with identity ${ctx.sender}`);
  }
});
