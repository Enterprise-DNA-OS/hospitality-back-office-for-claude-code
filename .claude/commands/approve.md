---
description: Clear the timesheet approval queue. Confirms the hours as recorded; never edits them to look better.
---

1. Run `node scripts/venue.mjs timesheets --pending --json` and show the queue, short breaks first.
2. On the operator's yes, `node scripts/venue.mjs approve --all --json` (or `approve TS-...` one by one).
3. Open sheets are refused: they need a clock-out first (`/clock`). Short breaks are approved as they happened and named: the fix is the break practice.
4. Then `export` writes timesheets.csv for payroll.
