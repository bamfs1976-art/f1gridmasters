# Season changeover

How to roll F1 Grid Masters from one season to the next. Written for the
2026 → 2027 rollover, but the steps hold for any year.

Read this in full before you start. The live game is 16 real players' picks and
points, and step 3 deletes them from the live row.

## Why there is a procedure at all

Saved state keys picks and results by race id only — `draftPicks.r1`,
`raceResults.r14` and so on. There is **no season dimension**. 2027 reuses the
same `r1`–`r24` ids, so a new season's data lands on top of the old season's.

That is why the finished season has to be archived and the live game reset
*before* `SEASON_YEAR` is flipped, not after.

## Timing

Do this **after the last race of the season is fully settled** — result entered,
draft revealed, standings correct, any amendments done — and **before players
start picking for round 1 of the new season**.

For 2026 that window is: after Abu Dhabi (6 December 2026) and before the 2027
opener in Bahrain (14 March 2027). Pre-season testing is 24–27 February 2027.

Do **not** flip mid-season. `RACES` drives `currentRaceIdx`, round counts, the
draft rotation and every share card.

## Step 1 — Back up the finished season

Two copies, belt and braces:

1. Copy the live row to a named backup row in Supabase:

   ```sql
   insert into f1_game_state (id, state, updated_at, version)
   select 'backup-2026-final', state, now(), version
   from f1_game_state where id='main'
   on conflict (id) do update set state=excluded.state, updated_at=now();
   ```

2. Download the JSON from the app: Admin → Export. `adminResetSeason()` also
   triggers this automatically, but take it yourself first so you have it
   regardless.

Verify the backup row's `pg_column_size(state)` matches `main` before moving on.

## Step 2 — Build the archive page

The 2025 page is the template. In `index.html`, `S2025_DRIVER_STANDINGS`,
`S2025_TEAM_STANDINGS` and `S2025_RACES` are static arrays, rendered by
`render2025()` and reached from the "2025 SEASON" nav tab.

For 2026, add the equivalent `S2026_*` arrays with the final standings and
results, plus a `render2026()` and a nav tab. Take the numbers from the backup
in step 1, not from memory.

Two notes on the existing 2025 page:

- Its retrospective prose ("Moving to Red Bull for 2026", "2026 PICK
  STRATEGY", the circuit form guide) is deliberately written in 2026 terms and
  is **not** templated. It is a period document. Leave it.
- The three labels that test the *live* grid — the "IN 2026?" column header,
  "NOT ON 2026 GRID" and "(not in 2026)" — **are** templated on `SEASON_YEAR`,
  so they follow the season automatically.

## Step 3 — Reset the live game

Admin → Danger Zone → **FULL SEASON RESET**.

This clears players, picks, results and the activity log, sets
`_skipMergeOnce` so the write overwrites rather than merges, and removes the
local state cache. It cannot be undone — hence step 1.

Then re-add the players for the new season on the Setup page and start the
season, which generates a fresh randomised `baseOrder`.

## Step 4 — Flip the switch

In `index.html`, one line:

```js
const SEASON_YEAR = 2026;   // -> 2027
```

That single change updates:

- `RACES`, via `SEASON_CALENDARS[SEASON_YEAR]`
- every on-screen year label, through `applySeasonLabels()`
- the page `<title>`, meta description and og:title
- all share-card and WhatsApp titles
- the pick-deadline date maths (`new Date(SEASON_YEAR, …)` and `parseRaceDate`)
- the results import URL (`api.jolpi.ca/ergast/f1/${SEASON_YEAR}/…`)
- the localStorage state cache key, so browsers start clean
- the calendar round count and the driver/team counts on the grid header
- the "next season" preview tab, which hides itself once no future calendar
  exists

Theme and player-identity storage keys are **not** season-stamped, so
preferences and "who am I" survive the rollover on purpose.

## Step 5 — Update the season's own data

- **Drivers.** `DRIVERS` still holds the outgoing season's grid. Update it for
  the new season: teams, car numbers, images (`DRIVER_IMAGES`), nationalities
  (`DRIVER_NATIONS`) and the Elo priors in `PRIOR`, which should be the
  previous season's points. Remember `active:false` marks a driver kept for
  history but no longer pickable — clear those flags or drop the entries as
  appropriate.
- **TV times.** `TV_SESSIONS_2027` ships empty because Sky had not published
  2027 session times. The TV guide degrades gracefully, showing the weekend
  date with no session rows. Fill it in per weekend with
  `.claude/skills/race-weekend-update`.
- **Provisional rounds.** Any round with `provisional:true` needs that flag
  removed once the FIA confirms it. For 2027 that is `r17`, Türkiye at Istanbul
  Park.

## Step 6 — Verify before pushing to main

`main` deploys straight to the players. Open `index.html` locally and check:

- the console is clean
- the calendar shows the right number of rounds and the right sprint weekends
- the TV guide renders with no session data present
- both share images generate — the race report and the pick-order card
- a pick submission saves and Supabase `updated_at` moves

## Adding a further season

Add a `RACES_<year>` array and one entry to `SEASON_CALENDARS`. The next-season
preview tab appears on its own as soon as `SEASON_YEAR + 1` has a calendar, and
disappears again when the live season catches up.
