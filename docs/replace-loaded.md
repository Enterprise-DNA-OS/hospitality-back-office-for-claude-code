# Moving off Loaded

The promise: download what Loaded holds (staff, stock items, timesheets, daily sales), run one command, and the back office comes with you in a morning. Here is exactly what carries, what starts fresh, and why.

Loaded does not publish one standard export format. Its staff lists, stock lists and reports download or print to CSV in layouts that vary by screen and by plan. So the import reads the columns most of those layouts use, matches the common variants of each name, and tells you every row it could not read. If a file uses other headings, rename the header row in a copy and run it again; that mapping is also part of what Enterprise DNA does when we move a group across.

## What to export

1. **Staff.** The team list: name (or first and last), email, mobile, position, location, pay rate.
2. **Stock items.** The stock list: item name, category, unit, supplier, pack size, par level, last price.
3. **Timesheets** (optional). The period you want on record: employee, date, clock in, clock out, break, location.
4. **Daily sales** (optional). A sales report by day and venue: date, location, food sales, beverage sales (or one total), covers. Ex GST.

Columns matched (case-insensitive): `Name`, `First Name`, `Last Name`, `Employee`, `Position`, `Location`, `Venue`, `Pay Rate`, `Stock Item`, `Item`, `Unit of Measure`, `Supplier`, `Pack Size`, `Par Level`, `Last Price`, `Unit Cost`, `Date`, `Clock In`, `Start`, `Clock Out`, `End`, `Break (mins)`, `Food Sales`, `Beverage Sales`, `Total`, `Covers`, and the obvious neighbours. Dates in DD/MM/YYYY read as New Zealand and Australian dates. A break exported in hours (0.5) or minutes (30) reads correctly either way.

## Run it

```bash
node scripts/venue.mjs import loaded --staff=staff.csv --items=items.csv --timesheets=timesheets.csv --sales=sales.csv --dry-run
node scripts/venue.mjs import loaded --staff=staff.csv --items=items.csv --timesheets=timesheets.csv --sales=sales.csv
```

Dry run first, always. The import is idempotent: people match on name, items on name, sales on venue and date, timesheets on person, date and start time. Running it twice updates instead of duplicating, so a weekly re-run while both systems run side by side is safe. The whole import is one transaction: a file that breaks halfway leaves nothing behind.

## What maps

| Loaded | Here |
|---|---|
| Staff member (name, contact, position, pay rate, location) | `staff`, location becomes their home venue |
| Location | `venues`, created on first mention; mark the licensed ones (`venue licensed NAME`) |
| Stock item (name, category, unit, supplier, pack, par, last price) | `items`, supplier created on first mention, the price as the item's first cost |
| Timesheet (employee, date, in, out, break) | `timesheets`, landed as submitted for your approval |
| Daily sales by venue | `daily_sales`, ex GST |

## What deliberately does not carry over

- **The paper.** Every imported person arrives with **no right-to-work expiry and no duty manager certificate on record**, on purpose. The old system saying a visa was sighted is not the visa. Walk the team once (`staff visa`, `staff cert`) and the first `compliance` run is your opening audit.
- **Stock on hand.** Counts in the old system are history. On hand here starts at your first count (`count start`), which is also the opening bookend of your first real cost of goods figure.
- **Recipes.** Recipe builds rarely export cleanly. Re-enter your top sellers first (`recipe add`, `recipe line`): it takes an hour, and every one is costed at today's invoiced prices the moment it lands. Claude Code will do it from a recipe sheet or a photo you describe.
- **Supplier invoices and orders.** Old invoices sit in your accounting system already. Enter new ones from the day you switch; costs start moving from the first one.
- **Rosters.** Build next week fresh (`shift add`, `publish`): the gates check every shift on the way in.
- **Payroll and Xero links.** This system exports approved timesheets for payroll and invoice lines for the accounts; connecting them directly is part of the installed version.

## The import is the first audit

Every skip is named, and every skip is a question about the old data: a timesheet with no date, a person the staff list never mentioned. Answer them. Then:

```bash
node scripts/venue.mjs compliance --json   # the paper gaps, named person by person
node scripts/venue.mjs recipes --json      # anything MISSING COST
node scripts/venue.mjs attention --json    # what wants a decision today
```
