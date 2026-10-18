---
description: Record or review the day's takings per venue (food, beverage, other, covers, ex GST) from the POS end-of-day report.
---

To record: `node scripts/venue.mjs sales add "VENUE" --date=YYYY-MM-DD --food= --bev= [--other=] [--covers=] [--note=]`. Amounts ex GST, in dollars. Re-running for the same day replaces it.

To review: `node scripts/venue.mjs sales --days=14 --json` (`--venue=` for one). Present day by day with wages and wage share alongside.

If the operator pastes a POS report, read the totals off it, say back the figures you are about to record, then record them. Never guess a figure that is not on the report.
