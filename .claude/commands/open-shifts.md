---
description: Every published shift still looking for a person, and who could lawfully take it.
---

1. Run `node scripts/venue.mjs open --json`.
2. For each, check candidates: `node scripts/venue.mjs team --json` for role and home venue, then `roster --json` to see who is free that day. Do not assign anyone past their right to work or inside the rest window; the gate refuses it anyway.
3. Suggest the best two names with why (role fits, hours light this week). Assign only on the operator's yes: `shift assign REF NAME`.
4. Offer `/draft-roster-message` for a callout.
