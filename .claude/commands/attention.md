---
description: Everything that wants a decision this morning, worst first. A person on the published roster past their right to work outranks everything, then a licensed night with no duty manager, money that does not add up, the margins, supplier invoices, the menu, stock, the roster and the paper.
---

1. Run `node scripts/venue.mjs attention --json`.
2. Present it worst first, grouped by reason, in the operator's words. Lead with anything rank 1 or 2 (a right-to-work breach, an uncovered licensed day): those are today's first conversations, say so plainly.
3. For each group, say the one action that clears it: `shift unassign REF` or `staff visa NAME --expires=`, put a certificate holder on the day, `cashup explain VENUE DATE --why=`, `clock out NAME --at=`, `invoice dispute REF --why=`, `recipe price NAME --price=`, `order draft VENUE SUPPLIER`, `count start VENUE`, `/approve`.
4. Money items (WAGES HIGH, COST OF GOODS HIGH, PRICE JUMP) get one line of why from the data: which days, which item, which dish. Run `margins` or `price-watch --json` if you need it.
5. If the list is empty, say so in one line and stop.
