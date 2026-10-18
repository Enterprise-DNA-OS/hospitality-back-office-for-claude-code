---
description: Bring the business across from Loaded (or any back office whose reports download as CSV) - staff, stock items, timesheets, daily sales - dry run first. The import is the first audit.
---

1. Read `docs/replace-loaded.md` for what to export, what maps and what starts fresh.
2. Look at the headers of each file first. The importer matches common column names; if a file uses others, rename the header row in a copy (never the operator's original) and say what you renamed.
3. Dry run: `node scripts/venue.mjs import loaded --staff=staff.csv --items=items.csv --timesheets=timesheets.csv --sales=sales.csv --dry-run --json`. Read every skip out loud: each is a question about the old data.
4. Run it for real, then again: the second pass must create nothing. That is the idempotency check.
5. New staff arrive with no right to work or duty manager certificate on record, deliberately. Walk the team: `staff visa`, `staff cert`.
6. Then: `recipes --json` (any MISSING COST), `count start` at each venue (stock on hand starts at the first count), `attention --json`.
