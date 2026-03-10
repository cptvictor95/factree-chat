# factree.fm — Design Direction

## Aesthetic: Retro Warm — Cassette/Vinyl Nostalgia

A late-night listening room that feels like analog made digital. Deep warm blacks,
amber accents, grainy texture overlay, serif typography. Think a vinyl record shop
at midnight — tactile, warm, unpretentious.

---

## Decisions

### Palette
| Token | Light | Dark |
|---|---|---|
| `--accent` | `#e8a030` | `#e8a030` |
| `--bg` | `#faf5ec` (warm cream) | `#140e06` (deep warm black) |
| `--text` | `#1c1208` | `#f0e4c8` |
| `--surface` | `#f0e8d8` | `#1e160a` |

### Typography
- **Display / Logo:** Playfair Display 900 — editoral, characterful, vintage
- **Body / Chat:** Lora 400/600 — warm serif, readable at small sizes
- **Mono / Technical:** IBM Plex Mono — timestamps, positions, labels

### Texture
- SVG `feTurbulence` grain overlay on `.app::before`, `opacity: 0.04`, `pointer-events: none`
- Grain reinforces the analog warmth without being distracting

### Motion (Framer Motion)
- **Connecting screen:** logo breathes with `opacity: [1, 0.35, 1]` on infinite loop
- **Now playing change:** `AnimatePresence mode="wait"` on controls bar — slides out old song, slides in new one
- **Chat messages:** each `motion.div` enters with `{ opacity: 0, y: 6 } → visible` (18ms ease-out)
- **Queue items:** staggered `containerVariants` + `staggerChildren: 0.07s` on initial load; `AnimatePresence mode="popLayout"` for removes

### Differentiation
**The grain.** Everything else could be "warm dark UI." The grain texture and Playfair Display
logo make it feel hand-crafted rather than templated.

---

## MoSCoW — Feature Backlog

### Must Have (done ✓)
- US-01 Set display name
- US-02 See who else is in the room
- US-03 Real-time chat
- US-04 Synced playback at same timestamp
- US-05 Add YouTube URL to queue
- US-06 See full queue with positions
- US-07 "You're #N in queue" indicator
- US-08 Remove own song from queue
- US-09 Auto-play next when video ends
- US-10 See now-playing song title + thumbnail

### Should Have (next PRs)
- **Vote to skip (US-11):** Backend schema already defined (`skip_vote` table in PRD).
  Needs: reducer `vote_skip`, client vote button with live count, majority threshold logic.
- **Autoplay gate / click-to-join splash:** Browser policy blocks autoplay without a
  user gesture. A minimal "Join the room →" overlay on first load satisfies this and
  creates a moment of intentional entry.
- **Song progress bar:** Visual progress strip in the controls bar, derived from
  `nowPlaying.startedAt` + elapsed time. Client-only, no backend changes needed.

### Could Have
- **User color coding:** Deterministic color per identity hex — `@username` references
  in chat glow in each user's unique warm accent. Makes multi-person chat readable at a glance.
- **Emoji reactions:** Floating emoji bursts during playback. Could be ephemeral
  (SpacetimeDB reducer with short TTL) or fully client-local (no DB).
- **Now-playing history chip:** Show the last 2–3 played tracks at the end of the queue
  strip. Read from `queue_item` rows where `position = 0` (the "was playing" state).
- **Mobile layout:** Stacked single-column layout at `< 768px`. Currently desktop-first
  by explicit PRD decision, but a good stretch goal before any public sharing.

### Won't Have (this project's scope)
- Multiple rooms — one global room is the point
- Persistent auth / accounts beyond SpacetimeDB identity
- DJ rotation (plug.dj-style "take the wheel")
- Moderation / kick / ban
- Song history persistence
