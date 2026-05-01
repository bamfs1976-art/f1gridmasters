# F1 Grid Masters v2.0 — Task List
**Branch:** `v2.0-upgrade`
**Updated:** 2026-05-01 (Phase 1 complete — commit 9095143)

---

## PHASE 1 — Reliability & Foundation

- [x] **1.1** `saveStateCritical()` — immediate Supabase write with 3-attempt exponential backoff retry
  - AC: submit → Supabase updated_at changes within 2s ✓
  - AC: 3 retries logged, error toast on final failure ✓

- [x] **1.2** Edit preferences fix — reopen pick grid after submission, re-submit writes immediately
  - AC: "Edit My Picks" button visible when submitted + picks not yet resolved ✓ (already existed)
  - AC: `_localEditLock` released in `finally` block ✓
  - AC: Realtime cannot overwrite during active edit session ✓

- [x] **1.3** Home / Dashboard tab — next race, standings top 5, draft status, activity feed
  - AC: Default landing page when season started ✓
  - AC: Countdown timer ticks live ✓ (1s setInterval, d/h/m/s)
  - AC: Activity feed shows last 10 log entries ✓

- [x] **1.4** Navigation consolidation — 5-tab desktop, bottom mobile nav bar
  - AC: Desktop: HOME · DRAFT · RESULTS · STANDINGS · MORE at 1440px without scroll ✓
  - AC: Mobile: bottom nav visible at 375px, all items 44px+ tap targets ✓
  - AC: All existing pages still reachable via MORE dropdown + drawer ✓

### Phase 1 Checkpoint
- [x] App loads on branch without console errors
- [x] Supabase updated_at changes on pick submit
- [x] Home tab renders, countdown ticks
- [x] Bottom mobile nav functional at 375px

---

## PHASE 2 — Automated Results

- [x] **2.1** Jolpica API fetch for race results — admin panel "Fetch from API" button
  - AC: Fills result form for a completed 2026 race ✓
  - AC: Graceful error if API down ("Could not fetch. Enter manually.") ✓
  - AC: 24h localStorage cache ✓ (f1gm_import_cache_{round})

- [x] **2.2** Race calendar sync — fetch Jolpica 2026 calendar, store in `STATE.racesCalendar`
  - AC: `STATE.racesCalendar` populated after app load ✓
  - AC: Schedule page uses Jolpica dates if available ✓ (_calendarDate helper)
  - AC: 1h cache; falls back to hardcoded RACES on failure ✓

- [x] **2.3** Post-race auto-prompt — banner in admin when race just passed without result
  - AC: Banner visible 1–3 days after race date when result not saved ✓
  - AC: Dismisses for session on click/X ✓ (sessionStorage)
  - AC: Not visible on non-admin views ✓

### Phase 2 Checkpoint
- [x] Fetch results populates form for at least one 2026 race
- [x] Calendar sync runs silently, no UI impact
- [x] Post-race banner appears/dismisses

---

## PHASE 3 — Intelligence & Engagement

- [ ] **3.1** Driver form guide on Draft page — last 5 real F1 finishing positions
  - AC: Position badges + trend arrow visible per driver
  - AC: Hidden (not errored) when API unavailable
  - AC: Collapsible on mobile
  - Touches: `renderDraft()`, new `renderDriverFormCard()`, new `fetchDriverForm()`

- [ ] **3.2** Track history card on Draft page — 2023/2024/2025 results at current circuit
  - AC: Table shows correct drivers' historical positions
  - AC: Missing years show "—"
  - AC: 7-day cache per circuit
  - Touches: `renderDraft()`, new `fetchTrackHistory()`, circuit ID lookup table

- [ ] **3.3** Activity feed — Supabase `f1_activity_log` table + realtime on Home tab
  - AC: `CREATE TABLE` migration applied, RLS enabled
  - AC: Pick submission inserts a row
  - AC: Home tab shows live feed
  - AC: Falls back to `STATE.activityLog` if table unavailable
  - Touches: Supabase migration, `submitMyPrefs()`, `resolveDraft()`, `saveResult()`, `renderHome()`

- [ ] **3.4** Smart pick suggestion — top 3 informational driver suggestions pre-submit
  - AC: Visible before submission, hidden after
  - AC: Excludes drivers likely taken by earlier drafters
  - AC: Hidden (not errored) if no form/history data cached
  - Touches: `renderDraft()`, new `suggestPicks()` pure function

### Phase 3 Checkpoint
- [ ] `f1_activity_log` table exists in Supabase with RLS
- [ ] Activity feed on Home tab updates in real time
- [ ] Driver form guide renders on Draft page (or hides gracefully)
- [ ] Smart suggestions visible pre-submit

---

## PHASE 4 — Season Depth

- [ ] **4.1** Season stats sub-tab — per-player total/avg/best/worst/sparkline
  - AC: New 6th sub-tab on Stats page
  - AC: Sparkline shows correct rank trajectory across completed races
  - AC: Player card expands to show full race history
  - Touches: `renderStats()`, `showStatsSub()`, new `renderSeasonStats(el)`

- [ ] **4.2** Race preview card on Draft page — circuit info + draft order badges
  - AC: Visible before submission, hidden after all picks resolved
  - AC: Track type shown (street/permanent/semi-permanent)
  - AC: Last year's top 3 from Jolpica or cached data
  - Touches: `renderDraft()`, new `renderRacePreviewCard()`

- [ ] **4.3** H2H Chart.js charts — bar (pts/race) + line (cumulative)
  - AC: Chart.js CDN added to `<head>`
  - AC: Two charts render on H2H sub-tab
  - AC: Charts update on player selection change
  - AC: Dark/light mode respected
  - Touches: `<head>`, `renderH2H()`, `updateH2H()`

### Phase 4 Checkpoint
- [ ] Season stats sub-tab renders all 16 players
- [ ] Race preview card visible on Draft page
- [ ] H2H charts functional in both dark and light mode

---

## PHASE 5 — Social & Delight

- [ ] **5.1** Race status banner improvements — progress bar + submitted names + deadline countdown
  - AC: Progress bar fills correctly
  - AC: Names list visible (truncated on mobile)
  - AC: Deadline countdown visible when set
  - Touches: `updateRaceStatusBanner()`, CSS

- [ ] **5.2** Draft reveal animation — team-colour glow, 500ms per card in draft order
  - AC: Animation plays once per session when reveals happen
  - AC: Skips if `prefers-reduced-motion: reduce`
  - AC: Team colour glow correct per driver
  - Touches: `renderDraft()`, `adminRevealDraft()`, CSS

- [ ] **5.3** Share race result — Web Share API + clipboard fallback
  - AC: "Share Result" button on completed races
  - AC: Correct text format with all 16 players sorted by points
  - AC: Web Share API on mobile, clipboard on desktop
  - Touches: `renderResults()`

- [ ] **5.4** Onboarding modal — 4-step first-visit flow
  - AC: Shows on first visit (no `f1gm_onboarded` flag)
  - AC: "Don't show again" persists
  - AC: Step 4 opens identity overlay
  - Touches: HTML modal, `initApp()`, `showIdentityOverlay()`

### Phase 5 Checkpoint
- [ ] Status banner progress bar visible
- [ ] Reveal animation plays on reveal (test with re-hide + re-reveal)
- [ ] Share text copied/shared correctly
- [ ] Onboarding shows on first visit, not second

---

## PHASE 6 — Polish

- [ ] **6.1** Responsive audit — 375px/390px/768px/1440px, 44px touch targets
- [ ] **6.2** Accessibility pass — ARIA, keyboard nav, focus rings, contrast, aria-live
- [ ] **6.3** Performance — Jolpica cache TTLs, skeleton loaders, lazy render
- [ ] **6.4** Error handling — user-friendly messages on all API failures, offline detection

### Phase 6 Checkpoint (final before merge)
- [ ] No horizontal scroll at 375px
- [ ] Keyboard navigation through all new elements
- [ ] No raw error text visible to users
- [ ] All Jolpica failures handled gracefully

---

## Merge gate
Only tick after Anthony's sign-off:
- [ ] Anthony has reviewed on `v2.0-upgrade` branch
- [ ] All Phase 1–6 checkpoints ticked
- [ ] Supabase data confirmed intact (16 players, 3 results, current race picks)
- [ ] `git merge v2.0-upgrade --no-ff` into `main`
- [ ] Netlify deploy confirmed live
