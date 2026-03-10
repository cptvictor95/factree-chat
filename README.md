# factree.fm

A synchronized music listening room built with **SpacetimeDB**. Everyone in the room hears the same second of the same YouTube video, with a shared queue and real-time chat.

## What it does

- **Synchronized playback** — SpacetimeDB stores a server-authoritative `started_at` timestamp. Each client calculates elapsed time on connect and seeks the player there, so late joiners always catch up to the right position.
- **Shared queue** — Any user can add YouTube videos by pasting a URL or by searching (when deployed with a YouTube API key). The queue advances automatically when a video ends; any user can skip.
- **Real-time chat** — Presence events (join / leave) are woven into the chat timeline alongside user messages.
- **Volume control** — Volume and mute state are local per-user, persisted in `localStorage`.

## Tech stack

| Layer            | Technology                                                        |
| ---------------- | ----------------------------------------------------------------- |
| Frontend         | React + TypeScript + Vite                                         |
| Realtime backend | [SpacetimeDB](https://spacetimedb.com) (TypeScript module)        |
| Video            | YouTube IFrame API                                                |
| Video metadata   | YouTube oEmbed (URL mode); YouTube Data API v3 (search, optional) |
| Styling          | Plain CSS with custom properties                                  |

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

### Optional: YouTube search (production)

The queue form supports two modes: **Link** (paste a URL) and **Search** (type a query and pick a result). Search uses the [YouTube Data API v3](https://developers.google.com/youtube/v3) and only runs when the app is deployed (e.g. on Vercel) with an API key set.

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project, enable **YouTube Data API v3**, and create an API key.
2. In your host (e.g. Vercel), set the environment variable **`YOUTUBE_API_KEY`** to that key.
3. Redeploy. The **Search** tab will then call `/api/search?q=...` and show results; users can add a video with one tap.

Locally (`yarn dev`), `/api/search` is not available unless you run `vercel dev`, so the Search tab will show an error—Link mode still works.

#### Redeploy & debug (YouTube search)

- **Redeploy so Vercel uses the new env var:** Push to the branch Vercel deploys (e.g. `main`), or in Vercel → Project → Deployments → ⋮ on the latest → **Redeploy** (no code change needed).
- **See why search fails:** The Search tab shows the error message from the API (e.g. "Search not configured", or YouTube’s message if the key is invalid or quota is exceeded). For more detail: Vercel → Project → **Logs** or **Functions** → open the `/api/search` run and check the server-side error.
- **Test locally:** Run `vercel dev` (with `YOUTUBE_API_KEY` in `.env.local`) so `/api/search` is available; use the Search tab and click **Search** to trigger the request. In the browser Network tab, inspect the `/api/search?q=...` response status and body to debug.

#### "Requests from referer &lt;empty&gt; are blocked"

Search runs on the **server** (Vercel calls the YouTube API), so the request to Google has no browser Referer. If your API key is restricted to **HTTP referrers (web sites)**, Google blocks it.

- **Recommended:** In [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → your API key, set **Application restrictions** to **None**. Restrict the key with **API restrictions** to **YouTube Data API v3** only (so the key can’t be abused for other APIs).
- **Alternatively:** Keep HTTP referrer restrictions and add your production origin (e.g. `https://your-app.vercel.app/*`). The app sends that origin as a `Referer` header when calling the YouTube API so the request may be accepted.

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
