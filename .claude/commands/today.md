---
description: Yesterday (or any day) venue by venue - sales ex GST against the same day last week, covers, spend per cover, wages and wage share, and whether the cash-up balanced. The morning read.
---

1. Run `node scripts/venue.mjs today --json` (add `--date=YYYY-MM-DD` for another day).
2. One short paragraph per venue: sales and the move against last week, covers and spend per cover, wages as a share of sales against the target, the cash-up state.
3. Name anything off: a wage share over target, a missing or unexplained cash-up, a day down more than 15% on last week. Check `notes` for a reason before guessing one (roadworks, weather, a function).
4. No sales for the day means nobody keyed them: say so and offer `sales add VENUE --date= --food= --bev= --covers=`.
