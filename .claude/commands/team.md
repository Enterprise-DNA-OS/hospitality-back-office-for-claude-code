---
description: The team with their roles, rates, home venue and paper (right to work, duty manager certificate), or one person's whole card.
---

- The team: `node scripts/venue.mjs team --json` (`--all` includes former staff).
- One person: `node scripts/venue.mjs person "NAME" --json`: paper, shifts ahead, last ten timesheets, notes.
- Changes: `staff add NAME --role= --venue= --rate=`, `staff rate`, `staff visa NAME --expires=`, `staff cert NAME --number= --expires=`, `staff former NAME`.

Anything with paper (VISA EXPIRING, CERT EXPIRING, NO WORK RIGHTS) goes first, with the date.
