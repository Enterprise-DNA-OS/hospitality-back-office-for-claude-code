---
description: Run a stock count - open it, enter what is on the shelves, close it - and see the cost of goods it produces.
---

1. `node scripts/venue.mjs count start "VENUE"`.
2. Enter lines as the operator reads them out: `count set SC-... "ITEM" QTY`, or many at once: `count set SC-... --lines="Item=qty;Item=qty"`. Quantities in the item's unit (kg, l, ea).
3. `count close SC-...`. The gate refuses a count missing anything that was on the last one: count it, zero is a number. A half count makes a wrong cost of goods.
4. Show the cost of goods period the close produced, and compare it with the one before (`cogs --json`).
