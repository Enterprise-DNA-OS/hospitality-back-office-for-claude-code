---
description: Build supplier orders from par - suggest, draft, review, mark sent - one order per supplier per venue.
---

1. `node scripts/venue.mjs order suggest "VENUE" --json` (add `--supplier=`) shows what is under par and the packs to bring it back.
2. On the operator's yes: `order draft "VENUE" "SUPPLIER"` (from par) or with named lines `--lines="Item=qty;Item=qty"`.
3. `/draft-order` writes the email; a person sends it. Then `order sent PO-...`.
4. `orders --json` shows what is in flight; NOT DELIVERED means the expected date passed with no invoice.
