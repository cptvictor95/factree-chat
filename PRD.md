# PRD — Factree Chat: Synchronized Music Room

> **Context:** This is a SpacetimeDB exploration project. The goal is to learn
> SpacetimeDB while building something genuinely fun — a synchronized music
> listening room inspired by plug.dj and treesradio.
>
> **Stack:** React + TypeScript + Vite · SpacetimeDB TypeScript SDK v2.0.3
> (module written in TypeScript, not Rust) · YouTube IFrame API

---

## 1. Product Overview

A single shared room where multiple users can:

- Listen to YouTube videos together **in sync** — everyone hears the same
  second of the same video at the same time
- **Chat in real-time** while music plays
- **Queue songs** and see their position in line
- See who else is in the room right now

Think of it as a virtual listening party. One room, one queue, one vibe.

---

## 2. Goals

| #   | Goal                                                                   |
| --- | ---------------------------------------------------------------------- |
| G1  | Demonstrate SpacetimeDB real-time sync for shared application state    |
| G2  | Synchronized playback — all clients at the same timestamp of the video |
| G3  | Persistent queue managed server-side, not per-client                   |
| G4  | Real-time chat works alongside the player                              |
| G5  | The codebase serves as a reference for SpacetimeDB patterns            |

### Non-Goals (MVP)

- Multiple rooms — one global room only
- User authentication beyond SpacetimeDB identity
- Persistent history / past songs
- DJ roles / permissions
- Voting to skip (added as stretch goal)
- Mobile responsiveness (desktop-first)

---

## 3. Core User Stories

```
As a user, I want to...
  [ US-01 ] set a display name so others know who I am
  [ US-02 ] see who else is currently in the room
  [ US-03 ] type and send chat messages visible to all in real-time
  [ US-04 ] see the currently playing video synced to the same timestamp as everyone else
  [ US-05 ] add a YouTube URL to the queue
  [ US-06 ] see the full queue with position numbers and who added each song
  [ US-07 ] see my own position in the queue ("You're #3 in queue")
  [ US-08 ] remove my own song from the queue before it plays
  [ US-09 ] have the next song auto-play when the current one ends
  [ US-10 ] see song title and thumbnail while it's playing
  [ US-11 ] vote to skip the current song (stretch)
```

---

## 4. SpacetimeDB Data Model

This section defines what needs to change in `spacetimedb/src/index.ts`.

### Tables

#### `user` (already exists — keep as-is)

```ts
{
  identity: t.identity().primaryKey(),
  name: t.string().optional(),
  online: t.bool(),
}
```

#### `message` (already exists — keep as-is)

```ts
{
  sender: t.identity(),
  sent: t.timestamp(),
  text: t.string(),
}
```

#### `queue_item` (new)

A video waiting to be played, or the currently playing video.

```ts
{
  id: t.u64().autoInc().primaryKey(),
  video_id: t.string(),           // YouTube video ID (e.g. "dQw4w9WgXcQ")
  title: t.string(),              // Video title (fetched client-side, stored here)
  thumbnail_url: t.string(),      // YouTube thumbnail URL
  added_by: t.identity(),         // Who added it
  added_at: t.timestamp(),        // When it was added
  position: t.u32(),              // Order in queue (1-indexed; 0 = currently playing)
}
```

> **Why store `title` and `thumbnail_url` server-side?** So all clients display
> the same metadata without each having to call the YouTube API independently.
> The adding client resolves metadata before calling the reducer.

#### `now_playing` (new)

Singleton table — always exactly 0 or 1 rows.

```ts
{
  id: t.u8().primaryKey(),          // Always 1 — enforces singleton
  queue_item_id: t.u64(),           // FK to queue_item.id
  started_at: t.timestamp(),        // When playback began on the server
  is_playing: t.bool(),             // Pause/resume (stretch goal)
}
```

> **Why `started_at` on the server?** This is the key to synchronized
> playback. When a client connects, it calculates:
>
> ```
> currentTime = (now - started_at) in seconds
> ```
>
> and seeks the YouTube player to that position. SpacetimeDB's timestamps are
> authoritative — no client can drift.

#### `skip_vote` (stretch goal)

```ts
{
  voter: t.identity().primaryKey(),
  queue_item_id: t.u64(),
}
```

---

## 5. Reducers

### Existing (keep)

- `set_name` — set display name
- `send_message` — send a chat message

### New

#### `add_to_queue`

```
Input: { video_id, title, thumbnail_url }
Logic:
  - Validate video_id is non-empty
  - Find max(position) among existing queue_items
  - Insert queue_item with position = max + 1
  - If now_playing is empty, immediately call play_next
```

#### `remove_from_queue`

```
Input: { queue_item_id }
Logic:
  - Find queue_item; verify sender == added_by
  - Delete the item
  - Reorder positions: decrement all items with position > deleted.position
  - If item was the current now_playing song, call play_next
```

#### `play_next`

```
Input: (none — called internally or when client reports "video ended")
Logic:
  - Find queue_item with the lowest position > 0 (i.e., first in queue)
  - If none: delete now_playing row (nothing to play)
  - Else:
    - Set now_playing to { id: 1, queue_item_id: item.id, started_at: ctx.timestamp, is_playing: true }
    - Decrement all remaining queue positions by 1
    - The played item gets position = 0 (marks it as "was playing")
    - After it's superseded, delete the old now_playing row's queue_item (optional)
```

> **Note on "video ended" trigger:** SpacetimeDB cannot watch YouTube. Each
> client detects `onStateChange: YT.PlayerState.ENDED` and calls `play_next`.
> To prevent duplicate calls, the reducer checks if the `queue_item_id` in
> the request matches the current `now_playing.queue_item_id` before
> advancing. First caller wins; subsequent calls are no-ops.

#### `vote_skip` (stretch goal)

```
Input: { queue_item_id }
Logic:
  - Upsert skip_vote for sender
  - Count votes for this queue_item_id
  - If votes >= ceil(online_users / 2): call play_next
```

---

## 6. Client Architecture

### Component Structure

```
App
├── SpacetimeDB provider (useSpacetimeDB)
├── PlayerPanel
│   ├── YouTubePlayer (IFrame API)
│   ├── NowPlayingInfo (title, thumbnail, added_by)
│   └── SkipVoteButton (stretch)
├── QueuePanel
│   ├── QueueList (position, title, thumbnail, added_by)
│   ├── AddToQueueForm (URL input → resolve metadata → call reducer)
│   └── MyQueuePosition ("You're #3 in line")
└── ChatPanel
    ├── MessageList
    ├── UserList (online users)
    └── MessageInput
```

### Synchronized Playback Logic (Client)

```ts
// On now_playing insert or update:
function syncPlayback(nowPlaying: NowPlaying, player: YT.Player) {
  const elapsed = (Date.now() - nowPlaying.started_at.toDate().getTime()) / 1000;
  player.loadVideoById(videoId, elapsed);
  if (nowPlaying.is_playing) player.playVideo();
}

// On player state ENDED:
function onVideoEnded() {
  playNext({ queue_item_id: currentNowPlaying.queue_item_id });
}
```

### YouTube Metadata Resolution (Client, before `add_to_queue`)

Use the `oEmbed` endpoint — no API key needed:

```
GET https://www.youtube.com/oembed?url=https://youtu.be/{VIDEO_ID}&format=json
→ { title, thumbnail_url, ... }
```

Then extract the video ID from the user's input URL (handles `/watch?v=`, `/youtu.be/`, `/embed/` formats).

---

## 7. Layout Spec (Desktop)

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER: room name · connected users count                      │
├─────────────────────────────┬───────────────────────────────────┤
│                             │                                   │
│   PLAYER (16:9 embed)       │   CHAT                            │
│                             │   · message list (scrollable)     │
│   NowPlaying:               │   · [user]: message text          │
│   [thumb] Title · by @user  │                                   │
│                             ├───────────────────────────────────┤
│                             │   ONLINE USERS                    │
│                             │   · green dot · name              │
├─────────────────────────────┴───────────────────────────────────┤
│  QUEUE                                                          │
│  #1 [thumb] Title · added by @user   [✕ remove if own]         │
│  #2 [thumb] Title · added by @user                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Add a song: [ YouTube URL input          ] [Add to Queue]│  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Build Sequence

Break this into discrete, shippable steps:

| Step  | What to build                                                     | Key learning                                  |
| ----- | ----------------------------------------------------------------- | --------------------------------------------- |
| **1** | Update SpacetimeDB schema: add `queue_item`, `now_playing` tables | SpacetimeDB auto-increment, singleton pattern |
| **2** | Add `add_to_queue`, `remove_from_queue`, `play_next` reducers     | Reducer composition, internal reducer calls   |
| **3** | Regenerate TypeScript bindings (`yarn spacetime:generate`)        | Understanding generated types                 |
| **4** | Build `QueuePanel` with add form and list                         | `useTable`, `useReducer` patterns             |
| **5** | Integrate YouTube IFrame API in `PlayerPanel`                     | YT API lifecycle                              |
| **6** | Implement synchronized playback from `started_at`                 | The SpacetimeDB timestamp sync trick          |
| **7** | Wire `onVideoEnded` → `play_next` with idempotency guard          | Distributed event deduplication               |
| **8** | Style everything (layout above)                                   | Final polish                                  |
| **9** | Vote-to-skip (stretch)                                            | Multi-user agreement pattern                  |

---

## 9. Technical Constraints & Open Questions

| #   | Question                                             | Proposed Answer                                                                                                  |
| --- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Q1  | Can SpacetimeDB reducers call each other?            | Yes — `play_next` can be called from within `add_to_queue` and `remove_from_queue`                               |
| Q2  | Who triggers `play_next` when a video ends?          | Any client detecting `ENDED` — reducer guards against duplicate advances                                         |
| Q3  | What if two clients call `play_next` simultaneously? | SpacetimeDB serializes all reducer calls — first one wins, second is a no-op if `queue_item_id` already advanced |
| Q4  | How to handle new joiners mid-video?                 | `now_playing.started_at` lets them seek to the correct position immediately                                      |
| Q5  | YouTube autoplay restrictions (browser policy)?      | May need a user gesture before first play; show a "Click to join the room" splash                                |
| Q6  | What if the queue is empty?                          | `now_playing` row is absent; player shows idle state                                                             |

---

## 10. Out of Scope (Future)

- Multiple named rooms
- DJ rotation (plug.dj-style "take the wheel")
- Reactions / emoji rain during songs
- Song history / "what was that track?"
- User avatars
- Moderation / kick/ban
- Persistent accounts beyond SpacetimeDB identity
