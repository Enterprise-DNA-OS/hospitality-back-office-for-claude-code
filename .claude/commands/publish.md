---
description: Turn the week's draft shifts into the real roster, with every shift re-checked against the gates (right to work, overlaps, rest window). Refusals are named.
---

1. Run `node scripts/venue.mjs roster --json` first and show the drafts.
2. Run `node scripts/venue.mjs publish --json` (`--week=` for another week).
3. Report published and refused. Each refusal carries its reason; give the fix (`shift assign REF NAME` to someone else, or move the shift).
4. Offer `/draft-roster-message` so each person gets their week.
