---
description: Clock someone in or out, or fix a forgotten clock-out honestly with the time they actually left.
---

- In: `node scripts/venue.mjs clock in "NAME" [--venue= --at=HH:MM]`.
- Out: `node scripts/venue.mjs clock out "NAME" --at=HH:MM [--break=30]`.

A forgotten clock-out gets the time the person and their manager agree on, never a guess. If the break was short, the CLI says so (ERA 2000 Part 6D) and records what happened. Then `note add "NAME" "..."` with who confirmed the time.
