# Hospitality Back Office for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| "what needs my attention", "what's wrong this morning" | `/attention` |
| "how did we do yesterday", "how's the cafe going" | `/today` |
| "what's our wage percentage", "how are the margins" | `/margins` |
| "what's food cost", "cost of goods" | `/cogs` |
| "here are last night's takings" | `/sales` |
| "cash-up", "the till was short" | `/cashup` |
| "show me the roster", "who's on next week" | `/roster` |
| "publish the roster" | `/publish` |
| "who can cover Sunday" | `/open-shifts` |
| "clock X in / out", "X forgot to clock out" | `/clock` |
| "timesheets", "who worked what" | `/timesheets` |
| "approve the timesheets" | `/approve` |
| "show me the team", "pull up X" | `/team` |
| "what's in stock", "what's under par" | `/stock` |
| "stocktake", "count the bar" | `/count` |
| "do the orders", "order from Bay City" | `/order` |
| "enter this invoice", "the delivery came" | `/receive` |
| "what invoices need checking", "pay the suppliers" | `/invoices` |
| "what's gone up", "price rises" | `/price-watch` |
| "cost this dish", "what does the steak cost us" | `/recipes` |
| "which dishes make money" | `/menu` |
| "log waste", "what are we throwing out" | `/waste` |
| "are we compliant", "check the rules" | `/compliance` |
| "Monday review", "how was the week" | `/weekly-review` |
| "note that the rep said...", "log the conversation" | `/log` |
| "write the order email", "query this invoice" | `/draft-order` |
| "message everyone their shifts" | `/draft-roster-message` |
| "bring our Loaded data across" | `/import` |
| "export everything", "payroll file" | `/export` |
| "add a field", "change a target", "rename a venue" | `/customise` |
| "a page that shows..." | `/new-view` |

If an ask fits nothing here, run the CLI directly (`node scripts/venue.mjs help`) and then propose a new command for it.

## Hard rules

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.
- Never invent a sales figure, a price or a quantity. Read it off the report, invoice or count the operator gives you, say it back, then record it.
- The roster gates (right to work, overlaps, rest window) and the count gate have no force flag. The fix is the record or the shift, never a workaround.
- Money is ex GST everywhere except a recipe's menu price, which is what the customer pays. Rates cost wages; payroll pays people.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis and the guide for moving off Loaded.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/loaded
