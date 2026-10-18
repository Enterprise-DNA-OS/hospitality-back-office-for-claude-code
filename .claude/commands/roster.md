---
description: The week's roster day by day, costed at each person's rate, with open shifts, late drafts and anyone past their right to work loud. Default next week.
---

1. Run `node scripts/venue.mjs roster --json` (`--week=this` or a date for another week, `--venue=` for one).
2. Present it day by day per venue: times, who, paid hours, cost. Then the totals.
3. Call out: OPEN shifts, DRAFT LATE (inside the notice window), NO WORK RIGHTS (rank 1: unassign today), and any day at a licensed venue with no certified duty manager (`compliance duty-manager --json`).
4. Put the roster cost next to last week's sales at that venue (`margins --json`) so the operator sees the wage share before it happens.
