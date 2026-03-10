# Migration: Queue reactions & play history

This doc describes the schema change for **reactions tied to the current song** and **play history**, and how we keep existing usage (e.g. with Giulia) working without disrupting data.

## What changed

- **New table:** `played_item` — one row per song that has played (video_id, title, added_by, played_at). Used to tie reactions to a specific play and for future history views.
- **`now_playing`:** New column **`played_item_id`** (optional, at end of table). Links the current song to its `played_item` row. Optional so the existing row (current song before deploy) has no value and the app keeps working.
- **`reaction`:** New column **`played_item_id`** (optional). When set, the reaction is for that song; when null, legacy/global (floating only).
- **`send_reaction`:** Now accepts optional **`played_item_id`**. Client sends the current song’s `played_item_id` so new reactions are stored for that song.

## Automatic migration (SpacetimeDB)

- New table and new columns at the **end** of tables with **optional** (default “none”) are safe.
- Existing `now_playing` row keeps working: `played_item_id` is absent, so reaction counts for that song are empty until the next track plays.
- Existing `reaction` rows keep working: `played_item_id` is absent (legacy); floating animations still work.
- **No `--clear-database` or data wipe.** Publish with `spacetime publish <db-name> --module-path spacetimedb` as usual.

## After deploy

1. **Publish the module** so the new schema is applied.
2. **Deploy the client** so it sends `played_item_id` and shows reaction counts.
3. Current song (the one playing at deploy time) will not have reaction counts until the next song starts; then all new songs get counts and history.
