# Why there is no front end

Loaded is a database with a subscription. The tables underneath it are ordinary: a few entities, a few relationships, a handful of workflows you repeat every week. What you pay for is the layer on top that lets people who do not write SQL get at those tables. Screens, filters, dashboards, forms.

That layer used to be the whole product, because talking to a database was hard. It is not hard any more. Open this folder in Claude Code, describe what you want, and it writes the query, runs it, and explains the answer. Ask a question the dashboard never had a chart for and you still get an answer.

## What you gain

- **Better answers.** A dashboard shows what the vendor decided to chart. Here you ask your own question, in your own words, and get it answered against your own data.
- **No seats.** Everyone who needs to look can look. The bill does not grow with headcount.
- **Your data in your Postgres.** Plain tables. Back them up, query them from anything, leave any time. There is no export step because there is nothing to leave.
- **A process that matches you.** When your way of working changes, you add a command. You do not wait for a feature request to clear.

## What you give up

- **A timeclock kiosk.** Staff do not tap in on a tablet by the door. A manager clocks people in and out by asking (`clock in Emma`), or the times come in from whatever clock you already use. A kiosk is a small front end Enterprise DNA builds onto the same database when a venue wants one.
- **A live POS feed.** Loaded's top price is for the integrated POS. Here the day's totals are keyed from the end-of-day report or imported from the POS export each morning. The margin needs the day, not every transaction; a direct feed is a connection Enterprise DNA adds for you.
- **A roster you drag around.** Shifts are records you ask about and change in words, not blocks on a calendar.
- **A phone app.** It runs where Claude Code runs.
- **A vendor help desk.** This is open source. Enterprise DNA supports the installed version for businesses that want someone to call.

## Who this fits

Small teams who already use Claude Code, or who would rather learn to ask than learn another interface. If your team needs a screen to look at all day, keep Loaded. If you need the answers more than the screens, this is cheaper, faster and yours.

Installed and run for you: https://enterprisedna.co/omni/instead-of/loaded
