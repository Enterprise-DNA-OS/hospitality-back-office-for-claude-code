---
description: Supplier invoices - what is unpaid, what differs from its order, what has no invoice number, what is overdue - and the line-by-line check before paying.
---

1. `node scripts/venue.mjs invoices --open --json` for the ones that need a look; `invoices --json` for all unpaid.
2. For a DIFFERS FROM ORDER, show `invoice show INV-...`: invoiced against ordered, line by line, and name the difference in dollars.
3. Actions on the operator's word: `invoice dispute INV-... --why=`, `invoice paid INV-...`.
4. Draft a query to the supplier with `/draft-order` style wording into `drafts/` if asked. Never send.
