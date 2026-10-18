# The rule book /compliance checks

Six rules, each with its source, what a breach looks like in the data, and where the CLI already refuses at the gate. `node scripts/venue.mjs compliance` runs them all; add a rule key to run one.

Nothing here is legal advice. It is the rule book the operator has pointed the system at, with sources, and the operator changes it to match their business. When the law moves, update the rule and the check together. The defaults are written for New Zealand; the Australian equivalents are noted, and the numbers live in `settings` so an Australian operator changes them without touching code.

Margins (wage share, cost of goods, cash-up tolerance) are house rules, not law. They live in `settings` and on the attention list, not here.

## 1. `entitlement` - nobody rostered past their recorded right to work

An employer must not allow a person who is not entitled to work to do so. **Source: Immigration Act 2009 s 350** (an offence, with penalties per worker). AU: the Migration Act 1958 (allowing an unlawful non-citizen to work).

Breach in the data: a published shift dated after the person's `visa_expires_on`. A blank expiry means no expiry on record (citizen or resident). **Gate: `shift add`, `shift assign` and `publish` refuse a shift dated past the recorded expiry. No force flag: the fix is the new visa on record (`staff visa`), not a checkbox.** The attention list warns 30 days ahead.

## 2. `duty-manager` - a certified manager on every trading day at a licensed venue

A licensed premises must have a certified manager on duty whenever alcohol is sold. **Source: Sale and Supply of Alcohol Act 2012 ss 212-214**; the Manager's Certificate is issued by the District Licensing Committee. AU: each state's liquor licensing (for example an Approved Manager under the relevant state Act).

Breach in the data: a future date at a `licensed` venue with published shifts where nobody rostered holds a `duty_manager_cert_expires_on` on or after that date. **Check only: the fix is a person on the day.** The attention list warns 30 days before a certificate expires, because renewals take weeks.

## 3. `breaks` - meal breaks match the span worked

A work period over 4 hours and up to 8 requires a 30-minute meal break; longer periods repeat the pattern. The 10-minute rest breaks the Act also requires are paid, so they are not deducted time and are not checked against the unpaid break field. **Source: Employment Relations Act 2000 Part 6D (s 69ZD).** AU: the applicable award, for example the Hospitality Industry (General) Award 2020.

Breach in the data: a submitted or approved timesheet whose `break_minutes` is under what `required_meal_minutes()` returns for the span. **Gate: `clock out` and `approve` say it out loud, and the record is never rounded. Approval still stands, because the record must show what happened; the fix is the break practice, not the number.**

## 4. `rest` - the rest window between shifts holds

Closing at eleven and opening at seven is how kitchens burn people. NZ has no fixed statutory gap, but the employer's duty to manage fatigue is real. **Source: Health and Safety at Work Act 2015 (primary duty of care, fatigue as a managed risk); Hospitality Industry (General) Award 2020 cl 15 in AU.** The window lives in `settings` (`rest_between_shifts_hours`, default 10).

Breach in the data: two shifts for one person closer together than the window (`v_rest_clashes`). **Gate: `shift add`, `shift assign` and `publish` refuse a new shift inside the window. No force flag: the fix is moving a shift.**

## 5. `wage-records` - the wages and time record is kept and closed

Employers keep a wages and time record for six years. **Source: Employment Relations Act 2000 s 130.** AU: Fair Work Regulations 2009 (records kept seven years).

Held by design: this CLI has no delete path for people, shifts or timesheets. Shifts cancel with a reason, staff become former, timesheets stay. The live risk is a timesheet still open from a past day: a record that never closed shows hours nobody confirmed. The check names them; `clock out NAME --at=` closes them while somebody remembers.

## 6. `gst-records` - supplier invoices are kept with their number

To claim the GST on a purchase, the business holds the supplier's taxable supply information, and keeps its records for seven years. **Source: Goods and Services Tax Act 1985 s 20 (input tax needs the records) and s 75 (records kept seven years).** AU: A New Tax System (Goods and Services Tax) Act 1999 (a tax invoice to claim a GST credit).

Breach in the data: an invoice with no `supplier_invoice_no`. **Held by design: invoices have no delete path; they are disputed or paid. The fix is asking the supplier for the tax invoice and recording its number.**
