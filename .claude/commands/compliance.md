---
description: Run the rule book against the records - right to work, duty manager cover, meal breaks, the rest window, the wages and time record, GST invoice records - with the source cited for each.
---

1. Read `docs/compliance.md`: each rule, its source, what a breach looks like in the data, where the CLI already refuses.
2. Run `node scripts/venue.mjs compliance --json` (or one rule: `compliance entitlement`).
3. Report as a table: rule, issues, the worst example, the source. Breaches first, then clean rules in one line.
4. For each breach give the fix: the record to update, the shift to move, the invoice number to chase. Notices to staff or suppliers draft to `drafts/`, never send.
5. If a rule looks out of date, say so and stop. Do not guess at law: the operator confirms, then the doc and the check change together.

Nothing here is legal advice. The doc records the rules the operator has told the system to enforce, with sources, and this command checks the data against them.
