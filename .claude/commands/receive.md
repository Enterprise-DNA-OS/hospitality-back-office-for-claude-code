---
description: Enter a supplier invoice (against its order where there is one). Every line moves that item's cost, so recipes and margins follow what was actually paid.
---

1. Read the invoice the operator gives you (pasted text, a photo they describe, a PDF they open). Note the supplier, their invoice number, date, and each line: item, quantity in the item's unit, unit cost ex GST.
2. Say the lines back, then dry run: `node scripts/venue.mjs invoice add "VENUE" "SUPPLIER" --no= --date= --lines="Item:qty@cost;..." [--order=PO-...] --dry-run --json`.
3. Run it for real without `--dry-run`. Report the state (matches order, DIFFERS FROM ORDER, NO INVOICE NUMBER) and every cost move with the recipes it hits (`price-watch --json`).
4. A line you cannot match to an item: ask, or add the item first (`item add`). Never invent a quantity or price.
