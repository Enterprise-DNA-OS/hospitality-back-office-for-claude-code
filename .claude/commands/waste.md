---
description: Log waste (spoiled, dropped, overproduced, staff meals, comps) or review what went in the bin and what it cost.
---

- Log: `node scripts/venue.mjs waste add "VENUE" "ITEM" QTY --reason=spoiled|dropped|overproduced|returned|staff meal|comp [--by=]`.
- Review: `waste --days=14 --json`. Group by item and reason, total the cost at today's prices.

Waste lowers stock on hand until the next count, and explains part of a high cost of goods. Repeated spoilage of one item is a par level set too high: suggest `item par "ITEM" --par=`.
