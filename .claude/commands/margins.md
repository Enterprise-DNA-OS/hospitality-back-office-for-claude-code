---
description: Wages, purchases and prime cost as a share of sales, by venue and week, plus the real cost of goods between the last two stock counts. The number the owner runs the business on.
---

1. Run `node scripts/venue.mjs margins --json` (`--weeks=8` for longer, `--venue=` for one).
2. Present a table per venue: week, sales, wage %, purchase %, prime %. Mark anything over its target (`settings` has them).
3. Then the cost of goods block: opening stock + invoiced - closing stock, against the same days' sales, food and beverage separately. Say plainly that purchases are a stand-in week to week and the count-to-count figure is the real one.
4. If cost of goods is high, find why: `price-watch --json` (a cost that moved), `waste --json` (what went in the bin), `recipes --json` (dishes over target). Give the top two reasons with dollar figures.
5. If a venue has no count-to-count figure, its counts are stale: suggest `/count`.
