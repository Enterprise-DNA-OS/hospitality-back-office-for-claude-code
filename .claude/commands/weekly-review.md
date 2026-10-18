---
description: The Monday review, written from five commands - what needs a decision, how each venue traded, the margins, the suppliers and stock, and the week ahead.
---

1. Run, `--json` each: `node scripts/venue.mjs attention`, `margins --weeks=2`, `price-watch --days=14`, `invoices --open`, `roster`.
2. Write the review in five short sections, prose plus small tables, nothing invented:
   - **Today's decisions.** The attention list, worst first, one action each. A right-to-work breach or an uncovered licensed night is the first line of the whole review.
   - **How we traded.** Last week by venue: sales, covers, wage %, against the week before.
   - **The margins.** Cost of goods count to count, the cost moves behind it, dishes over target.
   - **Suppliers and stock.** Invoices to check before paying, what is under par, counts that are stale.
   - **The week ahead.** Roster cost by venue, open shifts, anything still draft.
3. End with at most five actions for the week, each one command or one conversation.
4. On paper: `npm run view` renders the week, margins and stock pages; `npm run docs -- weekly-venue-report` the per-venue report.
