<h1 align="center">Hospitality Back Office for Claude Code</h1>

<p align="center">
  <strong>The open-source hospitality back office (rosters, timesheets, stock, recipes and wage and food cost margins per venue) that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your Loaded data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=loaded">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/loaded?utm_source=github&utm_medium=readme&utm_campaign=loaded">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-loaded">Instead of Loaded</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Hospitality Back Office for Claude Code does the job you pay Loaded for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the Loaded dashboard cannot.

The bill this replaces is per venue, every month. Loaded's Hub plan, the one with the wage and cost of goods margin reports, is NZ$249 a venue a month with an integrated POS (AU$299), excluding GST; Team and Stock on their own are NZ$169 each; larger groups go to a quoted Tailored plan ([loadedhub.com/pricing](https://loadedhub.com/pricing/), checked October 2026). One venue on Hub is NZ$2,988 a year. A six-venue group is NZ$17,928 a year, every year, for its rosters, stock and margins.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=loaded).

This one covers the back office of a cafe, restaurant or bar group: the venues, the team and their paper, the roster and the timesheets, the day's sales and the cash-up, the suppliers, the stock items with every price they have had, orders, invoices, stock counts, waste and recipes. Underneath it all is the number an owner actually runs the business on: wages and cost of goods as a share of sales, per venue, every day. Every supplier invoice moves the cost of what it delivered, so every recipe's margin follows what you really paid. The New Zealand rules are built in as gates with their sources cited: nobody is rostered past their right to work, a licensed night with no certified duty manager is named, short meal breaks are said out loud, and a stock count cannot close half done. Payroll and the till stay where they are, deliberately; one export hands payroll the approved hours.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/hospitality-back-office-for-claude-code.git
cd hospitality-back-office-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type `/attention`. The demo group has a bartender on next week's roster nine days past his recorded right to work, a licensed Saturday with no duty manager rostered, an $85 short cash-up nobody explained, a cafe whose wages ran at 38% of sales while roadworks cut trade by a quarter, and a food cost of 36% because scotch fillet went up 18% and the steak's menu price did not. The answer shows you exactly how this system thinks.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

| Command | What it does |
|---|---|
| `/attention` | Everything that wants a decision, worst first. A right-to-work breach outranks everything |
| `/today` | Yesterday by venue: sales against last week, covers, wages, wage %, the cash-up |
| `/margins` | Wage, purchase and prime cost % by venue and week, and the real cost of goods |
| `/cogs` | Cost of goods count to count: opening + bought - closing, against sales |
| `/sales` `/cashup` | The day's takings and the cash-up against the POS, variances explained |
| `/roster` `/publish` `/open-shifts` | The week costed; drafts become the roster with every gate re-checked; who can cover |
| `/clock` `/timesheets` `/approve` | In and out, the sheets, and the approval that is the payroll gate |
| `/team` | The team with its paper; one person's whole card |
| `/stock` `/count` | On hand against par; a stock count that cannot close half done |
| `/order` `/receive` `/invoices` | Par orders per supplier; invoices entered against orders, every cost moved; the check before paying |
| `/price-watch` | Every cost that moved and the dishes it pushed over target |
| `/recipes` `/menu` | Every plate costed at today's prices; the menu ranked by margin a plate |
| `/waste` | What went in the bin, why, and what it cost |
| `/compliance` | The rule book run against the records, sources cited |
| `/weekly-review` | The Monday review written from five commands |
| `/log` | The supplier call, the forgotten clock-out, onto the record |
| `/draft-order` `/draft-roster-message` | Drafts to `drafts/`; a person sends them |
| `/import` `/export` | Bring the group across from Loaded, dry run first; everything out as CSV |
| `/customise` | Change a field, a target, a rule, in plain language |
| `/new-view` | A new read-only dashboard page, described in plain language |

`npm run view` renders three branded dashboards (the week, the margins, stock and suppliers). `npm run docs` renders the paperwork: the weekly venue report, purchase orders, timesheet summaries for payroll and recipe cards.

## Instead of Loaded

Download your staff list, stock items, timesheets and daily sales from Loaded (or any back office whose reports land in CSV), then:

```bash
node scripts/venue.mjs import loaded --staff=staff.csv --items=items.csv --timesheets=timesheets.csv --sales=sales.csv --dry-run
node scripts/venue.mjs import loaded --staff=staff.csv --items=items.csv --timesheets=timesheets.csv --sales=sales.csv
```

The importer matches common column-name variants, runs as one transaction, is idempotent (re-running updates instead of duplicating), and names every row it skips. Loaded has no single published export format, so check the headers first; mapping an unusual layout is part of what Enterprise DNA does. Every imported person arrives with no right-to-work expiry and no duty manager certificate on record, on purpose. [docs/replace-loaded.md](docs/replace-loaded.md) covers exactly what carries over and what starts fresh.

### Ten questions your back office dashboard cannot answer

Each is one plain-language ask away in Claude Code, because the record is a database you own:

1. Which supplier price rises in the last 60 days pushed which dishes over their cost target, and what menu price puts each back?
2. What would my food cost have been between the last two counts at last month's prices?
3. Which dishes leave the most dollars a plate, not the best percentage?
4. Which invoices came in above their order, by how much, from which supplier, this quarter?
5. Whose nights have the cash-ups that do not balance, and is it the same person?
6. What does next week's roster cost against last week's sales at each venue, before I publish it?
7. Which items do we throw out most, and is the par level set too high?
8. Who is rostered next week past their right to work, and which licensed nights have no duty manager on?
9. Which venue's wage share moved most when trade dropped, and on which days?
10. If scotch fillet goes up another 10%, which dishes cross the line?

## Your first hour: ten things to ask for

1. "Walk me through everything on the attention list and what clears each one."
2. "How did each venue trade yesterday against last Saturday?"
3. "Why is food cost at the Kitchen and Bar so high?"
4. "Reprice the scotch fillet to get it back to 30%."
5. "Here's the Bay City Meats invoice: enter it against the order."
6. "Make me the orders to bring everything back to par."
7. "Start a stock count at the cafe; I'll read it out."
8. "Clock Emma out at 2:30 yesterday; she forgot."
9. "Change the wage target to 32%." (a one-line settings change)
10. "Add a page that shows each venue's wage share by day for the last month." 

## Architecture

```
hospitality-back-office-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/                  the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis and the migration guide
```

## Built with Claude Code

This repository was built with Claude Code as the primary development tool, from the schema to the commands, and it is meant to be extended the same way. Ask for a new command and it writes one. Codex, OpenCode and Cursor read `AGENTS.md` and work the same way.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Hospitality Back Office for Claude Code for your business, migrates your Loaded data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=loaded)
- Read more: [enterprisedna.co/omni/instead-of/loaded](https://enterprisedna.co/omni/instead-of/loaded?utm_source=github&utm_medium=readme&utm_campaign=loaded)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
