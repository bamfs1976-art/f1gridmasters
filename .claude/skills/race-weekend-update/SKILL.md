---
name: race-weekend-update
description: Update F1 Grid Masters for an upcoming race weekend — TV session times, confirmed flags, pick deadline, and (after the race) results entry. Use whenever the user says "update for <GP name>", "set the deadline", "enter results", or mentions an upcoming/finished race weekend.
---

# Race weekend update

All data lives in `index.html`. This is the most frequent recurring chore and the most
common source of small errors — follow the checklist exactly.

## Before the weekend

1. **TV Guide** — find `TV_SESSIONS` (search for `TV_SESSIONS`, near the bottom of the
   script). Update the session times for the upcoming GP:
   - Times are UK local strings with `tz: 'BST'` (or `'GMT'` in winter). Double-check
     which applies — the BST↔GMT switch has caused off-by-one-hour bugs before.
   - Set `confirmed: true` only for times verified against the published Sky Sports F1
     schedule; leave `confirmed: false` otherwise (the UI labels these as approximate).
2. **Pick deadline** — the admin panel deadline uses `<input type="datetime-local">`.
   The code must keep the `getTimezoneOffset()` adjustment; never pre-fill it via
   `toISOString()` (that stored UTC once and fired the deadline an hour early).
   Deadline convention: shortly before qualifying/sprint quali, UK time.
3. **Weekend dates** — check `WEEKENDS` and `RACES` entries match the official calendar
   (sprint weekends have a different session structure).

## After the race

1. Enter results via the admin flow (or the results structures in `STATE`), never by
   hand-editing the Supabase row.
2. Driver identity gotcha: results/API data may key drivers by car number, 3-letter
   acronym, or surname — these have drifted before. Map via acronym with a fallback and
   sanity-check rookies (Antonelli, Lindblad) and any driver whose number changed.
3. Regenerate/preview both share images (standings canvas + pick-order card) if
   standings changed — layout edits silently break them.

## Verify before pushing

- Open `index.html` in a browser, console clean.
- TV Guide shows the new GP with correct times and confirmed badges.
- Deadline displays the intended UK local time in the admin input.
- Remember: pushing to `main` deploys live via Netlify.
