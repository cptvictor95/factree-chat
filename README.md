# factree.fm

A synchronized music listening room built with **SpacetimeDB**. Everyone in the room hears the same second of the same YouTube video, with a shared queue and real-time chat.

## What it does

- **Synchronized playback** — SpacetimeDB stores a server-authoritative `started_at` timestamp. Each client calculates elapsed time on connect and seeks the player there, so late joiners always catch up to the right position.
- **Shared queue** — Any user can add YouTube videos (by URL or ID). The queue advances automatically when a video ends; any user can skip.
- **Real-time chat** — Presence events (join / leave) are woven into the chat timeline alongside user messages.
- **Volume control** — Volume and mute state are local per-user, persisted in `localStorage`.

## Tech stack

| Layer            | Technology                                                 |
| ---------------- | ---------------------------------------------------------- |
| Frontend         | React + TypeScript + Vite                                  |
| Realtime backend | [SpacetimeDB](https://spacetimedb.com) (TypeScript module) |
| Video            | YouTube IFrame API                                         |
| Video metadata   | YouTube oEmbed (no API key required)                       |
| Styling          | Plain CSS with custom properties                           |

## Project structure

```
factree-chat/
├── spacetimedb/          # SpacetimeDB server module (TypeScript)
│   └── src/index.ts      # Tables: user, message, queue_item, now_playing
│                         # Reducers: add_to_queue, remove_from_queue, play_next
├── src/
│   ├── components/
│   │   ├── chat/         # ChatPanel — messages, presence, name editing
│   │   ├── player/       # PlayerPanel — YouTube IFrame + volume controls
│   │   └── queue/        # QueuePanel + AddToQueueForm
│   ├── hooks/
│   │   └── useYouTubeSync.ts   # Syncs YT player to now_playing state
│   ├── module_bindings/  # Auto-generated SpacetimeDB TypeScript types
│   └── utils/
│       └── youtube.ts    # URL parsing + oEmbed metadata fetch
```

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Yarn](https://yarnpkg.com/)
- [SpacetimeDB CLI](https://spacetimedb.com/install)

### Local development

```bash
# Install frontend dependencies
yarn install

# Install SpacetimeDB module dependencies
cd spacetimedb && yarn install && cd ..

# Run Vite dev server
yarn dev
```

The app connects to the SpacetimeDB instance configured in `spacetime.json` / `spacetime.local.json`.

### Publishing the SpacetimeDB module

```bash
yarn spacetime:publish
```

This compiles and publishes `spacetimedb/src/index.ts` to SpacetimeDB maincloud.

### Regenerating module bindings

After changing the SpacetimeDB module schema:

```bash
yarn spacetime:generate
```

This updates the auto-generated files in `src/module_bindings/`.

## Key design decisions

**Synchronized playback via `started_at`**
Rather than broadcasting "seek to X" events, the `now_playing` table stores a `started_at` timestamp. Every client independently calculates `elapsed = (now - started_at)` and seeks there. This means late joiners automatically land at the right position with no special logic.

**Idempotent `play_next` reducer**
When a video ends, all connected clients fire `play_next`. SpacetimeDB serializes these reducer calls. The reducer checks whether `queueItemId` still matches the current `now_playing` row — only the first call succeeds; the rest are no-ops.

**YouTube IFrame API + React reconciliation**
The YouTube Player API replaces its target `<div>` with an `<iframe>`. To avoid React's virtual DOM fighting over that element, the player's target div is created and appended _imperatively_ (outside React's tree) into a ref-controlled wrapper. React never knows the iframe exists.
