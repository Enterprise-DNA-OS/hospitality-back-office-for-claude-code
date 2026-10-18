---
description: Write a supplier order (or an invoice query) as an email ready to send, one file in drafts/. Never sends anything.
---

1. Run `node scripts/venue.mjs order show PO-... --json` (or `invoice show INV-... --json` for a query) and `suppliers --json` for the contact and our account number.
2. Write `drafts/order-<PO>-<supplier>.md`: To, Subject ("Order PO-... for <venue>, delivery <day>"), a two-line greeting, the lines as a plain list (item, quantity, pack), delivery address and day, our account number. For a query: the invoice number, the line that differs, ordered against invoiced, and what we want (credit or corrected invoice).
3. `npm run docs -- purchase-order` renders the branded PO to attach.
4. Report the file. A person sends it, then `order sent PO-...`.
