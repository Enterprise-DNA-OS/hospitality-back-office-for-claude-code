---
description: The real cost of goods per venue and category, count to count - opening stock plus purchases minus closing stock, against the same days' sales.
---

1. Run `node scripts/venue.mjs cogs --json`.
2. Show each period: venue, category, dates, opening, bought, closing, used, sales, cost %, target.
3. Compare the latest period with the one before where there is one. A move of more than two points needs a reason: run `price-watch` and `waste` for the same dates.
4. Never present purchases alone as cost of goods.
