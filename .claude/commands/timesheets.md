---
description: The week's timesheets - worked hours, breaks, cost, and what is waiting for approval.
---

1. Run `node scripts/venue.mjs timesheets --json` (`--pending` for the queue, `--week=this|last|DATE`).
2. Present by person: days, hours, breaks, cost. Flag NOT CLOCKED OUT, BREAK SHORT and WAITING.
3. Approval is the payroll gate: offer `/approve` for the queue.
