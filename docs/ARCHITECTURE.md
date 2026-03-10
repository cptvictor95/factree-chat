# factree.fm — Architecture

> A private, single-room YouTube listening app for two users.
> Real-time sync via SpacetimeDB. Think Spotify Jam, but for YouTube.

---

## Stack

| Layer        | Technology                                     | Why                                                   |
| ------------ | ---------------------------------------------- | ----------------------------------------------------- |
| Frontend     | React 18 + TypeScript + Vite                   | Fast DX, strict types                                 |
| Real-time DB | SpacetimeDB 2.0 (TypeScript module, maincloud) | Server-authoritative state, instant multi-client sync |
| Video        | YouTube IFrame API                             | No API key required for playback                      |
| Animations   | Framer Motion                                  | Spring physics, `AnimatePresence` for exit animations |
| Styling      | Plain CSS with custom properties               | No utility framework overhead, full design control    |
| Tests        | Vitest + Testing Library                       | Co-located with source                                |

---

## Project Structure

```
factree-chat/
├── .github/
│   └── workflows/
│       └── ci.yml                  Lint + typecheck + build + test on every PR
├── docs/
│   ├── ARCHITECTURE.md             (this file)
│   └── design-direction.md        Visual design decisions and MoSCoW backlog
├── spacetimedb/                    Backend module (TypeScript)
│   └── src/
│       └── index.ts                Tables, reducers, lifecycle hooks
├── src/                            Frontend (React + Vite)
│   ├── components/
│   │   ├── layout/                 App-level UI (splash, header, tabs)
│   │   │   ├── AppHeader.tsx
│   │   │   ├── ConnectingScreen.tsx
│   │   │   ├── JoinSplash.tsx
│   │   │   ├── MobileTabs.tsx
│   │   │   └── index.ts
│   │   ├── chat/
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── chat.css
│   │   │   └── index.ts
│   │   ├── player/
│   │   │   ├── PlayerPanel.tsx
│   │   │   ├── player.css
│   │   │   └── index.ts
│   │   └── queue/
│   │       ├── AddToQueueForm.tsx
│   │       ├── QueuePanel.tsx
│   │       ├── queue.css
│   │       └── index.ts
│   ├── constants/
│   │   ├── storage.ts              LocalStorage keys, default values
│   │   └── index.ts
│   ├── types/
│   │   ├── app.ts                  Shared app types (e.g. MobileTab)
│   │   └── index.ts
│   ├── hooks/
│   │   └── useYouTubeSync.ts       Synchronized playback hook
│   ├── utils/
│   │   └── youtube.ts              URL parsing, oEmbed metadata
│   ├── module_bindings/            ← AUTO-GENERATED (spacetime generate)
│   ├── App.tsx                     App shell: layout composition only
│   ├── App.css                     Layout + global (grid, splash, connecting, header)
│   ├── index.css                   Design tokens, resets, typography
│   └── main.tsx                    SpacetimeDBProvider + React root
├── ROADMAP.md                      Phased feature plan
├── PRD.md                          Original product requirements
└── eslint.config.js / .prettierrc  Code quality tooling
```

**Imports:** Use the `@/` path alias for src (e.g. `import { tables } from '@/module_bindings'`, `import { ChatPanel } from '@/components/chat'`). Feature CSS is co-located and imported by the panel that uses it (e.g. `ChatPanel` imports `./chat.css`).

---

## State Architecture

**SpacetimeDB is the single source of truth for all shared state.**

The rule is simple: if two users need to see the same thing, it lives in a SpacetimeDB
table. If it's ephemeral UI state (an input draft, a toggle), it lives in `useState`.

```
┌─────────────────────────────────────────────────────────┐
│  SpacetimeDB (maincloud)                                │
│  ┌──────────────┐  ┌────────────┐  ┌─────────────────┐ │
│  │  now_playing │  │ queue_item │  │     message     │ │
│  │  (singleton) │  │ (position) │  │ (sender, text)  │ │
│  └──────────────┘  └────────────┘  └─────────────────┘ │
│  ┌──────────────┐                                       │
│  │     user     │                                       │
│  │ (identity,   │                                       │
│  │  name,online)│                                       │
│  └──────────────┘                                       │
└───────────────────────┬─────────────────────────────────┘
                        │ WebSocket subscription
                ┌───────┴────────┐
                │ React Client   │
                │                │
                │ useTable(...)  │  ← reads from tables
                │ useReducer(...)│  ← calls reducers
                └────────────────┘
```

| Data         | Storage               | Rationale                        |
| ------------ | --------------------- | -------------------------------- |
| Current song | `now_playing` table   | Authoritative timestamp for sync |
| Queue order  | `queue_item.position` | Server-managed positions         |
| Chat history | `message` table       | Persistent, shared               |
| Online users | `user.online` flag    | Set by lifecycle hooks           |
| Volume       | `localStorage`        | User preference, not shared      |
| Input drafts | React `useState`      | Ephemeral, no server involvement |

---

## Data Model

### `user`

```
identity  (primary key, t.identity)
name      (t.string, optional)
online    (t.bool)
```

Managed by `clientConnected` / `clientDisconnected` lifecycle hooks — never manually inserted.

### `message`

```
sender  (t.identity)
sent    (t.timestamp)
text    (t.string)
```

Public table. All users see all messages.

### `queue_item`

```
id           (t.u64, primaryKey, autoInc)
video_id     (t.string)
title        (t.string)
thumbnail_url (t.string)
added_by     (t.identity)
added_at     (t.timestamp)
position     (t.u32)   — 1-indexed in queue; 0 = currently playing
```

### `now_playing`

```
id           (t.u8, primaryKey)   — always 1, enforces singleton
queue_item_id (t.u64)
started_at   (t.timestamp)        — server-authoritative playback start
```

The `started_at` timestamp is the key to synchronized playback:

```
elapsed = (Date.now() - started_at) / 1000 seconds
player.loadVideoById(videoId, elapsed)
```

---

## Synchronized Playback

The critical insight is that `started_at` is set server-side at the moment `play_next`
runs. Every client — including late joiners — can compute the correct seek position:

```
┌─────────┐  "video ended"   ┌───────────────┐   update now_playing  ┌─────────┐
│ Client A│ ──────────────►  │ SpacetimeDB   │ ──────────────────►   │ Client B│
│  (any)  │  play_next()     │ play_next      │   started_at = NOW    │         │
└─────────┘                  │ reducer        │                        └─────────┘
                             └───────────────┘
                                                  Both clients subscribe to now_playing
                                                  Both compute elapsed and seek
```

Idempotency guard: `play_next` checks if the `queue_item_id` in the request matches
the current `now_playing.queue_item_id` before advancing — so if two clients send
the event simultaneously, only the first one takes effect.

---

## CI / CD Pipeline

| Workflow                 | Trigger           | What it does                                          |
| ------------------------ | ----------------- | ----------------------------------------------------- |
| `ci.yml`                 | Push/PR to `main` | lint → typecheck → build → test                       |
| `claude-code-review.yml` | PR opened/updated | Automatic Claude code review with inline comments     |
| `claude.yml`             | `@claude` mention | Claude responds to questions in issues or PR comments |

### Required GitHub Secret

`CLAUDE_CODE_OAUTH_TOKEN` — obtained from [claude.ai/code](https://claude.ai/code).
Set in **Repository Settings → Secrets and variables → Actions**.

---

## Design System

Full design decisions: [`docs/design-direction.md`](./design-direction.md)

### Design Token Palette

| Token       | Light     | Dark      | Role                             |
| ----------- | --------- | --------- | -------------------------------- |
| `--accent`  | `#e8a030` | `#e8a030` | Warm amber — buttons, highlights |
| `--bg`      | `#faf5ec` | `#140e06` | Page background                  |
| `--text`    | `#1c1208` | `#f0e4c8` | Primary text                     |
| `--surface` | `#f0e8d8` | `#1e160a` | Card/panel background            |
| `--border`  | `#ddc9a8` | `#2e1e0e` | Dividers                         |

### Font Stack

- **Playfair Display 900** — logo, song titles, editorial headings
- **Lora 400/600** — body text, chat messages
- **IBM Plex Mono 400** — timestamps, position labels, technical text

---

## Backend Development

```bash
# Edit schema (tables)
spacetimedb/src/schema.ts

# Edit reducers / lifecycle
spacetimedb/src/index.ts

# Deploy changes
npm run spacetime:publish

# Regenerate client bindings
npm run spacetime:generate

# Commit the updated bindings
git add src/module_bindings && git commit -m "chore: regenerate bindings"
```

The `src/module_bindings/` directory is **auto-generated**. Never edit it manually.

---

## Testing

Tests live co-located with source files: `ComponentName.test.tsx` / `hookName.test.ts`.

```bash
npm run test          # run once
npm run test -- --watch  # watch mode
```

**What to test:**

- Custom hooks (`useYouTubeSync`, future hooks) — mock the SpacetimeDB tables
- Utility functions (`youtube.ts` — URL parsing, metadata fetching)
- Pure component rendering (snapshot tests where useful)

**What NOT to test:**

- SpacetimeDB reducers — they're unit-tested by running the module itself
- Real-time sync behavior — integration-test this manually with two browser tabs
