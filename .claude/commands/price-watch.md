---
description: Every item whose cost moved recently, by how much, and which dishes it pushes over target.
---

1. Run `node scripts/venue.mjs price-watch --json` (`--days=90` for longer).
2. Present moves biggest first, then the dishes affected with their cost % against target.
3. For each dish over target, give the two honest options with numbers: the menu price that restores the target (`recipe show NAME --json` has it), or what to take out of the plate. Check `notes` for anything the supplier said.
