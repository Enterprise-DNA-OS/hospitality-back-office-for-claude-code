---
description: Write everything out as plain CSV - staff, timesheets (the payroll handoff), daily sales, invoice lines (for the accounts), items with costs, recipes with margins.
---

1. `node scripts/venue.mjs export --out=export --json` (any folder).
2. Report the files and row counts. timesheets.csv goes to payroll (approved rows are confirmed hours); invoices.csv feeds the accounting system.
3. Exports can hold staff contact details and pay rates: keep them out of shared folders and out of git (the `export/` folder is ignored).
