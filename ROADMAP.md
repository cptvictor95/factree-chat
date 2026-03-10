# factree.fm — Roadmap

> A private YouTube listening room for two. Like Spotify Jam, but for YouTube.
> One room, one queue, one vibe — shared in real-time.

---

## What's Done ✓

- **Synchronized playback** — both users hear the same second of the same video
- **Real-time chat** — messages visible to everyone in the room instantly
- **Queue** — add YouTube URLs, see position, auto-play next when video ends
- **Skip** — any user can skip the current song
- **Remove own song** — remove a song you added from the queue
- **Name setting** — set a display name so you know who's who
- **Retro-warm UI** — Playfair Display + Lora + IBM Plex Mono, amber palette, grain texture, Framer Motion animations

---

## Phase 2 — Queue Control (Next Up)

> Make the queue feel collaborative — both of you should be able to manage it freely.

### 2.1 Queue Reordering (drag to rearrange)

**Why:** When you add 5 songs and realize you want a different order, you shouldn't have
to remove and re-add everything.

- Client: drag-and-drop on the queue strip (library: `@dnd-kit/sortable`)
- Backend: new reducer `reorder_queue` — takes an ordered list of `queue_item_id`s,
  updates `position` values server-side
- Both users see the reorder reflected in real-time

### 2.2 Anyone Can Remove Any Song

**Why:** It's just two of you. Trust each other. Having to ask your girlfriend to
remove her own song is friction you don't need.

- Backend: remove the `sender == added_by` ownership check from `remove_from_queue`
- Client: show the remove ✕ button on all queue items, not just your own

### 2.3 Song Progress Bar

**Why:** Knowing how much of the song is left helps decide when to add the next one.
No backend change needed — computed from `nowPlaying.startedAt` + elapsed.

- Client-only: thin progress strip at the top of the player controls bar
- Updates via `requestAnimationFrame` (or a 1s interval)
- Shows elapsed / total when hovered (requires YouTube player's `getDuration()`)

---

## Phase 3 — Session Feel

> Transitions and polish that make the room feel like a space, not just a form.

### 3.1 Click-to-Join Splash Screen

**Why:** Browser autoplay policy blocks the first video from playing without a user
gesture. Right now it may silently fail. The splash also creates a moment of
intentional "entering the room" that fits the vibe.

- Full-screen overlay on first load with the `factree.fm` logo and a "Join the room →" button
- Clicking dismisses it and kicks off audio playback
- Single state flag in React — no backend change needed

### 3.2 User Color Coding

**Why:** With exactly two people chatting, you want to instantly tell messages apart
at a glance — not just by reading the name.

- Derive a deterministic warm accent color from the identity hex
  (e.g. map the first 6 chars to a hue in the amber/rust range)
- Apply that color to: message sender name, user dot, queue item "added by"
- Your color stays consistent across sessions

### 3.3 "Now Playing" Progress on Queue Card

**Why:** The currently-playing item should visually feel different from queued items.

- Add a subtle animated amber underline or background fill on the `position: 0` queue card
  (the one currently playing)
- Makes it clear what's playing vs what's up next

---

## Phase 4 — Nice to Haves

> Things that would make it more fun after the core experience is solid.

### 4.1 Emoji Reactions

- Press a reaction button (❤️ 🔥 😂 🎸) and a floating emoji bursts across the player
- Could be ephemeral (client-only animation triggered by a SpacetimeDB reducer event)
  or persisted with a short TTL — either way, no permanent data needed

### 4.2 Song History

**Why:** "What was that track?" — happens constantly in any listening session.

- Keep a `song_history` table: insert a row whenever `play_next` is called, storing
  `video_id`, `title`, `thumbnail_url`, `played_at`
- Show the last 5 played tracks below the queue strip (collapsed by default)

### 4.3 Mobile Layout

**Why:** Sometimes you want to add a song from your phone while the video plays on a laptop.

- Stacked layout at `< 768px`: player full-width, queue below, chat hidden behind a tab
- The current layout is explicitly desktop-first (per original PRD) — this is a later polish

### 4.4 Playback Pause/Resume Sync

**Why:** Pausing on one client pauses for both. Closer to the Spotify Jam experience.

- Requires adding `is_playing: bool` to the `now_playing` table (already in PRD schema)
- New reducer `toggle_playback` — flips `is_playing`, clients react to the change
- The YouTube IFrame API supports `pauseVideo()` / `playVideo()` — hookable from
  `useYouTubeSync`

---

## Won't Do (for this project)

- Multiple rooms — one global room is the whole point
- Persistent auth / accounts beyond SpacetimeDB identity
- DJ rotation / permission tiers
- Moderation / kick / ban
- Public sharing or discovery

---

## Implementation Order Recommendation

```
[x] Phase 1 — UI redesign
[ ] 2.2 — Anyone can remove any song  (5 min — one-line backend change)
[ ] 2.3 — Song progress bar           (30 min — client only)
[ ] 3.1 — Click-to-join splash        (30 min — client only)
[ ] 2.1 — Queue reordering            (2–3 hours — needs @dnd-kit + new reducer)
[ ] 3.2 — User color coding           (45 min — client only)
[ ] 3.3 — Now-playing card indicator  (20 min — CSS + queue logic)
[ ] 4.1 — Emoji reactions             (1 hour)
[ ] 4.4 — Pause/resume sync           (1–2 hours — backend + client)
[ ] 4.2 — Song history                (1–2 hours — new table + reducer)
[ ] 4.3 — Mobile layout               (2–3 hours)
```
