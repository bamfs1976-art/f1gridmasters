# F1 Grid Masters v2.0 — Implementation Plan
**Branch:** `v2.0-upgrade`
**Date:** 2026-05-01
**Live game:** 16 players, mid-season. Zero data loss tolerance.

---

## Codebase snapshot (before changes)

| Metric | Value |
|---|---|
| File | `F1/index.html` (single file) |
| Lines | 6,771 |
| State store | Supabase `f1_game_state` JSONB + localStorage fallback |
| Save mechanism | localStorage immediate + 400ms debounced Supabase upsert |
| Realtime | Supabase channel subscription, blocked by `_localEditLock` |
| Navigation | Desktop: scrollable tab bar (10 tabs). Mobile: hamburger drawer |
| Pages | setup, draft, results, leaderboard, schedule, drivers, stats, 2026gp, 2025, admin |

## What already exists (do NOT rebuild)

| Spec feature | Existing function | Status |
|---|---|---|
| Form guide | `renderFormGuide(el)` line 4254 | Complete — player points bars/dots |
| H2H comparison | `renderH2H(el)` line 4320 | Complete — needs Chart.js charts |
| Driver stats | `renderDriverStats(el)` line 4426 | Complete |
| Race countdown | `updateRaceCountdown()` line 6729 | Complete |
| Activity log (STATE) | `STATE.activityLog`, `addLog()` | Complete — in-memory only |
| `_localEditLock` | line 1920 | Exists, used in `submitMyPrefs` |
| Save debounce | `saveState()` line 1809 | 400ms — needs Phase 1 fix |
| Stats page | `renderStats()` line 4226 | Complete — 5 sub-tabs |

---

## Dependency graph

```
Phase 1 (Reliability + Nav)
    └── Phase 2 (API Integration)
            └── Phase 3 (Intelligence) — uses Jolpica data
                    └── Phase 4 (Season Depth) — uses activity feed
Phase 5 (Social) — parallel with Phase 4, no hard deps
Phase 6 (Polish) — last, reads all prior work
```

All phases share: STATE schema, RACES array, DRIVERS array, Supabase connection.

---

## Critical constraints

1. **Never** touch existing `STATE.players`, `STATE.draftPicks`, `STATE.raceResults`, `STATE.draftPrefs`, `STATE.draftSubmitted`
2. New STATE fields must be initialised defensively in `_normaliseState()`
3. Every Supabase write must be tested against a snapshot first
4. New Supabase tables are additive (`f1_activity_log`) — never replace `f1_game_state`
5. All features degrade gracefully if data is absent
6. Branch `v2.0-upgrade` only — no pushes to `main` until Anthony approves

---

## Phase 1 — Reliability & Foundation
**Goal:** Fix save reliability, improve submit flow, add Home tab, consolidate nav.
**Checkpoint:** App loads correctly on branch, no regressions on existing picks/scores.

### Task 1.1 — Immediate Supabase write on submit
**What:** Replace the 400ms debounce in `saveState()` with an immediate Supabase write when called from `submitMyPrefs()`. Keep debounce for non-critical background saves.

**Implementation:**
- Add `saveStateCritical()` — writes localStorage immediately AND awaits Supabase upsert without debounce
- Add retry: 3 attempts with 1s / 2s / 4s exponential backoff on Supabase failure
- Show "✓ Saved to server [HH:MM]" toast on success, "⚠ Save failed — retrying" on error
- `submitMyPrefs()` calls `saveStateCritical()` instead of `saveState()`
- Keep `saveState()` unchanged for all other callers

**Files:** `saveState()` area (~line 1809), `submitMyPrefs()` (~line 2091)

**Acceptance:**
- Submit picks → Supabase row updated within 2s
- Network failure → 3 retries visible in console → error toast after final failure
- Existing debounce saves still work for non-submit calls

### Task 1.2 — Edit preferences fix
**What:** After submitting, "Edit My Picks" must: (a) reopen preference list, (b) on re-submit write immediately to Supabase, (c) confirm save, (d) release lock cleanly.

**Implementation:**
- In `renderDraft()`, when `iHaveSubmitted` is true and picks not yet resolved, show "✏ EDIT MY PICKS" button
- Button calls `editMyPrefs(raceId)`:
  - Sets `_localEditLock = true`
  - Clears `STATE.draftSubmitted[raceId][SESSION_PLAYER_ID]` locally (does NOT clear prefs)
  - Re-renders draft page (shows pick grid again)
  - On re-submit, `submitMyPrefs()` calls `saveStateCritical()` then releases lock
- Lock released in `finally` block — never stranded

**Files:** `renderDraft()` (~line 2149), `submitMyPrefs()` (~line 2091)

**Acceptance:**
- Edit flow: tap edit → pick grid reopens → change rank → submit → "Saved ✓" → picks re-locked
- Realtime update from another player during edit does not overwrite session's edit
- If browser closes during edit, on reload player sees their submitted prefs (not cleared)

### Task 1.3 — Home / Dashboard tab
**What:** New default landing page. Shown to all players on load (when season started).

**Content:**
- Next race: name, flag, countdown timer (live, ticking)
- Draft status for current race: progress bar (X/16 submitted), names of who has/hasn't
- Top 5 standings: rank, name, points
- Your status: your rank, your points, whether you've submitted
- Activity feed: last 10 `STATE.activityLog` entries

**Implementation:**
- Add `<div class="page" id="page-home">` HTML before the draft page
- Add `renderHome()` JavaScript function
- Add "🏠 HOME" as first nav tab (desktop) and first mobile drawer item
- `initApp()` navigates to 'home' on load when season started (currently navigates to 'draft')
- `showPage('home')` calls `renderHome()`
- Home auto-refreshes on realtime updates (add to `subscribeToRealtime()`)

**Files:** HTML pages section (~line 1300), `showPage()` (~line 1925), nav HTML (~line 1340), `initApp()` (~line 6540)

**Acceptance:**
- Home page loads as default when app opens (season started)
- Countdown timer ticks live
- Standings show current top 5 with correct points
- Draft progress shows correct submitted count

### Task 1.4 — Navigation consolidation
**What:** Reduce desktop tabs from 10 to 5. Add bottom mobile nav bar (replaces hamburger drawer as primary nav).

**New structure:**
- Desktop: HOME · DRAFT · RESULTS · STANDINGS · MORE ▾
- MORE dropdown: Calendar, Drivers, Stats, 2026 GP, 2025 Season, Admin
- Mobile bottom nav: 5 fixed icons (Home, Draft, Results, Standings, More)
- MORE on mobile: bottom sheet or existing drawer (simplified)

**Implementation:**
- Add bottom nav HTML (fixed, `z-index: 150`, above page padding)
- Add CSS: `.bottom-nav`, `.bottom-nav-item`, `.bottom-nav-badge`
- Add mobile padding-bottom 80px to `.page` on mobile
- `syncMobileNav(id)` updates bottom nav active state
- MORE dropdown: CSS `:hover`/JS toggle menu above the MORE button
- Preserve all existing `showPage()` calls — only nav chrome changes
- Keep existing hamburger drawer as fallback (some users may prefer it)

**Files:** CSS (~line 150), HTML nav (~line 1340), `syncMobileNav()`, `showPage()`

**Acceptance:**
- Desktop: 5 tabs visible without scrolling at 1440px
- Mobile: bottom nav visible at 375px, all 5 items tappable (44px targets)
- All existing pages still accessible
- Active tab highlights correctly on all screen sizes

---

## Phase 1 checkpoint
Before moving to Phase 2:
- [ ] App loads on `v2.0-upgrade` branch without errors
- [ ] Existing players/picks/scores unchanged (verify via Supabase)
- [ ] Home tab renders correctly
- [ ] Submit → immediate save confirmed (check Supabase updated_at)
- [ ] Mobile bottom nav functional at 375px

---

## Phase 2 — Automated Results
**Goal:** Wire up Jolpica F1 API. Auto-fetch results. Sync race calendar.

### Task 2.1 — Jolpica API integration (admin results fetch)
**What:** "Fetch Results" button in admin panel. Calls Jolpica, pre-fills results form.

**API endpoint:** `https://api.jolpi.ca/ergast/f1/2026/races/{round}/results.json`

**Driver mapping:** Jolpica uses `driverCode` (NOR, VER, HAM etc.) — these already match `DRIVERS[].short`.

**Implementation:**
- Add `async function fetchRaceResultsFromAPI(jolpiRound)` 
- Calls Jolpica endpoint with `fetch()`, parses `MRData.RaceTable.Races[0].Results`
- Maps `position` → driver `short` code → validates against `DRIVERS` array
- Returns `{ raceId, results: {1:short, 2:short...} }` or throws
- In admin panel: add "🌐 FETCH FROM API" button next to each race's results section
- Button shows spinner → pre-fills existing result inputs → admin reviews → clicks "Confirm and Score"
- Cache response in `localStorage` with race ID key + 24h TTL

**Files:** New function near `saveResult()` (~line 2739), admin panel HTML (~line 3400)

**Acceptance:**
- Button appears for races where no result is saved yet
- Fetch fills in finishing order correctly for 2026 races with results
- If API is down, shows "Could not fetch results. Enter manually." (no raw error)
- Cached results used if same race fetched twice within 24h

### Task 2.2 — Race calendar sync
**What:** On app load, fetch 2026 calendar from Jolpica. Update `STATE.racesCalendar` with latest dates/circuits. Do NOT modify the hardcoded `RACES` array (used for picks) — only update display data.

**API endpoint:** `https://api.jolpi.ca/ergast/f1/2026/races.json`

**Implementation:**
- Add `async function syncRaceCalendar()` called in `initApp()` after `loadState()`
- Store fetched calendar in `STATE.racesCalendar` (additive field, never overwrites picks data)
- `_normaliseState()` initialises `STATE.racesCalendar = STATE.racesCalendar || {}`
- `renderSchedule()` uses `STATE.racesCalendar[race.id]` data if available, falls back to hardcoded
- Calendar fetch: 1-hour localStorage TTL cache key `f1gm_calendar_2026`

**Files:** `loadState()`/`initApp()` area (~line 6540), `renderSchedule()` (~line 2915), `_normaliseState()` (~line 1839)

**Acceptance:**
- App loads without calendar fetch blocking UI
- Schedule page shows Jolpica dates when available
- No changes to pick logic when calendar fetch fails

### Task 2.3 — Post-race auto-prompt
**What:** After a race weekend, show admin a banner: "Results available for [GP]. Tap to fetch."

**Detection logic:** Compare `new Date()` against race dates in `STATE.racesCalendar` (or hardcoded dates). If current date is 1–3 days after a race date AND no result saved for that race → show prompt.

**Implementation:**
- Add `checkPostRacePrompt()` called in `initApp()` and in admin page render
- If condition met: render a dismissable banner in admin panel (above the existing cards)
- Banner has "Fetch Results" button that calls Task 2.1's `fetchRaceResultsFromAPI()`
- Dismissal stored in `sessionStorage` (shows once per session)

**Files:** `renderAdminDashboard()` (~line 3188), `initApp()`

**Acceptance:**
- Banner appears 1–3 days after a race if result not yet saved
- Dismisses on button click or X
- Does not appear on non-admin views

---

## Phase 2 checkpoint
Before Phase 3:
- [ ] API fetch works for at least one completed 2026 race
- [ ] Calendar sync runs silently on load
- [ ] Post-race prompt appears/dismisses correctly
- [ ] No impact on existing results or STATE

---

## Phase 3 — Intelligence & Engagement

### Task 3.1 — Driver form guide on Draft page
**What:** Card on Draft page showing each driver's last 5 real F1 finishing positions (from Jolpica), not just game points.

**Implementation:**
- Extend Jolpica cache: store per-driver last-5-results in `localStorage` key `f1gm_driver_form_2026` (24h TTL)
- `async function fetchDriverForm()` — calls Jolpica for each completed race, aggregates by driver code
- New `renderDriverFormCard(el)` function injected into `renderDraft()` after the driver grid
- For each driver: show 5 position badges, coloured: P1-3 gold, P4-6 green, P7-10 amber, DNF/P11+ grey
- Trend arrow: compare average of last 2 vs average of prior 3. Up = green ▲, Down = red ▼, Stable = grey —
- Collapses to summary on mobile, expands on tap

**Files:** `renderDraft()` (~line 2149), new helper functions

**Acceptance:**
- Form guide visible on draft page for 2026 season races
- Degrades gracefully if API unavailable (hides card, no error shown to user)
- Mobile: collapsible

### Task 3.2 — Track history card on Draft page
**What:** For the upcoming race circuit, show finishing positions for each driver in 2023, 2024, 2025 at the same circuit (by Jolpica circuit ID). Compact table: Driver | 2023 | 2024 | 2025 | Avg.

**Implementation:**
- `async function fetchTrackHistory(circuitId)` — queries Jolpica `/2023/{round}/results.json` etc.
- Map RACES circuit names to Jolpica circuit IDs (hardcoded lookup table — ~22 entries)
- Cache per circuit, 7-day TTL (historical data doesn't change)
- Render as compact table within Draft page, below driver form card
- Empty state: "Track history not available" if API fails

**Files:** `renderDraft()`, new helper, circuit ID lookup constant

**Acceptance:**
- Table appears on draft page for upcoming race
- Correct driver results shown for 2023/2024/2025 where available
- Missing years shown as "—"

### Task 3.3 — Activity feed (Supabase table)
**What:** New `f1_activity_log` table. Events: pick submitted, draft resolved, results confirmed, standings updated.

**Supabase migration:**
```sql
CREATE TABLE IF NOT EXISTS public.f1_activity_log (
  id bigserial PRIMARY KEY,
  event_type text NOT NULL,
  message text NOT NULL,
  player_id text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.f1_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read" ON public.f1_activity_log FOR SELECT USING (true);
CREATE POLICY "anon insert" ON public.f1_activity_log FOR INSERT WITH CHECK (true);
```

**Implementation:**
- `async function logActivity(eventType, message, playerId = null)` — inserts to `f1_activity_log`
- Fire-and-forget (no `await`, `catch` silently)
- Call from: `submitMyPrefs()`, `resolveDraft()`, `saveResult()`, `renderLeaderboard()` (on render with results)
- Home tab renders last 20 entries from `f1_activity_log` (with Supabase realtime on this table too)
- Falls back to `STATE.activityLog` if Supabase unavailable

**Files:** `submitMyPrefs()`, `resolveDraft()`, `saveResult()`, `renderHome()`, `subscribeToRealtime()`

**Acceptance:**
- Pick submission creates a row in `f1_activity_log`
- Home tab shows live feed updating in real time
- No errors if Supabase table unavailable

### Task 3.4 — Smart pick suggestion
**What:** Informational card on Draft page showing top 3 "suggested picks" based on available drivers.

**Algorithm (read-only, no auto-picking):**
1. Find which players draft before the current user (their position in draft order)
2. Predict likely picks of earlier drafters: take their top-ranked pref or, if unavailable, their next
3. From remaining drivers, rank by: (a) track history average (from 3.2), (b) form average last 5 (from 3.1), (c) 2025 championship position (fallback)
4. Show top 3 with 1-line rationale

**Implementation:**
- `function suggestPicks(raceId, myPlayerId)` — pure function, no API calls at suggestion time (uses cached data)
- Renders as collapsible card below the driver grid on the Draft page
- Only visible when: season started, picks not yet resolved, player has identity set, player has not yet submitted
- Disclaimer: "Suggestions only — your choice may differ"

**Files:** `renderDraft()`, new pure function

**Acceptance:**
- Suggestions shown before submission, hidden after
- Correctly excludes drivers likely taken by earlier drafters
- No suggestion if cached form/history data unavailable (card hidden, not errored)

---

## Phase 3 checkpoint
Before Phase 4:
- [ ] `f1_activity_log` table created and RLS enabled
- [ ] Activity feed visible on Home tab
- [ ] Driver form card renders on Draft page (or hides gracefully)
- [ ] Smart suggestions visible pre-submit

---

## Phase 4 — Season Depth

### Task 4.1 — Season stats expansion
**What:** Extend existing Stats page with per-player metrics: total/avg/best/worst race, most-picked driver, top-3 count, rank trajectory sparkline.

**Note:** `renderFormGuide`, `renderH2H`, `renderDriverStats` already exist. Add new sub-tab "Season Stats" with player cards.

**Implementation:**
- New `renderSeasonStats(el)` function — adds a 6th sub-tab on the Stats page
- Per player: total pts, avg/race, best race (name + pts), worst race, most-picked driver, top-3 count
- Sparkline: inline SVG showing rank position across completed races (compact 60×20px)
- `calcPlayerPoints()` already exists — extend with race breakdown
- Player cards: click to expand full history table

**Files:** `renderStats()` (~line 4226), `showStatsSub()` (~line 4234)

**Acceptance:**
- Season stats sub-tab visible and renders for all 16 players
- Sparkline shows correct rank trajectory
- Best/worst race shows race name not just points

### Task 4.2 — Race preview card
**What:** Before each draft opens, show a card: circuit name, country, date/time, track type, last year's top 3, draft order for this race.

**Implementation:**
- `renderRacePreviewCard(raceId)` — new function
- Injects at top of `renderDraft()` when picks not yet resolved (before the driver grid)
- Last year's top 3: from `STATE.racesCalendar` or Jolpica 2025 data (Task 3.2 cache)
- Track type: hardcoded lookup (22 entries): street / permanent / semi-permanent
- Draft order displayed as small numbered badges

**Files:** `renderDraft()`, new helper

**Acceptance:**
- Card visible before draft submission, hidden after all submit
- Correct circuit info shown

### Task 4.3 — H2H chart improvements
**What:** The existing `renderH2H()` shows a table. Add Chart.js bar chart (points per race) and line chart (cumulative points).

**Note:** Chart.js CDN is NOT currently in the app. Add it.

**Implementation:**
- Add `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js" defer></script>` to `<head>`
- In `updateH2H()`, after rendering the table, add two `<canvas>` elements
- Bar chart: `type: 'bar'`, one dataset per player, x-axis = race names
- Line chart: `type: 'line'`, cumulative sum, filled area
- Destroy existing charts before re-rendering (`chart.destroy()`)
- Dark theme: `Chart.defaults.color = '#9090b8'`

**Files:** `<head>` (~line 1), `renderH2H()` (~line 4320), `updateH2H()`

**Acceptance:**
- Two charts render on H2H tab
- Changing player selection updates charts
- Charts respect dark/light mode toggle

---

## Phase 4 checkpoint
Before Phase 5:
- [ ] Season stats sub-tab renders
- [ ] Race preview card shows on Draft page
- [ ] H2H charts functional
- [ ] No regressions on existing stats

---

## Phase 5 — Social & Delight

### Task 5.1 — Race status banner improvements
**What:** Enhance existing race status banner (already exists as `updateRaceStatusBanner()`). Add: deadline countdown, submitted player names list, visual progress bar.

**Implementation:**
- Find `updateRaceStatusBanner()` and `renderRaceStatusBanner()` — extend HTML output
- Add progress bar: `<div class="sub-progress-bar">` with width % = submittedCount/totalPlayers
- Add submitted names: "Submitted: Matthew, Kevin, Adam..." (or "X of 16 submitted" on mobile)
- Deadline countdown: if `STATE.draftDeadlines[race.id]` is set, show "Deadline in Xh Ym"
- Run `setInterval(updateRaceStatusBanner, 60000)` to keep countdown live

**Files:** `updateRaceStatusBanner()` / `renderRaceStatusBanner()`, CSS

**Acceptance:**
- Progress bar fills as players submit
- Deadline countdown visible when deadline is set
- Names list truncates gracefully on mobile

### Task 5.2 — Draft reveal animation
**What:** When admin reveals picks, driver cards appear one by one in draft order with team-colour glow.

**Implementation:**
- `adminRevealDraft()` already calls `STATE.draftRevealed[raceId] = true` then `renderAdminDashboard()`
- Add `animatePickReveal(raceId)` function — triggered after reveal, runs in `renderDraft()` on next call
- Uses `STATE.draftRevealed` flag + `sessionStorage` "animation played" key to run once per session
- Animation: driver cards start at `opacity:0, transform:scale(0.8)` then step through `draftOrder`, each with `setTimeout(i * 500ms)` reveal
- Team colour glow: `box-shadow: 0 0 20px ${teamColor}66` on reveal
- Sound: muted by default; Web Audio API (already used for submit feedback)

**Files:** `renderDraft()`, `adminRevealDraft()` (~line 3619), CSS `.driver-pick-card`

**Acceptance:**
- Animation plays once per session when picks are revealed
- Each card reveals in draft order with 500ms gap
- Skips animation if `prefers-reduced-motion: reduce`
- Works in both dark and light mode

### Task 5.3 — Share race result text
**What:** "Share Result" button on Results page generating formatted WhatsApp text.

**Text format:**
```
🏎 F1 Grid Masters — [GP Name]
1st: Matthew (RUS) — 10pts
2nd: Darryl (ANT) — 9pts
...
[f1gridmasters.netlify.app]
```

**Implementation:**
- Add "📤 SHARE RESULT" button in `renderResults()` for completed races (after results shown)
- `shareRaceResult(raceId)` function — builds text, calls `navigator.share()` (Web Share API) or `navigator.clipboard.writeText()` fallback
- Toast: "Copied to clipboard!" if clipboard only

**Files:** `renderResults()` (~line 2623)

**Acceptance:**
- Button visible on completed races
- Share sheet opens on mobile (Web Share API)
- Clipboard fallback on desktop
- Correct ordering by game points

### Task 5.4 — Onboarding modal
**What:** 4-step first-visit modal. Detected by `localStorage.getItem('f1gm_onboarded')`.

**Steps:**
1. Welcome to F1 Grid Masters (logo + tagline)
2. How the draft works (unique picks, snake order diagram)
3. How to submit (rank → lock in)
4. Choose your identity (links to identity overlay)

**Implementation:**
- Add modal HTML to page (always in DOM, shown/hidden via CSS)
- `checkOnboarding()` called in `initApp()` — shows modal if flag not set
- Next/Skip/Don't show again controls
- "Don't show again" sets `localStorage.setItem('f1gm_onboarded', '1')`
- Step 4: "Let's Go" button calls `showIdentityOverlay()` and closes modal

**Files:** HTML modal section, `initApp()`, `showIdentityOverlay()` (~line 5925)

**Acceptance:**
- Modal shows on first visit, not on subsequent visits
- Skip closes modal without setting flag (shows again next visit)
- "Don't show again" persists across sessions
- All 4 steps navigable with Next/Prev

---

## Phase 5 checkpoint
Before Phase 6:
- [ ] Status banner shows progress bar + names
- [ ] Reveal animation plays correctly
- [ ] Share text button generates correct output
- [ ] Onboarding shows on first visit, not on repeat visit

---

## Phase 6 — Polish

### Task 6.1 — Responsive audit
- Test at 375px, 390px, 768px, 1440px
- Fix: any element overflowing horizontally
- Fix: text truncation breaking layouts
- Touch targets: minimum 44px on all interactive elements
- Focus: bottom nav doesn't cover content at 375px

### Task 6.2 — Accessibility pass
- Keyboard navigation: Tab order through all interactive elements
- ARIA: `role="main"`, `aria-label` on standings table, draft cards, activity feed
- `aria-live="polite"` on: draft status, countdown, toast notifications
- Colour contrast: re-check all new elements at 4.5:1 (use browser DevTools)
- Focus rings: ensure visible on all new buttons/links
- Announce draft status changes to screen readers

### Task 6.3 — Performance & caching
- Lazy render: tab content only renders when that tab is active (already done for most pages)
- Jolpica cache: 1h TTL for calendar, 24h for race results, 7d for historical (Tasks 2.1, 3.1, 3.2)
- Skeleton loaders: show placeholder while API fetches complete
- Debounce: filter/search inputs 300ms

### Task 6.4 — Error handling
- Wrap all `fetch()` calls in try/catch with user-friendly messages
- "Could not fetch race results. Tap to retry." — no raw error strings shown
- Offline detection: `navigator.onLine` + `online`/`offline` event listeners
- Offline banner (already exists in HTML): enhance messaging
- All API failures: toast + console.warn (no `console.error` in production paths)

---

## Phase 6 checkpoint (final)
- [ ] No horizontal scroll at 375px
- [ ] All new elements keyboard navigable
- [ ] No raw error text visible to users
- [ ] Lighthouse performance score ≥ 85
- [ ] All Jolpica fetch failures handled gracefully

---

## Overall file size estimate
| Phase | Approx lines added |
|---|---|
| Phase 1 | ~400 |
| Phase 2 | ~250 |
| Phase 3 | ~500 |
| Phase 4 | ~350 |
| Phase 5 | ~400 |
| Phase 6 | ~150 |
| **Total** | **~2,050** → ~8,800 lines |

Single-file constraint is maintained. No build step required.

---

## Merge to main
Only after Anthony reviews and approves on branch:
```
git checkout main
git merge v2.0-upgrade --no-ff -m "F1 Grid Masters v2.0"
git push origin main
```
