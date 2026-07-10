# Claude Code usage audit — F1 Grid Masters

*July 2026. Produced by auditing all 26 commits across 4 branches (every commit in this
repo is Claude Code work) plus the codebase itself. Local session transcripts don't sync
to cloud sessions, so the git/branch/PR footprint is the evidence base.*

## Friction clusters (ranked by cost)

### 1. Supabase state integrity — two incidents, highest severity
- **Data-loss near miss (Apr 19):** `bb736a8` added an 8s timeout to `loadState()` that
  fell back to empty localStorage on slow Supabase cold starts — on a live 16-player
  game. Recovery took a 3-commit unwind (`348ac10`, `3e25970`, `901ab99`) and threw away
  an entire batch of unrelated fixes.
- **Auto-submit bug (Mar 30):** `d309070` — `_normaliseState()` self-heal marked players
  `draftSubmitted` after one driver tap, via eager writes + realtime rebroadcast.
- Root cause pattern: changes to the save/load/normalise/realtime round-trip made
  without reasoning about slow networks or other clients. Same function
  (`_normaliseState`) implicated in both incidents.

### 2. Two abandoned multi-phase roadmaps — largest wasted effort
- `v2.0-upgrade`: 6-phase plan, stalled after Phase 2 (May 1), never merged. Its
  reliability work (`saveStateCritical` with retry) never reached `main` — the exact fix
  Cluster 1 needed.
- `openf1-integration`: separate 5-phase effort (May 5), never merged, and it
  **re-implements features the v2.0 plan already covered** (form guide, post-race
  summary, season stats).
- ~11 phase commits stranded; everything that actually shipped was done ad-hoc on `main`.

### 3. Batch commits amplify blast radius
- `bbc98ea` bundled six unrelated fixes; when one follow-up went bad, the whole batch was
  reverted. Small single-concern commits would have saved most of that work.

### 4. Recurring data drift: driver identity + race-weekend data
- Driver mapping (car numbers vs acronyms vs surnames vs CDN image paths) broke four
  times: `8dc1dab`, `5bde18e`, `df2b437`, `0bb67e4`.
- TV times, deadlines, and calendar data are hardcoded and hand-edited every race
  weekend; the BST/UTC deadline bug (`330461b`) came from this chore.

### 5. Monolith fragility
- One 7,421-line `index.html` (~167 functions, one scope). A whole feature was once lost
  in a "file sync" and had to be reconstructed (`be6a98a`). Three parallel branches
  rewrite the same file, guaranteeing conflicts. Every session pays a large
  context/navigation tax; there was no CLAUDE.md, README, tests, or schema docs.

### 6. No gate between a session and production
- Zero PRs ever; pushes to `main` deploy straight to the live game via Netlify with no
  documented verification step.

## What was added in this audit (committed on this branch)

- **`CLAUDE.md`** — architecture map, the hard rules from both Supabase incidents,
  timezone and driver-mapping gotchas, data locations, working conventions.
- **`.claude/skills/race-weekend-update`** — checklist for the every-weekend chore
  (TV times, confirmed flags, deadline, results, share images).
- **`.claude/skills/safe-state-change`** — mandatory snapshot-first protocol and a
  two-browser test matrix for any change touching state persistence.

## Proposed automations (not yet implemented — pick what you want)

1. **Nightly state snapshot.** A scheduled GitHub Action that fetches the
   `f1_game_state` row and commits it to a `backups/` folder (or stores it as an
   artifact). Turns any future data-loss incident into a one-file restore. Highest
   value-for-effort of everything here.
2. **Race-weekend reminder session.** A scheduled task (GitHub Action cron or a
   recurring Claude session) that runs the Thursday before each GP: check `TV_SESSIONS`
   confirmed flags and the deadline for the upcoming race, and open an issue/message if
   they're stale.
3. **Pre-push syntax check.** A tiny script that extracts the `<script>` block and runs
   `node --check` on it, wired as a git pre-push hook or Claude Code PostToolUse hook —
   catches the "lost/truncated function" class of error before Netlify deploys it.
4. **Branch protection + PRs for `main`.** Even self-merged PRs create a diff-review
   moment and a deploy preview (Netlify builds PR previews for free) before the live
   game updates.

## Proposed structural fixes (bigger, do when ready)

1. **Split `index.html`** into `css/`, `js/data.js`, `js/state.js`, `js/render-*.js`,
   `js/share.js`, `js/admin.js`. Mechanical, no behaviour change; removes the biggest
   per-session tax and lets branches stop colliding on one file.
2. **Externalize race-weekend data** to `data/*.json` (or finish the Jolpica calendar
   sync already built on `v2.0-upgrade`), so the weekly chore is a data edit, not a
   code edit.
3. **Port `saveStateCritical` (retry + immediate write) from `v2.0-upgrade` to `main`**,
   then close both stale branches — salvage what's useful, stop carrying two divergent
   rewrites.
4. Note: the Supabase anon key is committed in `index.html` (normal for anon keys, but
   only safe if Row Level Security is configured) and admin auth is a client-side hash
   check — worth revisiting if the league grows beyond trusted friends.
