# F1 Grid Masters — guide for Claude Code sessions

An F1 fantasy league web app for a **live 16-player game, mid-2026-season**.
Real people's picks and points live in production. **Zero data loss tolerance.**

## Architecture

- The entire app is one file: `index.html` (~7,400 lines). No build, no modules, no tests.
  - CSS: roughly lines 19–1250 (one `<style>` block)
  - HTML body: roughly lines 1250–1625
  - JavaScript: roughly lines 1626–end (~167 functions in one script scope)
  - Line numbers drift — search for function names, don't trust absolute offsets.
- CDN dependencies loaded in `<head>`: Supabase JS and html2canvas (jsdelivr).
- Deployed via Netlify; pushes to `main` go live to the players. There is no staging.

## State and Supabase (the #1 danger zone)

- Global `STATE` object, persisted two ways: localStorage and a Supabase upsert of the
  **whole state as a single row** (`f1_game_state`, `id: 'main'`). `f1_analytics` holds
  usage events.
- Realtime subscription rebroadcasts state to every open browser and re-runs
  `_normaliseState()` on receipt.
- Safety layers around the save path (July 2026) — preserve all of these:
  - `_stateLoaded` guard: no Supabase write is allowed until server state has been seen
    (successful load, PGRST116 fresh install, or realtime payload).
  - `saveState()` = debounced routine saves; `saveStateCritical()` = immediate save with
    3 retries + error toast, used for pick submission, results and admin amendments.
  - `_mergeRemoteState()` merge-on-write: player-keyed maps are merged before each
    upsert so concurrent submissions don't erase each other. Intentional deletions must
    call `_noteDelete(...)`; wholesale overwrites must set `_skipMergeOnce = true`.

Hard rules, learned from real incidents:

1. **Never add timeouts or fallbacks to `loadState()` that can present an empty/default
   state.** An 8s `Promise.race` timeout once fell back to empty localStorage on a slow
   Supabase cold start and risked wiping the live game — it took a 3-commit revert chain
   to recover (see `bb736a8` → `348ac10` → `3e25970`). Slow load is acceptable;
   empty state is not.
2. **Treat `_normaliseState()` as load-bearing and fragile.** Its "self-heal" logic once
   auto-submitted players' drafts after a single driver tap because eager Supabase writes
   + realtime re-normalisation marked them `draftSubmitted` (`d309070`). Any change here
   must reason through the write → realtime → normalise round-trip on *other* clients.
3. Before any change to `saveState`/`loadState`/`_normaliseState`/realtime handling,
   snapshot the current `f1_game_state` row so it can be restored (see
   `.claude/skills/safe-state-change`).

## Other recurring bug classes

- **Timezones (UK/BST):** players are UK-based; the season spans the BST↔GMT switch.
  `toISOString()` round-tripped through `<input type="datetime-local">` once shifted the
  pick deadline an hour early (`330461b`). Never use `toISOString()` for local-time
  inputs; keep the `getTimezoneOffset()` adjustment. `new Date(2026, mon, day)` parses in
  *local* time — fine for UK users, wrong if code ever runs server-side/UTC.
- **Driver identity mapping:** driver data is keyed inconsistently across car numbers,
  3-letter acronyms (OpenF1), surnames, and hard-coded media CDN image URLs. This has
  broken four times (`8dc1dab`, `5bde18e`, `df2b437`, `0bb67e4`). When adding any
  driver-facing surface, map by `name_acronym` with a fallback, and verify 2026 rookies
  (Antonelli, Lindblad) whose CDN paths differ.
- **Share images:** two fragile paths — hand-drawn canvas in `shareStandingsImage()` and
  html2canvas for pick-order cards. Layout tweaks silently break these; always
  regenerate both images and eyeball them before pushing.

## Hardcoded data that changes every race weekend

`RACES`, `DRIVERS` (near the top of the script), `WEEKENDS` and `TV_SESSIONS` (near the
bottom). TV times carry `confirmed: true/false` flags and a `tz: 'BST'` label.
Use `.claude/skills/race-weekend-update` for the update procedure.

## Working conventions

- **Small commits, one concern each.** A six-fix batch commit (`bbc98ea`) was fully
  reverted because one follow-up change went bad; isolated commits limit blast radius.
- **Don't start new phased roadmaps on new branches.** Two 5–6 phase plans
  (`v2.0-upgrade`, `openf1-integration`) were both abandoned unmerged while `main`
  moved on. Prefer finishing one small merge-able slice over planning phase 3+.
- Verify before push to `main`: open `index.html` locally in a browser, check the console
  is clean, exercise the changed feature, and confirm Supabase `updated_at` moves on save.
- Unmerged branches with large rewrites of this same file exist
  (`v2.0-upgrade`, `openf1-integration`); expect conflicts if reviving them.
