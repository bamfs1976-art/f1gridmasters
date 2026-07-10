---
name: safe-state-change
description: Mandatory protocol before modifying state persistence in F1 Grid Masters — saveState, loadState, _normaliseState, realtime subscription, or anything touching the Supabase f1_game_state row. Use whenever a change touches state loading, saving, syncing, normalisation, or Supabase.
---

# Safe state change protocol

This app runs a **live 16-player game** whose entire state is one Supabase row
(`f1_game_state`, `id: 'main'`), written last-write-wins from every player's browser.
Two real incidents motivated this protocol: a `loadState` timeout that risked wiping the
game (reverted across 3 commits), and `_normaliseState` self-heal auto-submitting drafts
after one driver tap.

## Before editing

1. **Snapshot the live row.** Fetch the current `f1_game_state` row (Supabase URL and
   anon key are in `index.html`, search `supabase.createClient`) and save the JSON
   somewhere recoverable (a gist, a local file the user keeps, or paste it in chat).
   Do not proceed without a snapshot.
2. Read the full round-trip before changing any part of it: `saveState` →
   Supabase upsert → realtime broadcast → other clients' `_normaliseState` → re-render.
   Your change must be safe at *every* hop, on *other* people's browsers.

## Absolute rules

- **No code path may ever present or persist an empty/default state when the network is
  slow or fails.** Slow loading with a spinner is acceptable; falling back to blank
  localStorage is how the data-loss incident happened.
- `_normaliseState` must never *infer* user intent (e.g. marking `draftSubmitted` because
  picks exist). Normalisation fills structural gaps only.
- Eager writes + realtime means a half-finished local interaction can be broadcast and
  "healed" on other clients — reason through mid-interaction states explicitly.
- Keep the change in its own small commit, separate from UI work, so it can be reverted
  alone.

## After editing — manual test matrix

Test in two browser windows side by side (two clients on the realtime channel):

1. Normal load with good network — state intact.
2. Simulated slow/offline load (DevTools network throttling/offline) — app waits or
   errors visibly; it never shows an empty game or writes one back.
3. Make a pick in window A mid-draft — window B updates and nobody's draft is
   auto-submitted.
4. Confirm Supabase `updated_at` moves on save, and the row JSON still contains all
   players, picks, and points (diff against your snapshot).

If anything fails, restore the snapshot row before doing anything else.
