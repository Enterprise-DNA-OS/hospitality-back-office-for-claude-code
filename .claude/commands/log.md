---
description: Put a conversation, an agreement or an incident on the record as a file note against a person, venue or supplier.
---

1. `node scripts/venue.mjs note add "SUBJECT" "what happened, who agreed what" [--by=NAME]`. SUBJECT is the person, venue or supplier, spelled as on the record.
2. Read back with `notes "SUBJECT" --json`.

Facts only, dated, in the operator's words. Notes are how the next person knows why a price, a roster or a cash-up looks the way it does.
