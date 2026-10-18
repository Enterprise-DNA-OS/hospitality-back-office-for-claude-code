---
description: Stock on hand per venue against par - the last count plus what was invoiced since, less waste - and what to order.
---

1. Run `node scripts/venue.mjs stock --json` (`--below` for under par only, `--venue=` for one).
2. Present under-par items first, grouped by supplier, with the packs to order.
3. Say once that on hand is an estimate until the next count (sales do not draw it down), and how old the last count is.
4. Offer `/order` to turn the under-par list into draft orders.
