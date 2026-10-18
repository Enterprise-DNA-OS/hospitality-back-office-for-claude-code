---
description: Every recipe costed at today's prices - plate cost, cost % against target, margin a plate - or one recipe's card, or add and change recipes.
---

- All: `node scripts/venue.mjs recipes --json`. Show OVER TARGET and MISSING COST first.
- One: `recipe show "NAME" --json`: ingredients by cost, the last move on each, and the price that brings it to target.
- Change: `recipe add NAME --price= --category=food|beverage [--portions=]`, `recipe line "RECIPE" "ITEM" QTY` (0 removes), `recipe price "NAME" --price=` (menu price, GST inclusive).

MISSING COST means an ingredient has no price on record: fix with `item cost "ITEM" --cost=` or by entering its invoice.
