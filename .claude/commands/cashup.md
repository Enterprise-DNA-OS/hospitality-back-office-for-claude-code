---
description: Record tonight's cash-up against the POS, explain a variance, or review the last fortnight - including trading days nobody cashed up.
---

- Record: `node scripts/venue.mjs cashup add "VENUE" --date= --pos-cash= --counted= --pos-card= --settled= [--float= --by= --explain=]`.
- Explain a variance: `node scripts/venue.mjs cashup explain "VENUE" DATE --why="..."`. Only with the operator's words; never invent a reason.
- Review: `node scripts/venue.mjs cashups --json`. Show unexplained and missing first, then the rest.

A variance over the tolerance (`settings`: cashup_tolerance_cents) with no explanation stays on the attention list. Repeated shorts on the same person's nights are worth naming, factually, with the dates.
