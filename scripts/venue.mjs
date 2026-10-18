#!/usr/bin/env node
// hospitality-back-office-for-claude-code: the one CLI. Claude Code slash
// commands call this; so can you.
//
//   node scripts/venue.mjs <command> [args] [--flags] [--json]
//
// Run with no arguments (or `help`) for the command list.
//
// This system is a hospitality group's back office the way Loaded sells it:
// the venues, the team, the roster and the timesheets, the day's sales and the
// cash-up, the suppliers, the stock items with their price history, orders,
// invoices, stock counts, waste and recipes, and the margin the owner reads
// every morning: wages and cost of goods as a share of sales, per venue. It
// sends nothing and connects to nothing: orders and roster messages draft to
// drafts/, and a person sends them.
//
// The gates, and there are no force flags:
//   * nobody is rostered past the expiry of their recorded right to work
//     (Immigration Act 2009 s 350)
//   * nobody holds two overlapping shifts, and nobody starts a new shift
//     inside the rest window after the last one ends
//   * a timesheet is not approved while it is still open, and a short meal
//     break is said out loud (Employment Relations Act 2000 Part 6D)
//   * a supplier invoice needs its lines; entering one moves the item's cost,
//     so every recipe margin follows what was actually paid
//   * a stock count closes once and stays closed: it is the bookend of a cost
//     of goods figure
//   * no deleting records: shifts cancel with a reason, staff become former,
//     invoices are disputed or paid (ERA 2000 s 130; GST Act 1985 s 75)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick } from './lib/csv.mjs';
import { table, money, price, hours as fmtHours, isoDate, truncate, heading, weekday } from './lib/format.mjs';

// ---------------------------------------------------------------------------
// Argument parsing

const BOOL_FLAGS = new Set(['json', 'help', 'all', 'dry-run', 'pending', 'licensed', 'below', 'open']);

function parseArgv(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      flags.help = true;
      continue;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      let name;
      let value;
      if (eq > -1) {
        name = a.slice(2, eq);
        value = a.slice(eq + 1);
      } else {
        name = a.slice(2);
        const next = argv[i + 1];
        if (BOOL_FLAGS.has(name) || next === undefined || next.startsWith('--')) value = true;
        else value = argv[++i];
      }
      flags[name] = value;
    } else {
      args.push(a);
    }
  }
  return { args, flags };
}

class CliError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

const num = (v) => Number(v ?? 0);
const str = (v) => (v === true || v === undefined || v === null ? '' : String(v));
const pct = (v) => (v === null || v === undefined ? '' : `${Number(v).toFixed(1)}%`);

// "$1,234.50" or "1234.5" -> 123450 cents. Blank -> null.
function parseMoney(v, what = 'amount') {
  if (v === undefined || v === null || v === true || String(v).trim() === '') return null;
  const s = String(v).replace(/[$,\s]/g, '').replace(/^NZ|^AU/i, '');
  const n = Number(s);
  if (!Number.isFinite(n)) throw new CliError(`Cannot read ${what} "${v}". Use dollars, for example 45.50.`);
  return Math.round(n * 100);
}

function parseQty(v, what = 'quantity') {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  if (!Number.isFinite(n)) throw new CliError(`Cannot read ${what} "${v}".`);
  return n;
}

// ---------------------------------------------------------------------------
// Dates, times, weeks

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDate(v, what = 'date') {
  if (!v || v === true) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const lower = s.toLowerCase();
  if (lower === 'today') return today();
  if (lower === 'yesterday') return addDays(today(), -1);
  if (lower === 'tomorrow') return addDays(today(), 1);
  // New Zealand and Australian exports write DD/MM/YYYY.
  const slash = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const [day, month] = b > 12 ? [b, a] : [a, b];
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  throw new CliError(`Cannot read ${what} "${s}". Use YYYY-MM-DD (or today / yesterday / DD/MM/YYYY).`);
}

function parseTime(v, what = 'time') {
  if (!v || v === true) return null;
  const s = String(v).trim().toLowerCase();
  const m = s.match(/(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?\s*(am|pm)?$/);
  if (!m) throw new CliError(`Cannot read ${what} "${s}". Use HH:MM, 24-hour (or 9:00am).`);
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) throw new CliError(`Cannot read ${what} "${s}". Use HH:MM, 24-hour.`);
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Monday of the week containing `v`; 'next' = next Monday; 'last' = last Monday.
function weekStart(v) {
  if (v === 'next') return addDays(weekStart(undefined), 7);
  if (v === 'last') return addDays(weekStart(undefined), -7);
  if (v === 'this') return weekStart(undefined);
  const base = v && v !== true ? parseDate(v, '--week') : today();
  const d = new Date(`${base}T00:00:00`);
  return addDays(base, -((d.getDay() + 6) % 7));
}

function shiftTimestamps(onDate, startsAt, endsAt) {
  const s = new Date(`${onDate}T${startsAt}:00`);
  const e = new Date(`${onDate}T${endsAt}:00`);
  if (e <= s) e.setDate(e.getDate() + 1);
  return { s, e };
}

const hhmm = (v) => (v ? String(v).slice(11, 16) || String(v).slice(0, 5) : '');
const t5 = (v) => (v ? String(v).slice(0, 5) : '');

// ---------------------------------------------------------------------------
// Resolvers: partial ids, case-insensitive names, list-and-exit-1 when ambiguous

async function resolveByName(db, tableName, query, what, { extra = '', label = (r) => r.name } = {}) {
  if (!query || query === true) throw new CliError(`Which ${what}? Give a name (partial is fine).`);
  const q = String(query).trim();
  const rows = await db.query(`select * from ${tableName} where name ilike $1 ${extra} order by name`, [`%${q}%`]);
  const exact = rows.filter((r) => r.name.toLowerCase() === q.toLowerCase());
  if (exact.length === 1) return exact[0];
  if (rows.length === 1) return rows[0];
  if (rows.length === 0) throw new CliError(`No ${what} matches "${q}".`);
  throw new CliError(`"${q}" matches ${rows.length} ${what}s:\n${rows.map((r) => `  ${label(r)}`).join('\n')}\nSay more of the name.`);
}

const resolveVenue = (db, q) => resolveByName(db, 'venues', q, 'venue');
const resolveSupplier = (db, q) => resolveByName(db, 'suppliers', q, 'supplier');
const resolveItem = (db, q) => resolveByName(db, 'v_item_cost', q, 'item', { label: (r) => `${r.name} (${r.unit})` });
const resolveRecipe = (db, q) => resolveByName(db, 'v_recipe_cost', q, 'recipe');
const resolveStaff = (db, q, { includeFormer = false } = {}) =>
  resolveByName(db, 'v_staff', q, 'staff member', { extra: includeFormer ? '' : `and status = 'active'`, label: (r) => `${r.name} (${r.role})` });

async function resolveByRef(db, view, ref, what, prefix) {
  if (!ref || ref === true) throw new CliError(`Which ${what}? Give its reference (${prefix}-...).`);
  let q = String(ref).trim().toUpperCase();
  if (/^\d+$/.test(q)) q = `${prefix}-${q}`;
  const rows = await db.query(`select * from ${view} where upper(ref) = $1`, [q]);
  if (rows.length === 1) return rows[0];
  throw new CliError(`No ${what} matches "${ref}".`);
}

async function mintRef(db, tableName, prefix, start) {
  const [row] = await db.query(
    `select coalesce(max(substring(ref from ${prefix.length + 2})::int), $1) + 1 as n
     from ${tableName} where ref like '${prefix}-%' and substring(ref from ${prefix.length + 2}) ~ '^[0-9]+$'`,
    [start - 1],
  );
  return `${prefix}-${row.n}`;
}

async function settings(db) {
  const [s] = await db.query('select * from v_settings');
  return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Number(v)]));
}

// ---------------------------------------------------------------------------
// The roster gates. One place, used by shift add, shift assign and publish.

async function assignmentGates(db, staff, { onDate, startsAt, endsAt, excludeShiftId = null }) {
  const violations = [];
  const { s, e } = shiftTimestamps(onDate, startsAt, endsAt);
  if (staff.status !== 'active') violations.push(`${staff.name} is former staff.`);
  if (staff.visa_expires_on && onDate > isoDate(staff.visa_expires_on)) {
    violations.push(
      `${staff.name}'s recorded right to work expires ${isoDate(staff.visa_expires_on)} and this shift is ${onDate}. ` +
      `Employing a person not entitled to work is an offence (Immigration Act 2009 s 350). ` +
      `Record the new visa first: staff visa "${staff.name}" --expires=YYYY-MM-DD.`,
    );
  }
  const nearby = await db.query(
    `select ref, on_date, starts_at, ends_at from shifts
     where staff_id = $1 and status <> 'cancelled' and id is distinct from $2
       and on_date between ($3::date - 1) and ($3::date + 1)`,
    [staff.staff_id, excludeShiftId, onDate],
  );
  const st = await settings(db);
  const restMs = st.rest_between_shifts_hours * 3600 * 1000;
  for (const sh of nearby) {
    const other = shiftTimestamps(isoDate(sh.on_date), t5(sh.starts_at), t5(sh.ends_at));
    if (s < other.e && e > other.s) {
      violations.push(`${staff.name} already holds ${sh.ref} (${isoDate(sh.on_date)} ${t5(sh.starts_at)}-${t5(sh.ends_at)}), which overlaps this shift.`);
      continue;
    }
    const gap = s >= other.e ? s - other.e : other.s - e;
    if (gap < restMs) {
      violations.push(
        `${staff.name} would get ${(gap / 3600000).toFixed(1)}h between ${sh.ref} and this shift; the rest window is ${st.rest_between_shifts_hours}h ` +
        `(settings: rest_between_shifts_hours). Move one of the shifts.`,
      );
    }
  }
  return violations;
}

function enforce(violations) {
  if (violations.length) throw new CliError(violations.map((v) => `refused: ${v}`).join('\n'));
}

// ---------------------------------------------------------------------------
// Output

function out(flags, rows, humanFn) {
  if (flags.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  humanFn();
}

const SHIFT_COLS = [
  { key: 'ref', label: 'ref' },
  { key: 'on_date', label: 'date', format: (v) => `${weekday(v)} ${isoDate(v)}` },
  { key: 'starts_at', label: 'start', format: t5 },
  { key: 'ends_at', label: 'end', format: t5 },
  { key: 'venue', label: 'venue', width: 26 },
  { key: 'staff', label: 'who', format: (v, r) => v || (r.role_needed ? `(open: ${r.role_needed})` : '(open)') },
  { key: 'paid_minutes', label: 'paid', align: 'right', format: (v) => fmtHours(v) },
  { key: 'cost_cents', label: 'cost', align: 'right', format: (v) => (v == null ? '' : money(v)) },
  { key: 'state', label: 'state' },
];

const TS_COLS = [
  { key: 'ref', label: 'ref' },
  { key: 'on_date', label: 'date', format: (v) => `${weekday(v)} ${isoDate(v)}` },
  { key: 'staff', label: 'who' },
  { key: 'venue', label: 'venue', width: 26 },
  { key: 'clock_in_at', label: 'in', format: hhmm },
  { key: 'clock_out_at', label: 'out', format: hhmm },
  { key: 'break_minutes', label: 'break', align: 'right', format: (v) => `${v}m` },
  { key: 'worked_minutes', label: 'worked', align: 'right', format: (v) => (v == null ? '' : fmtHours(v)) },
  { key: 'cost_cents', label: 'cost', align: 'right', format: (v) => (v == null ? '' : money(v)) },
  { key: 'state', label: 'state' },
];

// ---------------------------------------------------------------------------
// The numbers: today, margins, cost of goods

async function cmdToday(db, flags) {
  const day = parseDate(flags.date || 'yesterday');
  const rows = await db.query(
    `select d.venue, d.on_date, d.sales_cents, d.covers, d.spend_per_cover_cents, d.wage_cents, d.wage_pct,
            lw.sales_cents as last_week_sales_cents,
            case when lw.sales_cents > 0 then round((d.sales_cents - lw.sales_cents) * 100.0 / lw.sales_cents, 1) end as vs_last_week_pct,
            c.state as cashup, c.cash_variance_cents
     from v_daily d
     left join v_daily lw on lw.venue_id = d.venue_id and lw.on_date = d.on_date - 7
     left join v_cashups c on c.venue_id = d.venue_id and c.on_date = d.on_date
     where d.on_date = $1 order by d.venue`,
    [day],
  );
  const st = await settings(db);
  out(flags, { date: day, wage_target_pct: st.wage_target_pct, venues: rows }, () => {
    console.log(heading(`${weekday(day)} ${day}, venue by venue`));
    if (!rows.length) return console.log('  No sales recorded for that day. Add them: sales add VENUE --date= --food= --bev=');
    console.log(table(rows, [
      { key: 'venue', label: 'venue', width: 28 },
      { key: 'sales_cents', label: 'sales ex GST', align: 'right', format: (v) => money(v) },
      { key: 'vs_last_week_pct', label: 'vs last wk', align: 'right', format: (v) => (v == null ? '' : `${v > 0 ? '+' : ''}${v}%`) },
      { key: 'covers', label: 'covers', align: 'right' },
      { key: 'spend_per_cover_cents', label: 'per cover', align: 'right', format: (v) => price(v) },
      { key: 'wage_cents', label: 'wages', align: 'right', format: (v) => money(v) },
      { key: 'wage_pct', label: 'wage %', align: 'right', format: (v, r) => `${pct(v)}${num(v) > st.wage_target_pct ? ' HIGH' : ''}` },
      { key: 'cashup', label: 'cash-up', format: (v) => v || 'MISSING' },
    ]));
    console.log(`\n  Wages are from timesheets with a clock-out, at each person's costing rate. Target ${st.wage_target_pct}%.`);
  });
}

async function cmdMargins(db, flags) {
  const weeks = Math.max(1, num(flags.weeks || 4));
  const venueFilter = flags.venue ? (await resolveVenue(db, flags.venue)).id : null;
  const rows = await db.query(
    `select * from v_weekly where week_of >= (date_trunc('week', current_date))::date - (($1::int - 1) * 7)
       and ($2::uuid is null or venue_id = $2) order by venue, week_of`,
    [weeks, venueFilter],
  );
  const cogs = await db.query(
    `select distinct on (venue_id, category) * from v_period_cogs where ($1::uuid is null or venue_id = $1)
     order by venue_id, category, to_date desc`,
    [venueFilter],
  );
  const st = await settings(db);
  out(flags, { weeks: rows, cost_of_goods: cogs, targets: st }, () => {
    console.log(heading('Margins by venue and week'));
    console.log(table(rows, [
      { key: 'venue', label: 'venue', width: 28 },
      { key: 'week_of', label: 'week of', format: isoDate },
      { key: 'trading_days', label: 'days', align: 'right' },
      { key: 'sales_cents', label: 'sales ex GST', align: 'right', format: (v) => money(v) },
      { key: 'wage_cents', label: 'wages', align: 'right', format: (v) => money(v) },
      { key: 'wage_pct', label: 'wage %', align: 'right', format: (v) => `${pct(v)}${num(v) > st.wage_target_pct ? ' HIGH' : ''}` },
      { key: 'purchase_cents', label: 'purchases', align: 'right', format: (v) => money(v) },
      { key: 'purchase_pct', label: 'purch %', align: 'right', format: pct },
      { key: 'prime_pct', label: 'prime %', align: 'right', format: (v) => `${pct(v)}${num(v) > st.prime_cost_target_pct ? ' HIGH' : ''}` },
    ]));
    console.log(`\n  Purchases stand in for cost of goods week to week. The real figure needs two stock counts:`);
    console.log(heading('Cost of goods between the last two counts'));
    if (!cogs.length) return console.log('  No venue has two closed counts yet. Count, then count again.');
    console.log(table(cogs, COGS_COLS));
  });
}

const COGS_COLS = [
  { key: 'venue', label: 'venue', width: 28 },
  { key: 'category', label: 'category' },
  { key: 'from_date', label: 'from', format: isoDate },
  { key: 'to_date', label: 'to', format: isoDate },
  { key: 'opening_cents', label: 'opening', align: 'right', format: (v) => money(v) },
  { key: 'purchase_cents', label: '+ bought', align: 'right', format: (v) => money(v) },
  { key: 'closing_cents', label: '- closing', align: 'right', format: (v) => money(v) },
  { key: 'cogs_cents', label: '= used', align: 'right', format: (v) => money(v) },
  { key: 'sales_cents', label: 'sales', align: 'right', format: (v) => money(v) },
  { key: 'cogs_pct', label: 'cost %', align: 'right', format: (v, r) => `${pct(v)}${num(v) > num(r.target_pct) ? ' HIGH' : ''}` },
];

async function cmdCogs(db, flags) {
  const rows = await db.query(`select * from v_period_cogs order by venue, to_date desc, category`);
  out(flags, rows, () => {
    console.log(heading('Cost of goods, count to count'));
    console.log(table(rows, COGS_COLS));
    console.log('\n  opening stock + what was invoiced between the counts - closing stock, against the same days\' sales.');
  });
}

async function cmdSales(db, args, flags, sub) {
  if (sub === 'add') {
    const venue = await resolveVenue(db, args[0]);
    const day = parseDate(flags.date || 'yesterday');
    const food = parseMoney(flags.food, '--food') ?? 0;
    const bev = parseMoney(flags.bev ?? flags.beverage, '--bev') ?? 0;
    const other = parseMoney(flags.other, '--other') ?? 0;
    if (food + bev + other === 0) throw new CliError('Give the day\'s takings ex GST: --food= --bev= [--other=] [--covers=].');
    const covers = flags.covers ? Math.round(parseQty(flags.covers, '--covers')) : null;
    const [row] = await db.query(
      `insert into daily_sales (venue_id, on_date, food_cents, beverage_cents, other_cents, covers, source, note)
       values ($1, $2, $3, $4, $5, $6, 'manual', $7)
       on conflict (venue_id, on_date) do update set food_cents = excluded.food_cents, beverage_cents = excluded.beverage_cents,
         other_cents = excluded.other_cents, covers = coalesce(excluded.covers, daily_sales.covers), note = coalesce(excluded.note, daily_sales.note)
       returning *`,
      [venue.id, day, food, bev, other, covers, str(flags.note) || null],
    );
    return out(flags, row, () => console.log(`Sales for ${venue.name} on ${day}: ${money(food + bev + other)} ex GST recorded.`));
  }
  const days = Math.max(1, num(flags.days || 14));
  const rows = await db.query(
    `select * from v_daily where on_date >= current_date - $1::int and ($2::text is null or venue ilike $2) order by on_date desc, venue`,
    [days, flags.venue ? `%${flags.venue}%` : null],
  );
  out(flags, rows, () => {
    console.log(heading(`Sales and wages, last ${days} days`));
    console.log(table(rows, [
      { key: 'on_date', label: 'date', format: (v) => `${weekday(v)} ${isoDate(v)}` },
      { key: 'venue', label: 'venue', width: 28 },
      { key: 'food_cents', label: 'food', align: 'right', format: (v) => money(v) },
      { key: 'beverage_cents', label: 'beverage', align: 'right', format: (v) => money(v) },
      { key: 'sales_cents', label: 'total', align: 'right', format: (v) => money(v) },
      { key: 'covers', label: 'covers', align: 'right' },
      { key: 'wage_cents', label: 'wages', align: 'right', format: (v) => money(v) },
      { key: 'wage_pct', label: 'wage %', align: 'right', format: pct },
    ]));
  });
}

// ---------------------------------------------------------------------------
// Cash-ups

async function cmdCashup(db, args, flags, sub) {
  if (sub === 'add') {
    const venue = await resolveVenue(db, args[0]);
    const day = parseDate(flags.date || 'today');
    const vals = {
      pos_cash: parseMoney(flags['pos-cash'], '--pos-cash'),
      counted: parseMoney(flags.counted, '--counted'),
      pos_card: parseMoney(flags['pos-card'], '--pos-card') ?? 0,
      settled: parseMoney(flags.settled, '--settled') ?? parseMoney(flags['pos-card'], '--pos-card') ?? 0,
      float: parseMoney(flags.float, '--float') ?? 0,
    };
    if (vals.pos_cash === null || vals.counted === null) throw new CliError('cashup add VENUE --pos-cash= --counted= [--pos-card= --settled= --float= --by= --explain=]');
    await db.query(
      `insert into cashups (venue_id, on_date, pos_cash_cents, counted_cash_cents, pos_card_cents, settled_card_cents, float_cents, counted_by, explanation)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (venue_id, on_date) do update set pos_cash_cents = excluded.pos_cash_cents, counted_cash_cents = excluded.counted_cash_cents,
         pos_card_cents = excluded.pos_card_cents, settled_card_cents = excluded.settled_card_cents, float_cents = excluded.float_cents,
         counted_by = excluded.counted_by, explanation = coalesce(excluded.explanation, cashups.explanation)`,
      [venue.id, day, vals.pos_cash, vals.counted, vals.pos_card, vals.settled, vals.float, str(flags.by) || null, str(flags.explain) || null],
    );
    const [row] = await db.query(`select * from v_cashups where venue_id = $1 and on_date = $2`, [venue.id, day]);
    return out(flags, row, () => {
      console.log(`Cash-up for ${venue.name} on ${day}: cash ${money(row.cash_variance_cents)} against the POS, card ${money(row.card_variance_cents)}. ${row.state}.`);
      if (row.state === 'UNEXPLAINED') console.log(`  Over the tolerance. Record why: cashup explain "${venue.name}" ${day} --why="..."`);
    });
  }
  if (sub === 'explain') {
    const venue = await resolveVenue(db, args[0]);
    const day = parseDate(args[1] || flags.date);
    const why = str(flags.why);
    if (!day || !why) throw new CliError('cashup explain VENUE DATE --why="what happened"');
    const rows = await db.query(`update cashups set explanation = $3 where venue_id = $1 and on_date = $2 returning id`, [venue.id, day, why]);
    if (!rows.length) throw new CliError(`No cash-up for ${venue.name} on ${day}.`);
    return out(flags, { venue: venue.name, date: day, explanation: why }, () => console.log(`Explanation recorded on ${venue.name} ${day}.`));
  }
  const days = Math.max(1, num(flags.days || 14));
  const rows = await db.query(`select * from v_cashups where on_date >= current_date - $1::int order by on_date desc, venue`, [days]);
  const missing = await db.query(`select * from v_missing_cashups order by on_date desc`);
  out(flags, { cashups: rows, missing }, () => {
    console.log(heading(`Cash-ups, last ${days} days`));
    console.log(table(rows, [
      { key: 'on_date', label: 'date', format: (v) => `${weekday(v)} ${isoDate(v)}` },
      { key: 'venue', label: 'venue', width: 28 },
      { key: 'pos_cash_cents', label: 'POS cash', align: 'right', format: (v) => price(v) },
      { key: 'counted_cash_cents', label: 'counted', align: 'right', format: (v) => price(v) },
      { key: 'cash_variance_cents', label: 'cash +/-', align: 'right', format: (v) => price(v) },
      { key: 'card_variance_cents', label: 'card +/-', align: 'right', format: (v) => price(v) },
      { key: 'counted_by', label: 'by' },
      { key: 'state', label: 'state' },
      { key: 'explanation', label: 'why', width: 34 },
    ]));
    if (missing.length) {
      console.log('\n  Traded with no cash-up:');
      for (const m of missing) console.log(`    ${weekday(m.on_date)} ${isoDate(m.on_date)}  ${m.venue}`);
    }
  });
}

// ---------------------------------------------------------------------------
// The roster

async function cmdRoster(db, flags) {
  const start = weekStart(flags.week || 'next');
  const end = addDays(start, 7);
  const rows = await db.query(
    `select * from v_shifts where on_date >= $1 and on_date < $2 and ($3::boolean or status <> 'cancelled')
       and ($4::text is null or venue ilike $4) order by on_date, venue, starts_at`,
    [start, end, !!flags.all, flags.venue ? `%${flags.venue}%` : null],
  );
  out(flags, rows, () => {
    console.log(heading(`Roster, week of ${weekday(start)} ${start}`));
    console.log(table(rows, SHIFT_COLS));
    const cost = rows.filter((r) => r.status !== 'cancelled').reduce((a, r) => a + num(r.cost_cents), 0);
    const mins = rows.filter((r) => r.status !== 'cancelled').reduce((a, r) => a + num(r.paid_minutes), 0);
    console.log(`\n  ${rows.length} shift(s), ${fmtHours(mins)} paid, ${money(cost)} at costing rates.`);
  });
}

async function cmdShiftAdd(db, args, flags) {
  const venue = await resolveVenue(db, args[0]);
  const onDate = parseDate(flags.date);
  const startsAt = parseTime(flags.start, '--start');
  const endsAt = parseTime(flags.end, '--end');
  if (!onDate || !startsAt || !endsAt) throw new CliError('shift add VENUE --date= --start= --end= [--staff= --break=30 --role= --publish]');
  let staff = null;
  if (flags.staff) {
    staff = await resolveStaff(db, flags.staff);
    enforce(await assignmentGates(db, staff, { onDate, startsAt, endsAt }));
  }
  const ref = await mintRef(db, 'shifts', 'SH', 5001);
  const [row] = await db.query(
    `insert into shifts (ref, venue_id, staff_id, on_date, starts_at, ends_at, break_minutes, role_needed, status, note)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
    [ref, venue.id, staff?.staff_id ?? null, onDate, startsAt, endsAt, flags.break === undefined ? 30 : Math.round(parseQty(flags.break, '--break')),
     str(flags.role) || null, flags.publish ? 'published' : 'draft', str(flags.note) || null],
  );
  const [shift] = await db.query(`select * from v_shifts where shift_id = $1`, [row.id]);
  out(flags, shift, () => console.log(`${ref}: ${venue.name} ${onDate} ${startsAt}-${endsAt} ${staff ? staff.name : '(open)'} ${shift.status}.`));
}

async function cmdShiftAssign(db, args, flags) {
  const shift = await resolveByRef(db, 'v_shifts', args[0], 'shift', 'SH');
  const staff = await resolveStaff(db, args.slice(1).join(' ') || flags.staff);
  enforce(await assignmentGates(db, staff, { onDate: isoDate(shift.on_date), startsAt: t5(shift.starts_at), endsAt: t5(shift.ends_at), excludeShiftId: shift.shift_id }));
  await db.query(`update shifts set staff_id = $2 where id = $1`, [shift.shift_id, staff.staff_id]);
  out(flags, { ref: shift.ref, staff: staff.name }, () => console.log(`${shift.ref} is now ${staff.name}'s.`));
}

async function cmdShiftUnassign(db, args, flags) {
  const shift = await resolveByRef(db, 'v_shifts', args[0], 'shift', 'SH');
  await db.query(`update shifts set staff_id = null where id = $1`, [shift.shift_id]);
  out(flags, { ref: shift.ref, was: shift.staff }, () => console.log(`${shift.ref} is open again (was ${shift.staff || 'nobody'}).`));
}

async function cmdShiftCancel(db, args, flags) {
  const shift = await resolveByRef(db, 'v_shifts', args[0], 'shift', 'SH');
  if (!flags.reason) throw new CliError('A cancelled shift keeps its reason: shift cancel REF --reason="..."');
  await db.query(`update shifts set status = 'cancelled', cancel_reason = $2 where id = $1`, [shift.shift_id, str(flags.reason)]);
  out(flags, { ref: shift.ref, cancelled: true }, () => console.log(`${shift.ref} cancelled: ${flags.reason}.`));
}

async function cmdPublish(db, flags) {
  const start = weekStart(flags.week || 'next');
  const drafts = await db.query(
    `select * from v_shifts where status = 'draft' and on_date >= $1 and on_date < $2 order by on_date, starts_at`,
    [start, addDays(start, 7)],
  );
  const published = [];
  const refused = [];
  for (const sh of drafts) {
    if (sh.staff_id) {
      const [staff] = await db.query(`select * from v_staff where staff_id = $1`, [sh.staff_id]);
      const v = await assignmentGates(db, staff, { onDate: isoDate(sh.on_date), startsAt: t5(sh.starts_at), endsAt: t5(sh.ends_at), excludeShiftId: sh.shift_id });
      if (v.length) {
        refused.push({ ref: sh.ref, staff: sh.staff, why: v });
        continue;
      }
    }
    await db.query(`update shifts set status = 'published' where id = $1`, [sh.shift_id]);
    published.push({ ref: sh.ref, staff: sh.staff, on_date: isoDate(sh.on_date) });
  }
  out(flags, { week_of: start, published, refused }, () => {
    console.log(`Week of ${start}: ${published.length} shift(s) published, ${refused.length} refused.`);
    for (const r of refused) console.log(`  refused ${r.ref} (${r.staff}): ${r.why.join(' ')}`);
  });
}

async function cmdOpen(db, flags) {
  const rows = await db.query(`select * from v_open_shifts order by on_date, starts_at`);
  out(flags, rows, () => {
    console.log(heading('Open shifts'));
    console.log(table(rows, SHIFT_COLS));
  });
}

// ---------------------------------------------------------------------------
// The people

async function cmdTeam(db, flags) {
  const rows = await db.query(`select * from v_staff where ($1::boolean or status = 'active') order by home_venue, name`, [!!flags.all]);
  out(flags, rows, () => {
    console.log(heading('The team'));
    console.log(table(rows, [
      { key: 'name', label: 'name' },
      { key: 'role', label: 'role' },
      { key: 'employment', label: 'type' },
      { key: 'home_venue', label: 'home venue', width: 26 },
      { key: 'hourly_rate_cents', label: 'rate', align: 'right', format: (v) => (v == null ? '' : price(v)) },
      { key: 'visa_expires_on', label: 'visa to', format: isoDate },
      { key: 'duty_manager_cert_expires_on', label: 'DM cert to', format: isoDate },
      { key: 'paper', label: 'paper' },
    ]));
  });
}

async function cmdPerson(db, args, flags) {
  const s = await resolveStaff(db, args.join(' '), { includeFormer: true });
  const shifts = await db.query(`select * from v_shifts where staff_id = $1 and on_date >= current_date and status <> 'cancelled' order by on_date`, [s.staff_id]);
  const sheets = await db.query(`select * from v_timesheets where staff_id = $1 order by on_date desc limit 10`, [s.staff_id]);
  const notes = await db.query(`select * from file_notes where subject ilike $1 order by created_at desc`, [`%${s.name}%`]);
  out(flags, { ...s, shifts, timesheets: sheets, notes }, () => {
    console.log(heading(s.name));
    console.log(`  ${s.role}, ${s.employment}, ${s.home_venue || 'no home venue'}. ${s.status}. Rate ${s.hourly_rate_cents ? price(s.hourly_rate_cents) + '/h (costing only)' : 'not set'}.`);
    console.log(`  Right to work: ${s.visa_expires_on ? 'expires ' + isoDate(s.visa_expires_on) : 'no expiry on record'}. Duty manager certificate: ${s.duty_manager_cert_expires_on ? (s.duty_manager_cert_no || '') + ' to ' + isoDate(s.duty_manager_cert_expires_on) : 'none'}. Paper: ${s.paper}.`);
    if (s.note) console.log(`  Note: ${s.note}`);
    console.log('\n  Shifts ahead'); console.log(table(shifts, SHIFT_COLS));
    console.log('\n  Last ten timesheets'); console.log(table(sheets, TS_COLS));
    for (const n of notes) console.log(`\n  ${isoDate(n.created_at)} ${n.author || ''}: ${n.body}`);
  });
}

async function cmdStaffAdd(db, args, flags) {
  const name = args.join(' ').trim();
  if (!name) throw new CliError('staff add NAME --role= [--venue= --rate= --employment= --visa-expires= --cert= --cert-expires=]');
  const venue = flags.venue ? await resolveVenue(db, flags.venue) : null;
  const [row] = await db.query(
    `insert into staff (name, venue_id, role, employment, hourly_rate_cents, phone, email, visa_expires_on, duty_manager_cert_no, duty_manager_cert_expires_on)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
    [name, venue?.id ?? null, str(flags.role) || 'front_of_house', str(flags.employment) || 'casual', parseMoney(flags.rate, '--rate'),
     str(flags.phone) || null, str(flags.email) || null, parseDate(flags['visa-expires'], '--visa-expires'), str(flags.cert) || null,
     parseDate(flags['cert-expires'], '--cert-expires')],
  );
  out(flags, row, () => console.log(`Added ${row.name} (${row.role}).`));
}

async function cmdStaffSet(db, sub, args, flags) {
  const s = await resolveStaff(db, args.join(' '), { includeFormer: sub === 'former' });
  if (sub === 'rate') {
    const rate = parseMoney(flags.rate, '--rate');
    if (rate === null) throw new CliError('staff rate NAME --rate=27.50');
    await db.query(`update staff set hourly_rate_cents = $2 where id = $1`, [s.staff_id, rate]);
  } else if (sub === 'visa') {
    await db.query(`update staff set visa_expires_on = $2 where id = $1`, [s.staff_id, flags.expires === 'none' ? null : parseDate(flags.expires, '--expires')]);
  } else if (sub === 'cert') {
    await db.query(`update staff set duty_manager_cert_no = coalesce($2, duty_manager_cert_no), duty_manager_cert_expires_on = $3 where id = $1`,
      [s.staff_id, str(flags.number) || null, parseDate(flags.expires, '--expires')]);
  } else if (sub === 'former') {
    await db.query(`update staff set status = 'former' where id = $1`, [s.staff_id]);
  } else {
    throw new CliError('staff add|rate|visa|cert|former');
  }
  const [row] = await db.query(`select * from v_staff where staff_id = $1`, [s.staff_id]);
  out(flags, row, () => console.log(`${row.name}: updated. Paper: ${row.paper}.`));
}

async function cmdVenues(db, args, flags, sub) {
  if (sub === 'add') {
    const name = args.join(' ').trim();
    if (!name) throw new CliError('venue add NAME [--address= --licensed]');
    const [row] = await db.query(`insert into venues (name, address, licensed) values ($1, $2, $3) returning *`, [name, str(flags.address) || null, !!flags.licensed]);
    return out(flags, row, () => console.log(`Added ${row.name}${row.licensed ? ' (licensed)' : ''}.`));
  }
  if (sub === 'licensed') {
    const v = await resolveVenue(db, args.join(' '));
    const [row] = await db.query(`update venues set licensed = $2 where id = $1 returning *`, [v.id, !flags.off]);
    return out(flags, row, () => console.log(`${row.name} is ${row.licensed ? 'licensed: the duty manager check now covers it' : 'not licensed'}.`));
  }
  const rows = await db.query(
    `select v.*, (select count(*) from staff s where s.venue_id = v.id and s.status = 'active') as staff,
            (select max(counted_on) from stock_counts c where c.venue_id = v.id and c.status = 'closed') as last_count
     from venues v order by name`,
  );
  out(flags, rows, () => {
    console.log(heading('Venues'));
    console.log(table(rows, [
      { key: 'name', label: 'venue' }, { key: 'address', label: 'address' },
      { key: 'licensed', label: 'licensed', format: (v) => (v ? 'yes' : 'no') },
      { key: 'staff', label: 'staff', align: 'right' }, { key: 'last_count', label: 'last count', format: isoDate }, { key: 'status', label: 'status' },
    ]));
  });
}

// ---------------------------------------------------------------------------
// Time

async function cmdClock(db, sub, args, flags) {
  const s = await resolveStaff(db, args.join(' '));
  if (sub === 'in') {
    const [open] = await db.query(`select ref from timesheets where staff_id = $1 and status = 'open'`, [s.staff_id]);
    if (open) throw new CliError(`${s.name} is already clocked in on ${open.ref}. Clock them out first.`);
    const venue = flags.venue ? await resolveVenue(db, flags.venue) : (s.venue_id ? { id: s.venue_id } : null);
    const day = parseDate(flags.date || 'today');
    const at = parseTime(flags.at || nowTime(), '--at');
    const [shift] = await db.query(`select id from shifts where staff_id = $1 and on_date = $2 and status = 'published' order by starts_at limit 1`, [s.staff_id, day]);
    const ref = await mintRef(db, 'timesheets', 'TS', 5001);
    await db.query(
      `insert into timesheets (ref, staff_id, venue_id, shift_id, on_date, clock_in_at, status) values ($1, $2, $3, $4, $5, ($5::date + $6::time), 'open')`,
      [ref, s.staff_id, venue?.id ?? null, shift?.id ?? null, day, at],
    );
    return out(flags, { ref, staff: s.name, clock_in: `${day} ${at}` }, () => console.log(`${s.name} clocked in at ${at} (${ref}).`));
  }
  if (sub === 'out') {
    const [ts] = await db.query(`select * from timesheets where staff_id = $1 and status = 'open' order by clock_in_at desc limit 1`, [s.staff_id]);
    if (!ts) throw new CliError(`${s.name} is not clocked in.`);
    const inDay = isoDate(ts.clock_in_at);
    const at = parseTime(flags.at || nowTime(), '--at');
    let outAt = `${inDay} ${at}`;
    if (`${outAt}:00` <= String(ts.clock_in_at).replace('T', ' ').slice(0, 19)) outAt = `${addDays(inDay, 1)} ${at}`;
    const brk = flags.break === undefined ? ts.break_minutes : Math.round(parseQty(flags.break, '--break'));
    await db.query(`update timesheets set clock_out_at = $2::timestamp, break_minutes = $3, status = 'submitted' where id = $1`, [ts.id, outAt, brk]);
    const [row] = await db.query(`select * from v_timesheets where timesheet_id = $1`, [ts.id]);
    return out(flags, row, () => {
      console.log(`${s.name} clocked out at ${at}: ${fmtHours(row.worked_minutes)} worked (${row.ref}).`);
      if (row.break_short) console.log(`  Short break: ${row.break_minutes} min recorded, ${row.required_break_minutes} required for the span (ERA 2000 Part 6D). Recorded as it happened.`);
    });
  }
  throw new CliError('clock in NAME [--venue= --at=HH:MM]   |   clock out NAME [--at=HH:MM --break=30]');
}

async function cmdTimesheets(db, flags) {
  const start = flags.week ? weekStart(flags.week) : null;
  const rows = await db.query(
    `select * from v_timesheets where ($1::boolean is false or status in ('submitted', 'open'))
       and ($2::date is null or (on_date >= $2 and on_date < $2::date + 7))
       and ($3::boolean or $2::date is not null or on_date >= current_date - 7)
     order by on_date desc, staff`,
    [!!flags.pending, start, !!flags.all],
  );
  out(flags, rows, () => {
    console.log(heading(flags.pending ? 'Timesheets waiting' : 'Timesheets'));
    console.log(table(rows, TS_COLS));
  });
}

async function cmdApprove(db, args, flags) {
  const targets = flags.all
    ? await db.query(`select * from v_timesheets where status = 'submitted' order by on_date`)
    : [await resolveByRef(db, 'v_timesheets', args[0], 'timesheet', 'TS')];
  const approved = [];
  const refused = [];
  for (const t of targets) {
    if (t.status === 'open') { refused.push({ ref: t.ref, why: 'still open: clock out first' }); continue; }
    if (t.status === 'approved') { refused.push({ ref: t.ref, why: 'already approved' }); continue; }
    await db.query(`update timesheets set status = 'approved', approved_on = current_date where id = $1`, [t.timesheet_id]);
    approved.push({ ref: t.ref, staff: t.staff, worked_minutes: t.worked_minutes, break_short: t.break_short });
  }
  out(flags, { approved, refused }, () => {
    console.log(`${approved.length} approved, ${refused.length} refused.`);
    for (const a of approved.filter((x) => x.break_short)) console.log(`  ${a.ref} ${a.staff}: approved with a short meal break on record. Fix the practice, not the number.`);
    for (const r of refused) console.log(`  ${r.ref}: ${r.why}`);
  });
}

// ---------------------------------------------------------------------------
// Suppliers, items, prices

async function cmdSuppliers(db, args, flags, sub) {
  if (sub === 'add') {
    const name = args.join(' ').trim();
    if (!name) throw new CliError('supplier add NAME [--email= --phone= --order-days= --account=]');
    const [row] = await db.query(`insert into suppliers (name, email, phone, order_days, account_no) values ($1, $2, $3, $4, $5) returning *`,
      [name, str(flags.email) || null, str(flags.phone) || null, str(flags['order-days']) || null, str(flags.account) || null]);
    return out(flags, row, () => console.log(`Added supplier ${row.name}.`));
  }
  const rows = await db.query(
    `select s.*, (select count(*) from items i where i.supplier_id = s.id) as items,
            (select coalesce(sum(total_cents), 0) from v_invoices i where i.supplier_id = s.id and i.invoice_date >= current_date - 28) as spend_28d_cents,
            (select count(*) from v_invoices i where i.supplier_id = s.id and i.state in ('DIFFERS FROM ORDER', 'NO INVOICE NUMBER', 'DISPUTED', 'OVERDUE')) as invoice_issues
     from suppliers s order by name`,
  );
  out(flags, rows, () => {
    console.log(heading('Suppliers'));
    console.log(table(rows, [
      { key: 'name', label: 'supplier' }, { key: 'order_days', label: 'orders' }, { key: 'email', label: 'email' },
      { key: 'items', label: 'items', align: 'right' }, { key: 'spend_28d_cents', label: 'spend 28d', align: 'right', format: (v) => money(v) },
      { key: 'invoice_issues', label: 'issues', align: 'right' },
    ]));
  });
}

async function cmdItems(db, args, flags, sub) {
  if (sub === 'add') {
    const name = args.join(' ').trim();
    if (!name) throw new CliError('item add NAME --unit=kg --category=food [--supplier= --pack=5 --pack-label= --par= --cost=]');
    const supplier = flags.supplier ? await resolveSupplier(db, flags.supplier) : null;
    const [row] = await db.query(
      `insert into items (name, category, unit, supplier_id, pack_size, pack_label, par_qty) values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [name, str(flags.category) || 'food', str(flags.unit) || 'ea', supplier?.id ?? null, flags.pack ? parseQty(flags.pack, '--pack') : 1,
       str(flags['pack-label']) || null, flags.par ? parseQty(flags.par, '--par') : null],
    );
    const cost = parseMoney(flags.cost, '--cost');
    if (cost !== null) await db.query(`insert into item_prices (item_id, unit_cost_cents, effective_on, source) values ($1, $2, current_date, 'manual')`, [row.id, cost]);
    return out(flags, row, () => console.log(`Added ${row.name} (${row.unit}).`));
  }
  if (sub === 'cost' || sub === 'par') {
    const item = await resolveItem(db, args.join(' '));
    if (sub === 'cost') {
      const cost = parseMoney(flags.cost, '--cost');
      if (cost === null) throw new CliError('item cost NAME --cost=12.50 (per unit, ex GST)');
      await db.query(`insert into item_prices (item_id, unit_cost_cents, effective_on, source) values ($1, $2, coalesce($3::date, current_date), 'manual')`,
        [item.item_id, cost, parseDate(flags.date)]);
    } else {
      await db.query(`update items set par_qty = $2 where id = $1`, [item.item_id, flags.par === 'none' ? null : parseQty(flags.par, '--par')]);
    }
    const [row] = await db.query(`select * from v_item_cost where item_id = $1`, [item.item_id]);
    return out(flags, row, () => console.log(`${row.name}: ${row.unit_cost_cents == null ? 'no cost' : price(row.unit_cost_cents) + '/' + row.unit}, par ${row.par_qty ?? 'none'}.`));
  }
  const rows = await db.query(`select * from v_item_cost where ($1::text is null or category = $1) and status = 'active' order by category, name`, [str(flags.category) || null]);
  out(flags, rows, () => {
    console.log(heading('Stock items'));
    console.log(table(rows, [
      { key: 'name', label: 'item' }, { key: 'category', label: 'category' }, { key: 'unit', label: 'unit' },
      { key: 'supplier', label: 'supplier', width: 22 }, { key: 'pack_label', label: 'pack' },
      { key: 'unit_cost_cents', label: 'cost/unit', align: 'right', format: (v) => (v == null ? 'NO COST' : price(v)) },
      { key: 'change_pct', label: 'last move', align: 'right', format: (v) => (v == null ? '' : `${v > 0 ? '+' : ''}${v}%`) },
      { key: 'par_qty', label: 'par', align: 'right', format: (v) => (v == null ? '' : Number(v)) },
    ]));
  });
}

async function cmdPriceWatch(db, flags) {
  const days = Math.max(1, num(flags.days || 60));
  const rows = await db.query(
    `select c.*, (select count(*) from recipe_lines rl where rl.item_id = c.item_id) as in_recipes
     from v_item_cost c where c.change_pct is not null and c.cost_since >= current_date - $1::int order by abs(c.change_pct) desc`,
    [days],
  );
  const hit = await db.query(
    `select r.name as recipe, i.name as item, r.cost_pct, r.target_pct, r.state from recipe_lines rl
     join v_recipe_cost r on r.recipe_id = rl.recipe_id join v_item_cost i on i.item_id = rl.item_id
     where i.change_pct is not null and i.cost_since >= current_date - $1::int order by r.cost_pct desc`,
    [days],
  );
  out(flags, { moves: rows, recipes_affected: hit }, () => {
    console.log(heading(`Cost moves, last ${days} days`));
    console.log(table(rows, [
      { key: 'name', label: 'item' }, { key: 'supplier', label: 'supplier' },
      { key: 'previous_cost_cents', label: 'was', align: 'right', format: (v) => price(v) },
      { key: 'unit_cost_cents', label: 'now', align: 'right', format: (v, r) => `${price(v)}/${r.unit}` },
      { key: 'change_pct', label: 'move', align: 'right', format: (v) => `${v > 0 ? '+' : ''}${v}%` },
      { key: 'cost_since', label: 'since', format: isoDate },
      { key: 'in_recipes', label: 'recipes', align: 'right' },
    ]));
    if (hit.length) {
      console.log('\n  Recipes that use them:');
      console.log(table(hit, [
        { key: 'recipe', label: 'recipe' }, { key: 'item', label: 'via' },
        { key: 'cost_pct', label: 'cost %', align: 'right', format: pct }, { key: 'target_pct', label: 'target', align: 'right', format: pct }, { key: 'state', label: 'state' },
      ]));
    }
  });
}

// ---------------------------------------------------------------------------
// Stock: on hand, counts, waste

async function cmdStock(db, flags) {
  const rows = await db.query(
    `select * from v_stock_on_hand where ($1::text is null or venue ilike $1) and ($2::boolean is false or below_par) order by venue, supplier, item`,
    [flags.venue ? `%${flags.venue}%` : null, !!flags.below],
  );
  out(flags, rows, () => {
    console.log(heading(flags.below ? 'Below par' : 'Stock on hand'));
    console.log(table(rows, [
      { key: 'venue', label: 'venue', width: 26 }, { key: 'item', label: 'item' }, { key: 'supplier', label: 'supplier', width: 22 },
      { key: 'counted_qty', label: 'counted', align: 'right', format: (v) => Number(v) },
      { key: 'received_qty', label: '+ in', align: 'right', format: (v) => Number(v) },
      { key: 'wasted_qty', label: '- waste', align: 'right', format: (v) => Number(v) },
      { key: 'on_hand_qty', label: 'on hand', align: 'right', format: (v, r) => `${Number(v)} ${r.unit}` },
      { key: 'par_qty', label: 'par', align: 'right', format: (v) => (v == null ? '' : Number(v)) },
      { key: 'packs_to_par', label: 'order', align: 'right', format: (v, r) => (num(v) > 0 ? `${v} x ${r.pack_label || r.pack_size + r.unit}` : '') },
    ]));
    console.log('\n  On hand = the last closed count + invoiced since - waste since. Sales do not draw it down; the next count is the truth.');
  });
}

async function cmdCount(db, sub, args, flags) {
  if (sub === 'start') {
    const venue = await resolveVenue(db, args.join(' '));
    const [open] = await db.query(`select ref from stock_counts where venue_id = $1 and status = 'open'`, [venue.id]);
    if (open) throw new CliError(`${venue.name} already has ${open.ref} open. Finish it (count close ${open.ref}) or keep entering lines.`);
    const ref = await mintRef(db, 'stock_counts', 'SC', 5001);
    await db.query(`insert into stock_counts (ref, venue_id, counted_on, counted_by) values ($1, $2, coalesce($3::date, current_date), $4)`,
      [ref, venue.id, parseDate(flags.date), str(flags.by) || null]);
    return out(flags, { ref, venue: venue.name }, () => console.log(`${ref} open for ${venue.name}. Enter lines: count set ${ref} ITEM QTY`));
  }
  if (sub === 'set') {
    const sc = await resolveByRef(db, 'stock_counts', args[0], 'count', 'SC');
    if (sc.status === 'closed') throw new CliError(`${sc.ref} is closed. A closed count is a bookend of a cost of goods figure; start a new one.`);
    const pairs = flags.lines
      ? String(flags.lines).split(';').filter(Boolean).map((p) => { const [i, q] = p.split('='); return [i.trim(), q]; })
      : [[args.slice(1, -1).join(' '), args[args.length - 1]]];
    const set = [];
    for (const [itemName, q] of pairs) {
      const item = await resolveItem(db, itemName);
      const qty = parseQty(q, 'count quantity');
      await db.query(`insert into count_lines (count_id, item_id, qty) values ($1, $2, $3) on conflict (count_id, item_id) do update set qty = excluded.qty`, [sc.id, item.item_id, qty]);
      set.push({ item: item.name, qty, unit: item.unit });
    }
    return out(flags, { ref: sc.ref, set }, () => { for (const s of set) console.log(`${sc.ref}: ${s.item} ${s.qty} ${s.unit}`); });
  }
  if (sub === 'close') {
    const sc = await resolveByRef(db, 'stock_counts', args[0], 'count', 'SC');
    if (sc.status === 'closed') throw new CliError(`${sc.ref} is already closed.`);
    const [{ n }] = await db.query(`select count(*)::int as n from count_lines where count_id = $1`, [sc.id]);
    if (!n) throw new CliError(`${sc.ref} has no lines. Count something first.`);
    // A half count makes a wrong cost of goods: everything on the last closed
    // count at this venue is counted again (zero is a number).
    const missing = await db.query(
      `select i.name from count_lines cl join items i on i.id = cl.item_id
       where cl.count_id = (select id from stock_counts where venue_id = $1 and status = 'closed' and id <> $2 order by counted_on desc, created_at desc limit 1)
         and i.status = 'active' and not exists (select 1 from count_lines x where x.count_id = $2 and x.item_id = cl.item_id)
       order by i.name`,
      [sc.venue_id, sc.id],
    );
    if (missing.length) {
      throw new CliError(`refused: ${sc.ref} is missing ${missing.length} item(s) that were on the last count: ${missing.map((m) => m.name).join(', ')}. ` +
        `Count them (zero is a number: count set ${sc.ref} --lines="Item=0;..."), then close. A half count makes a wrong cost of goods.`);
    }
    await db.query(`update stock_counts set status = 'closed' where id = $1`, [sc.id]);
    const value = await db.query(`select category, value_cents from v_count_value where count_id = $1`, [sc.id]);
    const cogs = await db.query(`select * from v_period_cogs where to_count = $1`, [sc.ref]);
    return out(flags, { ref: sc.ref, lines: n, value, cost_of_goods: cogs }, () => {
      console.log(`${sc.ref} closed: ${n} line(s), ${value.map((v) => `${v.category} ${money(v.value_cents)}`).join(', ')}.`);
      if (cogs.length) console.log(table(cogs, COGS_COLS));
    });
  }
  const rows = await db.query(
    `select sc.ref, v.name as venue, sc.counted_on, sc.status, sc.counted_by,
            (select count(*) from count_lines cl where cl.count_id = sc.id) as lines,
            (select sum(value_cents) from v_count_value cv where cv.count_id = sc.id) as value_cents
     from stock_counts sc join venues v on v.id = sc.venue_id order by sc.counted_on desc`,
  );
  out(flags, rows, () => {
    console.log(heading('Stock counts'));
    console.log(table(rows, [
      { key: 'ref', label: 'ref' }, { key: 'venue', label: 'venue' }, { key: 'counted_on', label: 'date', format: isoDate },
      { key: 'status', label: 'status' }, { key: 'counted_by', label: 'by' }, { key: 'lines', label: 'lines', align: 'right' },
      { key: 'value_cents', label: 'value', align: 'right', format: (v) => (v == null ? '' : money(v)) },
    ]));
  });
}

async function cmdWaste(db, args, flags, sub) {
  if (sub === 'add') {
    const venue = await resolveVenue(db, args[0]);
    const qty = parseQty(args[args.length - 1], 'waste quantity');
    const item = await resolveItem(db, args.slice(1, -1).join(' '));
    if (qty <= 0) throw new CliError('Waste is a positive quantity.');
    await db.query(`insert into waste (venue_id, item_id, qty, reason, on_date, recorded_by) values ($1, $2, $3, $4, coalesce($5::date, current_date), $6)`,
      [venue.id, item.item_id, qty, str(flags.reason) || 'spoiled', parseDate(flags.date), str(flags.by) || null]);
    const cost = Math.round(qty * num(item.unit_cost_cents));
    return out(flags, { venue: venue.name, item: item.name, qty, cost_cents: cost }, () => console.log(`Logged ${qty} ${item.unit} ${item.name} at ${venue.name}: ${money(cost)} at today's cost.`));
  }
  const days = Math.max(1, num(flags.days || 14));
  const rows = await db.query(
    `select w.on_date, v.name as venue, c.name as item, w.qty, c.unit, w.reason, w.recorded_by,
            round(w.qty * coalesce(c.unit_cost_cents, 0)) as cost_cents
     from waste w join venues v on v.id = w.venue_id join v_item_cost c on c.item_id = w.item_id
     where w.on_date >= current_date - $1::int order by w.on_date desc`,
    [days],
  );
  out(flags, rows, () => {
    console.log(heading(`Waste, last ${days} days`));
    console.log(table(rows, [
      { key: 'on_date', label: 'date', format: isoDate }, { key: 'venue', label: 'venue' }, { key: 'item', label: 'item' },
      { key: 'qty', label: 'qty', align: 'right', format: (v, r) => `${Number(v)} ${r.unit}` }, { key: 'reason', label: 'reason' },
      { key: 'recorded_by', label: 'by' }, { key: 'cost_cents', label: 'cost', align: 'right', format: (v) => price(v) },
    ]));
    console.log(`\n  ${money(rows.reduce((a, r) => a + num(r.cost_cents), 0))} in the bin at today's costs.`);
  });
}

// ---------------------------------------------------------------------------
// Orders and invoices

async function parOrderLines(db, venueId, supplierId) {
  return db.query(
    `select * from v_stock_on_hand where venue_id = $1 and below_par and ($2::uuid is null or supplier_id = $2) order by supplier, item`,
    [venueId, supplierId],
  );
}

async function cmdOrder(db, sub, args, flags) {
  if (sub === 'suggest') {
    const venue = await resolveVenue(db, args.join(' '));
    const supplier = flags.supplier ? await resolveSupplier(db, flags.supplier) : null;
    const rows = await parOrderLines(db, venue.id, supplier?.id ?? null);
    const lines = rows.map((r) => ({ supplier: r.supplier, item: r.item, on_hand: Number(r.on_hand_qty), par: Number(r.par_qty), packs: Number(r.packs_to_par),
      pack: r.pack_label || `${Number(r.pack_size)} ${r.unit}`, qty: Number(r.packs_to_par) * Number(r.pack_size), unit: r.unit,
      est_cents: Math.round(Number(r.packs_to_par) * Number(r.pack_size) * num(r.unit_cost_cents)) }));
    return out(flags, { venue: venue.name, lines }, () => {
      console.log(heading(`Par order for ${venue.name}`));
      console.log(table(lines, [
        { key: 'supplier', label: 'supplier' }, { key: 'item', label: 'item' }, { key: 'on_hand', label: 'on hand', align: 'right' },
        { key: 'par', label: 'par', align: 'right' }, { key: 'packs', label: 'packs', align: 'right' }, { key: 'pack', label: 'pack' },
        { key: 'est_cents', label: 'est.', align: 'right', format: (v) => money(v) },
      ]));
      if (lines.length) console.log(`\n  Make it a draft order: order draft "${venue.name}" "SUPPLIER"`);
    });
  }
  if (sub === 'draft') {
    const venue = await resolveVenue(db, args[0]);
    const supplier = await resolveSupplier(db, args.slice(1).join(' ') || flags.supplier);
    let lines;
    if (flags.lines) {
      lines = [];
      for (const p of String(flags.lines).split(';').filter(Boolean)) {
        const [itemName, q] = p.split('=');
        const item = await resolveItem(db, itemName.trim());
        lines.push({ item_id: item.item_id, item: item.name, qty: parseQty(q), unit_cost_cents: item.unit_cost_cents });
      }
    } else {
      lines = (await parOrderLines(db, venue.id, supplier.id)).map((r) => ({ item_id: r.item_id, item: r.item, qty: Number(r.packs_to_par) * Number(r.pack_size), unit_cost_cents: r.unit_cost_cents }));
    }
    if (!lines.length) throw new CliError(`Nothing from ${supplier.name} is under par at ${venue.name}. Name the lines: --lines="Item=qty;Item=qty".`);
    const ref = await mintRef(db, 'orders', 'PO', 5001);
    const [o] = await db.query(`insert into orders (ref, venue_id, supplier_id, status, expected_on, note) values ($1, $2, $3, 'draft', $4, $5) returning id`,
      [ref, venue.id, supplier.id, parseDate(flags.expected), str(flags.note) || null]);
    for (const l of lines) await db.query(`insert into order_lines (order_id, item_id, qty, unit_cost_cents) values ($1, $2, $3, $4)`, [o.id, l.item_id, l.qty, l.unit_cost_cents]);
    const [row] = await db.query(`select * from v_orders where order_id = $1`, [o.id]);
    return out(flags, { ...row, lines }, () => console.log(`${ref}: draft order to ${supplier.name} for ${venue.name}, ${lines.length} line(s), about ${money(row.order_cents)}. /draft-order writes the email; a person sends it, then: order sent ${ref}`));
  }
  if (sub === 'sent' || sub === 'cancel') {
    const o = await resolveByRef(db, 'v_orders', args[0], 'order', 'PO');
    if (sub === 'sent') await db.query(`update orders set status = 'sent', ordered_on = current_date, expected_on = coalesce($2::date, expected_on, current_date + 1) where id = $1`, [o.order_id, parseDate(flags.expected)]);
    else await db.query(`update orders set status = 'cancelled' where id = $1`, [o.order_id]);
    return out(flags, { ref: o.ref, status: sub === 'sent' ? 'sent' : 'cancelled' }, () => console.log(`${o.ref} marked ${sub === 'sent' ? 'sent' : 'cancelled'}.`));
  }
  if (sub === 'show') {
    const o = await resolveByRef(db, 'v_orders', args[0], 'order', 'PO');
    const lines = await db.query(
      `select c.name as item, ol.qty, c.unit, c.pack_label, ol.unit_cost_cents, round(ol.qty * coalesce(ol.unit_cost_cents, 0)) as line_cents
       from order_lines ol join v_item_cost c on c.item_id = ol.item_id where ol.order_id = $1 order by c.name`,
      [o.order_id],
    );
    return out(flags, { ...o, lines }, () => {
      console.log(heading(`${o.ref}: ${o.supplier} for ${o.venue} (${o.state})`));
      console.log(table(lines, [
        { key: 'item', label: 'item' }, { key: 'qty', label: 'qty', align: 'right', format: (v, r) => `${Number(v)} ${r.unit}` },
        { key: 'unit_cost_cents', label: 'cost/unit', align: 'right', format: (v) => price(v) }, { key: 'line_cents', label: 'line', align: 'right', format: (v) => price(v) },
      ]));
    });
  }
  const rows = await db.query(`select * from v_orders where ($1::boolean or status in ('draft', 'sent')) order by ref desc`, [!!flags.all]);
  out(flags, rows, () => {
    console.log(heading(flags.all ? 'Orders' : 'Orders in flight'));
    console.log(table(rows, [
      { key: 'ref', label: 'ref' }, { key: 'venue', label: 'venue', width: 26 }, { key: 'supplier', label: 'supplier' },
      { key: 'ordered_on', label: 'ordered', format: isoDate }, { key: 'expected_on', label: 'expected', format: isoDate },
      { key: 'lines', label: 'lines', align: 'right' }, { key: 'order_cents', label: 'value', align: 'right', format: (v) => money(v) }, { key: 'state', label: 'state' },
    ]));
  });
}

async function cmdInvoice(db, sub, args, flags) {
  if (sub === 'add') {
    const venue = await resolveVenue(db, args[0]);
    const supplier = await resolveSupplier(db, args.slice(1).join(' ') || flags.supplier);
    const day = parseDate(flags.date || 'today');
    if (!flags.lines) throw new CliError('invoice add VENUE SUPPLIER --no= --date= --lines="Item:qty@unitcost;Item:qty@unitcost" [--order=PO-... --terms=20]');
    const order = flags.order ? await resolveByRef(db, 'v_orders', flags.order, 'order', 'PO') : null;
    const lines = [];
    for (const p of String(flags.lines).split(';').filter(Boolean)) {
      const m = p.match(/^(.+?):\s*([\d.,]+)\s*@\s*\$?([\d.,]+)$/);
      if (!m) throw new CliError(`Cannot read invoice line "${p}". Use Item:qty@unitcost, quantity in the item's unit, cost ex GST.`);
      const item = await resolveItem(db, m[1].trim());
      lines.push({ item, qty: parseQty(m[2]), unit_cost_cents: parseMoney(m[3]) });
    }
    if (flags['dry-run']) {
      return out(flags, { dry_run: true, lines: lines.map((l) => ({ item: l.item.name, qty: l.qty, unit_cost_cents: l.unit_cost_cents })) }, () => console.log('Dry run: nothing written.'));
    }
    const ref = await mintRef(db, 'invoices', 'INV', 5001);
    const terms = flags.terms ? Math.round(parseQty(flags.terms)) : 20;
    const [inv] = await db.query(
      `insert into invoices (ref, venue_id, supplier_id, order_id, supplier_invoice_no, invoice_date, due_on, note)
       values ($1, $2, $3, $4, $5, $6, $6::date + $7::int, $8) returning id`,
      [ref, venue.id, supplier.id, order?.order_id ?? null, str(flags.no) || null, day, terms, str(flags.note) || null],
    );
    const moved = [];
    for (const l of lines) {
      await db.query(`insert into invoice_lines (invoice_id, item_id, description, qty, unit_cost_cents) values ($1, $2, $3, $4, $5)`, [inv.id, l.item.item_id, l.item.name, l.qty, l.unit_cost_cents]);
      if (l.item.unit_cost_cents === null || Number(l.item.unit_cost_cents) !== l.unit_cost_cents) {
        await db.query(`insert into item_prices (item_id, unit_cost_cents, effective_on, source, invoice_id) values ($1, $2, $3, 'invoice', $4)`, [l.item.item_id, l.unit_cost_cents, day, inv.id]);
        moved.push({ item: l.item.name, was_cents: l.item.unit_cost_cents, now_cents: l.unit_cost_cents });
      }
    }
    if (order) await db.query(`update orders set status = 'received' where id = $1`, [order.order_id]);
    const [row] = await db.query(`select * from v_invoices where invoice_id = $1`, [inv.id]);
    return out(flags, { ...row, cost_moves: moved }, () => {
      console.log(`${ref}: ${supplier.name} ${row.supplier_invoice_no || '(no invoice number)'}, ${money(row.total_cents)} ex GST, ${row.state}.`);
      for (const m of moved) console.log(`  cost moved: ${m.item} ${m.was_cents == null ? 'none' : price(m.was_cents)} -> ${price(m.now_cents)}. Recipes using it re-cost now.`);
    });
  }
  if (sub === 'paid' || sub === 'dispute') {
    const inv = await resolveByRef(db, 'v_invoices', args[0], 'invoice', 'INV');
    if (sub === 'dispute' && !flags.why) throw new CliError('invoice dispute REF --why="short delivered 25kg fries"');
    await db.query(`update invoices set status = $2, note = coalesce($3, note) where id = $1`, [inv.invoice_id, sub === 'paid' ? 'paid' : 'disputed', str(flags.why) || null]);
    return out(flags, { ref: inv.ref, status: sub === 'paid' ? 'paid' : 'disputed' }, () => console.log(`${inv.ref} marked ${sub === 'paid' ? 'paid' : 'disputed'}.`));
  }
  if (sub === 'show') {
    const inv = await resolveByRef(db, 'v_invoices', args[0], 'invoice', 'INV');
    const lines = await db.query(
      `select coalesce(c.name, l.description) as item, l.qty, c.unit, l.unit_cost_cents, round(l.qty * l.unit_cost_cents) as line_cents,
              ol.qty as ordered_qty, ol.unit_cost_cents as ordered_cost_cents
       from invoice_lines l left join v_item_cost c on c.item_id = l.item_id
       left join order_lines ol on ol.order_id = $2 and ol.item_id = l.item_id
       where l.invoice_id = $1 order by 1`,
      [inv.invoice_id, inv.order_id],
    );
    return out(flags, { ...inv, lines }, () => {
      console.log(heading(`${inv.ref}: ${inv.supplier} ${inv.supplier_invoice_no || '(no number)'} for ${inv.venue} (${inv.state})`));
      console.log(table(lines, [
        { key: 'item', label: 'item' }, { key: 'qty', label: 'qty', align: 'right', format: (v, r) => `${Number(v)} ${r.unit || ''}` },
        { key: 'ordered_qty', label: 'ordered', align: 'right', format: (v) => (v == null ? '' : Number(v)) },
        { key: 'unit_cost_cents', label: 'cost/unit', align: 'right', format: (v) => price(v) },
        { key: 'ordered_cost_cents', label: 'expected', align: 'right', format: (v) => price(v) },
        { key: 'line_cents', label: 'line', align: 'right', format: (v) => price(v) },
      ]));
    });
  }
  const rows = await db.query(
    `select * from v_invoices where ($1::boolean or status <> 'paid') and ($2::boolean is false or state in ('DIFFERS FROM ORDER', 'NO INVOICE NUMBER', 'DISPUTED', 'OVERDUE'))
     order by invoice_date desc`,
    [!!flags.all, !!flags.open],
  );
  out(flags, rows, () => {
    console.log(heading(flags.open ? 'Invoices that need a look' : 'Supplier invoices'));
    console.log(table(rows, [
      { key: 'ref', label: 'ref' }, { key: 'invoice_date', label: 'date', format: isoDate }, { key: 'venue', label: 'venue', width: 26 },
      { key: 'supplier', label: 'supplier' }, { key: 'supplier_invoice_no', label: 'their no' },
      { key: 'total_cents', label: 'ex GST', align: 'right', format: (v) => price(v) }, { key: 'order_ref', label: 'order' },
      { key: 'due_on', label: 'due', format: isoDate }, { key: 'state', label: 'state' },
    ]));
  });
}

// ---------------------------------------------------------------------------
// Recipes and the menu

async function cmdRecipes(db, args, flags, sub) {
  if (sub === 'add') {
    const name = args.join(' ').trim();
    if (!name) throw new CliError('recipe add NAME --price=24 --category=food|beverage [--portions=1]');
    const [row] = await db.query(`insert into recipes (name, category, menu_price_cents, portions, note) values ($1, $2, $3, $4, $5) returning *`,
      [name, str(flags.category) || 'food', parseMoney(flags.price, '--price'), flags.portions ? parseQty(flags.portions) : 1, str(flags.note) || null]);
    return out(flags, row, () => console.log(`Added ${row.name}. Add lines: recipe line "${row.name}" ITEM QTY`));
  }
  if (sub === 'line') {
    const r = await resolveRecipe(db, args[0]);
    const qty = parseQty(args[args.length - 1], 'recipe quantity');
    const item = await resolveItem(db, args.slice(1, -1).join(' '));
    if (qty === 0) await db.query(`delete from recipe_lines where recipe_id = $1 and item_id = $2`, [r.recipe_id, item.item_id]);
    else await db.query(`insert into recipe_lines (recipe_id, item_id, qty) values ($1, $2, $3) on conflict (recipe_id, item_id) do update set qty = excluded.qty`, [r.recipe_id, item.item_id, qty]);
    const [row] = await db.query(`select * from v_recipe_cost where recipe_id = $1`, [r.recipe_id]);
    return out(flags, row, () => console.log(`${row.name}: ${item.name} ${qty ? qty + ' ' + item.unit : 'removed'}. Plate cost ${price(row.plate_cost_cents)}, ${pct(row.cost_pct)} (${row.state}).`));
  }
  if (sub === 'price') {
    const r = await resolveRecipe(db, args.join(' '));
    const p = parseMoney(flags.price, '--price');
    if (p === null) throw new CliError('recipe price NAME --price=56 (the menu price, GST inclusive)');
    await db.query(`update recipes set menu_price_cents = $2 where id = $1`, [r.recipe_id, p]);
    const [row] = await db.query(`select * from v_recipe_cost where recipe_id = $1`, [r.recipe_id]);
    return out(flags, row, () => console.log(`${row.name}: now ${price(p)} on the menu, ${pct(row.cost_pct)} cost, ${price(row.margin_cents)} margin a plate (${row.state}).`));
  }
  if (sub === 'show') {
    const r = await resolveRecipe(db, args.join(' '));
    const lines = await db.query(
      `select c.name as item, rl.qty, c.unit, c.unit_cost_cents, round(rl.qty * c.unit_cost_cents, 2) as line_cents, c.change_pct, c.cost_since
       from recipe_lines rl join v_item_cost c on c.item_id = rl.item_id where rl.recipe_id = $1 order by rl.qty * coalesce(c.unit_cost_cents, 0) desc`,
      [r.recipe_id],
    );
    // What the plate would cost if a price move were undone: the target price that fixes it.
    const target = num(r.target_pct);
    const fixPrice = r.plate_cost_cents && target ? Math.ceil((num(r.plate_cost_cents) / (target / 100)) * (1 + (await settings(db)).gst_pct / 100) / 50) * 50 : null;
    return out(flags, { ...r, lines, price_for_target_cents: fixPrice }, () => {
      console.log(heading(`${r.name} (${r.category}, ${r.state})`));
      console.log(table(lines, [
        { key: 'item', label: 'ingredient' }, { key: 'qty', label: 'qty', align: 'right', format: (v, x) => `${Number(v)} ${x.unit}` },
        { key: 'unit_cost_cents', label: 'cost/unit', align: 'right', format: (v) => (v == null ? 'NO COST' : price(v)) },
        { key: 'line_cents', label: 'line', align: 'right', format: (v) => price(v) },
        { key: 'change_pct', label: 'last move', align: 'right', format: (v) => (v == null ? '' : `${v > 0 ? '+' : ''}${v}%`) },
      ]));
      console.log(`\n  Menu ${price(r.menu_price_cents)} (${price(r.price_ex_gst_cents)} ex GST). Plate cost ${price(r.plate_cost_cents)}. Cost ${pct(r.cost_pct)} against ${pct(r.target_pct)}. Margin ${price(r.margin_cents)} a plate.`);
      if (r.state === 'OVER TARGET' && fixPrice) console.log(`  At ${pct(target)} the menu price would be ${price(fixPrice)}, or take cost out of the plate.`);
    });
  }
  const rows = await db.query(`select * from v_recipe_cost where ($1::boolean or status = 'active') order by category, cost_pct desc nulls first`, [!!flags.all]);
  out(flags, rows, () => {
    console.log(heading('Recipes, costed at today\'s prices'));
    console.log(table(rows, RECIPE_COLS));
  });
}

const RECIPE_COLS = [
  { key: 'name', label: 'recipe' }, { key: 'category', label: 'category' },
  { key: 'menu_price_cents', label: 'menu', align: 'right', format: (v) => price(v) },
  { key: 'plate_cost_cents', label: 'plate cost', align: 'right', format: (v) => price(v) },
  { key: 'cost_pct', label: 'cost %', align: 'right', format: pct },
  { key: 'target_pct', label: 'target', align: 'right', format: pct },
  { key: 'margin_cents', label: 'margin', align: 'right', format: (v) => price(v) },
  { key: 'state', label: 'state' },
];

async function cmdMenu(db, flags) {
  const rows = await db.query(`select * from v_recipe_cost where status = 'active' and menu_price_cents is not null order by margin_cents desc nulls last`);
  out(flags, rows, () => {
    console.log(heading('The menu by margin a plate'));
    console.log(table(rows, RECIPE_COLS));
    console.log('\n  The dollars a plate leaves after ingredients, ex GST. Push the top of this list; fix or reprice anything OVER TARGET.');
  });
}

// ---------------------------------------------------------------------------
// The rules, attention, settings, notes

async function cmdAttention(db, flags) {
  const rows = await db.query(`select * from v_attention order by rank, days desc nulls last`);
  out(flags, rows, () => {
    console.log(heading('Needs a decision, worst first'));
    if (!rows.length) return console.log('  Nothing. The roster is clean, the cash balances, the margins are on target.');
    for (const r of rows) {
      console.log(`\n  [${r.rank}] ${r.reason}  ${[r.label, r.who, r.place].filter(Boolean).join('  ')}`);
      console.log(`      ${r.detail}`);
    }
  });
}

const COMPLIANCE_RULES = [
  {
    key: 'entitlement',
    title: 'Right to work: nobody rostered past their recorded entitlement (Immigration Act 2009 s 350)',
    sql: `select staff as who, ref, to_char(on_date, 'Dy YYYY-MM-DD') as shift from v_shifts where state = 'NO WORK RIGHTS' and on_date >= current_date order by on_date`,
    gate: 'shift add, shift assign and publish refuse a shift dated past the recorded expiry. No force flag.',
  },
  {
    key: 'duty-manager',
    title: 'A certified duty manager on every trading day at a licensed venue (Sale and Supply of Alcohol Act 2012 ss 212-214)',
    sql: `select venue, to_char(on_date, 'Dy YYYY-MM-DD') as day, shifts::int as shifts_published from v_duty_days where not covered order by on_date`,
    gate: 'Check only: the fix is a person on the day, not a flag.',
  },
  {
    key: 'breaks',
    title: 'Meal breaks match the span worked (Employment Relations Act 2000 Part 6D)',
    sql: `select ref, staff as who, to_char(on_date, 'YYYY-MM-DD') as day, break_minutes::int as recorded, required_break_minutes::int as required
          from v_timesheets where break_short and status in ('submitted', 'approved') and on_date >= current_date - 30 order by on_date`,
    gate: 'clock out and approve say it out loud; the record is never silently rounded.',
  },
  {
    key: 'rest',
    title: 'The rest window between shifts holds (HSWA 2015 fatigue duty; Hospitality Award cl 15 in AU)',
    sql: `select staff as who, first_ref || ' then ' || then_ref as shifts, to_char(then_date, 'Dy YYYY-MM-DD') as day, gap_hours from v_rest_clashes where then_date >= current_date order by then_date`,
    gate: 'shift add, shift assign and publish refuse a new shift inside the window. No force flag.',
  },
  {
    key: 'wage-records',
    title: 'The wages and time record is kept and closed (Employment Relations Act 2000 s 130)',
    sql: `select ref, staff as who, to_char(on_date, 'YYYY-MM-DD') as day, 'open since ' || to_char(clock_in_at, 'YYYY-MM-DD HH24:MI') as problem from v_timesheets where state = 'NOT CLOCKED OUT'`,
    gate: 'No delete path: shifts cancel, staff become former, timesheets stay. A sheet left open is hours nobody confirmed: close it while somebody remembers.',
  },
  {
    key: 'gst-records',
    title: 'Supplier invoices are kept with their number for GST (Goods and Services Tax Act 1985 ss 20, 75)',
    sql: `select ref, supplier, to_char(invoice_date, 'YYYY-MM-DD') as dated, to_char(total_cents / 100.0, 'FM9999990.00') as ex_gst from v_invoices where state = 'NO INVOICE NUMBER' order by invoice_date`,
    gate: 'No delete path for invoices: they are disputed or paid. Ask the supplier for the tax invoice and record its number.',
  },
];

async function cmdCompliance(db, args, flags) {
  const only = args[0] ? String(args[0]).toLowerCase() : null;
  const rules = only ? COMPLIANCE_RULES.filter((r) => r.key === only) : COMPLIANCE_RULES;
  if (!rules.length) throw new CliError(`Unknown rule "${only}". Rules: ${COMPLIANCE_RULES.map((r) => r.key).join(', ')}.`);
  const results = [];
  for (const rule of rules) results.push({ rule: rule.key, title: rule.title, gate: rule.gate, issues: await db.query(rule.sql) });
  out(flags, results, () => {
    console.log(heading('The rule book, run against the records'));
    for (const r of results) {
      console.log(`\n${r.rule}: ${r.issues.length ? `${r.issues.length} issue(s)` : 'PASS'}`);
      console.log(`  ${r.title}`);
      if (r.issues.length) console.log(table(r.issues, Object.keys(r.issues[0]).map((k) => ({ key: k, label: k, width: 44 }))));
      console.log(`  gate: ${r.gate}`);
    }
    console.log('\nSources and reasoning: docs/compliance.md. This is the operator\'s rule book, not legal advice.');
  });
}

async function cmdSettings(db, args, flags) {
  if ((args[0] || '').toLowerCase() === 'set') {
    const [, key, value] = args;
    const known = Object.keys(await settings(db));
    if (!known.includes(key)) throw new CliError(`Unknown setting "${key}". Settings: ${known.join(', ')}.`);
    if (!Number.isFinite(Number(value))) throw new CliError(`${key} takes a number.`);
    await db.query(`insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value`, [key, String(value)]);
  }
  const rows = await db.query(`select s.key, s.value, s.note from settings s order by key`);
  const effective = await settings(db);
  out(flags, effective, () => {
    console.log(heading('Settings'));
    console.log(table(Object.entries(effective).map(([key, value]) => ({ key, value, note: rows.find((r) => r.key === key)?.note || '(default)' })),
      [{ key: 'key', label: 'key' }, { key: 'value', label: 'value', align: 'right' }, { key: 'note', label: 'what it does' }]));
  });
}

async function cmdNote(db, sub, args, flags) {
  if (sub === 'add') {
    const [subject, ...rest] = args;
    const body = rest.join(' ').trim();
    if (!subject || !body) throw new CliError('note add SUBJECT "what happened" (SUBJECT is a person, venue or supplier)');
    const [row] = await db.query(`insert into file_notes (subject, body, author) values ($1, $2, $3) returning *`, [subject, body, str(flags.by) || null]);
    return out(flags, row, () => console.log(`Noted against ${subject}.`));
  }
  const q = args.join(' ').trim();
  const rows = await db.query(`select * from file_notes where ($1 = '' or subject ilike $2 or body ilike $2) order by created_at desc limit 50`, [q, `%${q}%`]);
  out(flags, rows, () => {
    console.log(heading('File notes'));
    for (const n of rows) console.log(`  ${isoDate(n.created_at)}  ${n.subject}  ${n.author ? `(${n.author}) ` : ''}${truncate(n.body, 100)}`);
    if (!rows.length) console.log('  (none)');
  });
}

// ---------------------------------------------------------------------------
// Moving in and out

async function cmdImport(db, args, flags) {
  if ((args[0] || '').toLowerCase() !== 'loaded') throw new CliError('import loaded --staff=FILE [--timesheets=FILE --items=FILE --sales=FILE] [--dry-run]');
  const dry = !!flags['dry-run'];
  const created = [];
  const updated = [];
  const skipped = [];
  const read = (f) => parseCsv(readFileSync(path.resolve(String(f)), 'utf8'));

  await db.exec('BEGIN');
  try {
    const venueCache = new Map();
    const venueId = async (name) => {
      const n = String(name || '').trim();
      if (!n) return null;
      if (venueCache.has(n.toLowerCase())) return venueCache.get(n.toLowerCase());
      let [v] = await db.query(`select id from venues where lower(name) = lower($1)`, [n]);
      if (!v) { [v] = await db.query(`insert into venues (name) values ($1) returning id`, [n]); created.push({ what: 'venue', name: n }); }
      venueCache.set(n.toLowerCase(), v.id);
      return v.id;
    };

    if (flags.staff) {
      for (const [i, r] of read(flags.staff).entries()) {
        const name = (pick(r, 'Name', 'Full Name', 'Employee', 'Staff Member') || `${pick(r, 'First Name', 'Firstname')} ${pick(r, 'Last Name', 'Surname', 'Lastname')}`).trim();
        if (!name) { skipped.push({ file: 'staff', row: i + 2, why: 'no name' }); continue; }
        const vals = [
          name, await venueId(pick(r, 'Venue', 'Location', 'Site', 'Home Venue')), pick(r, 'Role', 'Position', 'Job Title') || 'front_of_house',
          parseMoney(pick(r, 'Pay Rate', 'Hourly Rate', 'Rate', 'Base Rate')), pick(r, 'Mobile', 'Phone', 'Mobile Number') || null, pick(r, 'Email', 'Email Address') || null,
          pick(r, 'Employee ID', 'Staff ID', 'ID') ? `loaded:${pick(r, 'Employee ID', 'Staff ID', 'ID')}` : null,
        ];
        const [exist] = await db.query(`select id from staff where lower(name) = lower($1)`, [name]);
        if (exist) {
          await db.query(`update staff set name = $1, venue_id = coalesce($2, venue_id), role = $3, hourly_rate_cents = coalesce($4, hourly_rate_cents), phone = coalesce($5, phone), email = coalesce($6, email), external_ref = coalesce(external_ref, $7) where id = $8`, [...vals, exist.id]);
          updated.push({ what: 'staff', name });
        } else {
          // The paper does not come across: right to work and duty manager
          // certificates are verified on the way in, not assumed.
          await db.query(`insert into staff (name, venue_id, role, hourly_rate_cents, phone, email, external_ref) values ($1, $2, $3, $4, $5, $6, $7)`, vals);
          created.push({ what: 'staff', name });
        }
      }
    }

    if (flags.items) {
      for (const [i, r] of read(flags.items).entries()) {
        const name = pick(r, 'Name', 'Item', 'Stock Item', 'Item Name', 'Product').trim();
        if (!name) { skipped.push({ file: 'items', row: i + 2, why: 'no item name' }); continue; }
        let supplierId = null;
        const sup = pick(r, 'Supplier', 'Supplier Name', 'Vendor').trim();
        if (sup) {
          let [s] = await db.query(`select id from suppliers where lower(name) = lower($1)`, [sup]);
          if (!s) { [s] = await db.query(`insert into suppliers (name) values ($1) returning id`, [sup]); created.push({ what: 'supplier', name: sup }); }
          supplierId = s.id;
        }
        const catRaw = pick(r, 'Category', 'Type', 'Group').toLowerCase();
        const category = /bev|drink|wine|beer|spirit|coffee|bar/.test(catRaw) ? 'beverage' : /pack|clean|consum|dispos/.test(catRaw) ? 'consumable' : 'food';
        const unit = (pick(r, 'Unit', 'Unit of Measure', 'UOM', 'Base Unit') || 'ea').toLowerCase();
        const pack = Number(pick(r, 'Pack Size', 'Pack Qty', 'Units Per Pack')) || 1;
        const par = pick(r, 'Par', 'Par Level') ? Number(pick(r, 'Par', 'Par Level')) : null;
        const cost = parseMoney(pick(r, 'Unit Cost', 'Cost', 'Last Price', 'Last Cost', 'Price'));
        const [exist] = await db.query(`select id from items where lower(name) = lower($1)`, [name]);
        let id;
        if (exist) {
          await db.query(`update items set category = $2, unit = $3, supplier_id = coalesce($4, supplier_id), pack_size = $5, par_qty = coalesce($6, par_qty) where id = $1`, [exist.id, category, unit, supplierId, pack, par]);
          id = exist.id;
          updated.push({ what: 'item', name });
        } else {
          [{ id }] = await db.query(`insert into items (name, category, unit, supplier_id, pack_size, par_qty) values ($1, $2, $3, $4, $5, $6) returning id`, [name, category, unit, supplierId, pack, par]);
          created.push({ what: 'item', name });
        }
        if (cost !== null) {
          const [cur] = await db.query(`select unit_cost_cents from v_item_cost where item_id = $1`, [id]);
          if (cur?.unit_cost_cents == null || Number(cur.unit_cost_cents) !== cost) await db.query(`insert into item_prices (item_id, unit_cost_cents, effective_on, source) values ($1, $2, current_date, 'import')`, [id, cost]);
        }
      }
    }

    if (flags.timesheets) {
      for (const [i, r] of read(flags.timesheets).entries()) {
        const name = (pick(r, 'Employee', 'Name', 'Staff', 'Staff Member') || `${pick(r, 'First Name')} ${pick(r, 'Last Name')}`).trim();
        let day;
        let inAt;
        let outAt;
        try {
          day = parseDate(pick(r, 'Date', 'Shift Date', 'Work Date'), 'date');
          inAt = parseTime(pick(r, 'Start', 'Clock In', 'Start Time', 'In'), 'start');
          outAt = parseTime(pick(r, 'End', 'Clock Out', 'End Time', 'Out'), 'end');
        } catch (e) { skipped.push({ file: 'timesheets', row: i + 2, why: e.message }); continue; }
        if (!day) { skipped.push({ file: 'timesheets', row: i + 2, why: 'missing date' }); continue; }
        if (!inAt || !outAt) { skipped.push({ file: 'timesheets', row: i + 2, why: 'missing start or end time' }); continue; }
        const [st] = await db.query(`select id from staff where lower(name) = lower($1)`, [name]);
        if (!st) { skipped.push({ file: 'timesheets', row: i + 2, why: `no staff member "${name}" (import staff first)` }); continue; }
        const brRaw = pick(r, 'Break', 'Break (mins)', 'Break Minutes', 'Unpaid Break', 'Meal Break');
        const brNum = Number(brRaw || 0);
        const brk = brNum > 0 && brNum < 5 ? Math.round(brNum * 60) : Math.round(brNum); // hours or minutes
        const ext = `loaded:${name.toLowerCase()}:${day}:${inAt}`;
        const outDay = outAt <= inAt ? addDays(day, 1) : day;
        const vid = await venueId(pick(r, 'Venue', 'Location', 'Site'));
        const [exist] = await db.query(`select id from timesheets where external_ref = $1`, [ext]);
        if (exist) {
          await db.query(`update timesheets set clock_out_at = ($2::date + $3::time), break_minutes = $4, venue_id = coalesce($5, venue_id) where id = $1`, [exist.id, outDay, outAt, brk, vid]);
          updated.push({ what: 'timesheet', name, date: day });
        } else {
          const ref = await mintRef(db, 'timesheets', 'TS', 5001);
          await db.query(
            `insert into timesheets (ref, staff_id, venue_id, on_date, clock_in_at, clock_out_at, break_minutes, status, external_ref)
             values ($1, $2, $3, $4, ($4::date + $5::time), ($6::date + $7::time), $8, 'submitted', $9)`,
            [ref, st.id, vid, day, inAt, outDay, outAt, brk, ext],
          );
          created.push({ what: 'timesheet', name, date: day });
        }
      }
    }

    if (flags.sales) {
      for (const [i, r] of read(flags.sales).entries()) {
        let day;
        try { day = parseDate(pick(r, 'Date', 'Trading Date', 'Day'), 'date'); } catch (e) { skipped.push({ file: 'sales', row: i + 2, why: e.message }); continue; }
        if (!day) { skipped.push({ file: 'sales', row: i + 2, why: 'missing date' }); continue; }
        const vid = await venueId(pick(r, 'Venue', 'Location', 'Site'));
        if (!vid) { skipped.push({ file: 'sales', row: i + 2, why: 'missing venue' }); continue; }
        const food = parseMoney(pick(r, 'Food', 'Food Sales', 'Food Revenue')) ?? 0;
        const bev = parseMoney(pick(r, 'Beverage', 'Beverage Sales', 'Drinks', 'Bar', 'Beverage Revenue')) ?? 0;
        let other = parseMoney(pick(r, 'Other', 'Other Sales')) ?? 0;
        const total = parseMoney(pick(r, 'Total', 'Net Sales', 'Sales', 'Revenue'));
        if (!food && !bev && !other && total) other = total;
        const covers = pick(r, 'Covers', 'Guests', 'Customers') ? Math.round(Number(pick(r, 'Covers', 'Guests', 'Customers'))) : null;
        const [exist] = await db.query(`select id from daily_sales where venue_id = $1 and on_date = $2`, [vid, day]);
        await db.query(
          `insert into daily_sales (venue_id, on_date, food_cents, beverage_cents, other_cents, covers, source) values ($1, $2, $3, $4, $5, $6, 'import')
           on conflict (venue_id, on_date) do update set food_cents = excluded.food_cents, beverage_cents = excluded.beverage_cents, other_cents = excluded.other_cents, covers = coalesce(excluded.covers, daily_sales.covers)`,
          [vid, day, food, bev, other, covers],
        );
        (exist ? updated : created).push({ what: 'sales', date: day });
      }
    }
    await db.exec(dry ? 'ROLLBACK' : 'COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
  out(flags, { dry_run: dry, created, updated, skipped }, () => {
    console.log(`${dry ? 'Dry run: nothing written. Would create' : 'Created'} ${created.length}, ${dry ? 'update' : 'updated'} ${updated.length}, skipped ${skipped.length}.`);
    for (const s of skipped) console.log(`  skipped ${s.file} row ${s.row}: ${s.why}`);
    if (created.some((c) => c.what === 'staff')) console.log('\n  New staff arrive with no right to work or duty manager certificate on record. Walk the team: staff visa NAME --expires=, staff cert NAME --expires=.');
  });
}

async function cmdExport(db, flags) {
  const dir = path.resolve(str(flags.out) || path.join(REPO_ROOT, 'export'));
  mkdirSync(dir, { recursive: true });
  const csv = (rows) => {
    if (!rows.length) return '';
    const cols = Object.keys(rows[0]);
    const esc = (v) => {
      const s = v === null || v === undefined ? '' : v instanceof Date ? isoDate(v) : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  };
  const files = {
    'staff.csv': await db.query(`select name, home_venue, role, employment, hourly_rate_cents, phone, email, visa_expires_on, duty_manager_cert_no, duty_manager_cert_expires_on, status from v_staff order by name`),
    'timesheets.csv': await db.query(`select ref, on_date, staff, venue, clock_in_at, clock_out_at, break_minutes, worked_minutes, status from v_timesheets order by on_date, staff`),
    'daily-sales.csv': await db.query(`select on_date, venue, food_cents, beverage_cents, sales_cents, covers, wage_cents, wage_pct from v_daily order by on_date, venue`),
    'invoices.csv': await db.query(`select i.ref, i.invoice_date, i.venue, i.supplier, i.supplier_invoice_no, coalesce(c.name, l.description) as item, l.qty, l.unit_cost_cents, i.status
                                    from v_invoices i join invoice_lines l on l.invoice_id = i.invoice_id left join items c on c.id = l.item_id order by i.invoice_date, i.ref`),
    'items.csv': await db.query(`select name, category, unit, supplier, pack_size, pack_label, par_qty, unit_cost_cents, cost_since from v_item_cost order by name`),
    'recipes.csv': await db.query(`select name, category, menu_price_cents, plate_cost_cents, cost_pct, margin_cents, state from v_recipe_cost order by name`),
  };
  const written = [];
  for (const [name, rows] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), csv(rows) + '\n');
    written.push({ file: name, rows: rows.length });
  }
  out(flags, { dir, written }, () => {
    console.log(`Exported to ${dir}:`);
    for (const w of written) console.log(`  ${w.file}  ${w.rows} row(s)`);
    console.log('\ntimesheets.csv is the payroll handoff (approved rows carry the hours); invoices.csv feeds the accounts. Your data, plain CSV, no export fee.');
  });
}

async function cmdStats(db, flags) {
  const [row] = await db.query(`
    select
      (select count(*) from venues where status = 'active') as venues,
      (select count(*) from staff where status = 'active') as active_staff,
      (select coalesce(sum(sales_cents), 0) from v_daily where on_date >= current_date - 7 and on_date < current_date) as sales_7d_cents,
      (select coalesce(sum(wage_cents), 0) from v_daily where on_date >= current_date - 7 and on_date < current_date) as wages_7d_cents,
      (select count(*) from shifts where status = 'published' and on_date >= current_date) as published_ahead,
      (select count(*) from v_open_shifts) as open_shifts,
      (select count(*) from v_timesheets where status = 'submitted') as awaiting_approval,
      (select count(*) from v_timesheets where state = 'NOT CLOCKED OUT') as not_clocked_out,
      (select count(*) from v_cashups where state = 'UNEXPLAINED' and on_date >= current_date - 14) as cashups_unexplained,
      (select count(*) from v_missing_cashups) as cashups_missing,
      (select count(*) from v_invoices where state in ('DIFFERS FROM ORDER', 'NO INVOICE NUMBER', 'DISPUTED', 'OVERDUE')) as invoice_issues,
      (select count(*) from v_stock_on_hand where below_par) as below_par,
      (select count(*) from v_recipe_cost where status = 'active' and state <> 'ok') as recipes_off,
      (select count(*) from items where status = 'active') as items,
      (select count(*) from v_attention) as attention_items
  `);
  const data = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
  data.wage_7d_pct = data.sales_7d_cents ? Math.round((data.wages_7d_cents * 1000) / data.sales_7d_cents) / 10 : null;
  out(flags, data, () => {
    console.log(heading('The whole group, in numbers'));
    console.log(`  venues         ${data.venues} venue(s), ${data.active_staff} active staff`);
    console.log(`  last 7 days    ${money(data.sales_7d_cents)} sales ex GST, ${money(data.wages_7d_cents)} wages (${data.wage_7d_pct ?? '-'}%)`);
    console.log(`  roster         ${data.published_ahead} published shift(s) ahead, ${data.open_shifts} open`);
    console.log(`  timesheets     ${data.awaiting_approval} awaiting approval, ${data.not_clocked_out} never clocked out`);
    console.log(`  cash           ${data.cashups_unexplained} unexplained cash-up(s), ${data.cashups_missing} missing`);
    console.log(`  suppliers      ${data.invoice_issues} invoice(s) need a look, ${data.below_par} item(s) under par`);
    console.log(`  menu           ${data.recipes_off} recipe(s) off target or uncostable, ${data.items} stock items`);
    console.log(`  attention      ${data.attention_items} item(s): run attention`);
  });
}

// ---------------------------------------------------------------------------
// Help

function help() {
  console.log(`hospitality-back-office-for-claude-code: the back office as a database and a CLI.

  the numbers
    today [--date=]              yesterday by venue: sales, covers, wages, wage %, cash-up
    margins [--weeks=4 --venue=] wages, purchases and prime cost by venue and week
    cogs                         the real cost of goods, count to count
    sales [--days=14 --venue=]   sales add VENUE --date= --food= --bev= [--other= --covers=]
    cashups [--days=14]          cashup add VENUE --pos-cash= --counted= [--pos-card= --settled= --by= --explain=]
                                 cashup explain VENUE DATE --why=

  the roster and time
    roster [--week=next|this|DATE --venue= --all]    open
    shift add VENUE --date= --start= --end= [--staff= --break=30 --role= --publish]
    shift assign REF NAME        shift unassign REF       shift cancel REF --reason=
    publish [--week=next]        drafts become the roster, gates checked
    clock in NAME [--venue= --at=]                    clock out NAME [--at= --break=]
    timesheets [--pending --week= --all]              approve REF | approve --all

  the people and venues
    team [--all]                 person NAME
    staff add NAME --role= [--venue= --rate= --employment= --visa-expires= --cert= --cert-expires=]
    staff rate NAME --rate=      staff visa NAME --expires=      staff cert NAME --number= --expires=      staff former NAME
    venues                       venue add NAME [--address= --licensed]      venue licensed NAME [--off]

  stock and suppliers
    suppliers                    supplier add NAME [--email= --order-days=]
    items [--category=]          item add NAME --unit= [--category= --supplier= --pack= --par= --cost=]
    item cost NAME --cost=       item par NAME --par=
    price-watch [--days=60]      cost moves and the recipes they hit
    stock [--venue= --below]     on hand against par
    counts                       count start VENUE | count set REF ITEM QTY | count set REF --lines="Item=qty;..." | count close REF
    waste [--days=14]            waste add VENUE ITEM QTY [--reason= --by=]
    orders [--all]               order suggest VENUE [--supplier=] | order draft VENUE SUPPLIER [--lines=] | order show|sent|cancel REF
    invoices [--open --all]      invoice add VENUE SUPPLIER --no= --date= --lines="Item:qty@cost;..." [--order= --terms=20]
                                 invoice show|paid REF       invoice dispute REF --why=

  the menu
    recipes [--all]              recipe show NAME     recipe add NAME --price= --category=     recipe line NAME ITEM QTY
    menu                         recipe price NAME --price=

  the rules
    attention                    everything that wants a decision, worst first
    compliance [RULE]            the rule book, run against the records
    settings [set KEY VALUE]     the numbers the rules read

  notes, moving in and out
    note add SUBJECT TEXT        notes [TEXT]
    import loaded --staff= [--timesheets= --items= --sales=] [--dry-run]
    export [--out=DIR]           stats

Any read command takes --json. Money in NZD ex GST (menu prices GST inclusive); rates for costing only, payroll pays people.`);
}

// ---------------------------------------------------------------------------
// Main

const { args: argv, flags } = parseArgv(process.argv.slice(2));
const [cmd, ...rest] = argv;
const sub = (rest[0] || '').toLowerCase();

const db = await getDb();
try {
  switch ((cmd || 'help').toLowerCase()) {
    case 'help': help(); break;
    case 'today': await cmdToday(db, flags); break;
    case 'margins': await cmdMargins(db, flags); break;
    case 'cogs': await cmdCogs(db, flags); break;
    case 'sales': await cmdSales(db, sub === 'add' ? rest.slice(1) : rest, flags, sub === 'add' ? 'add' : 'list'); break;
    case 'cashup': case 'cashups':
      await cmdCashup(db, ['add', 'explain'].includes(sub) ? rest.slice(1) : rest, flags, ['add', 'explain'].includes(sub) ? sub : 'list'); break;
    case 'roster': await cmdRoster(db, flags); break;
    case 'shift':
      if (sub === 'add') await cmdShiftAdd(db, rest.slice(1), flags);
      else if (sub === 'assign') await cmdShiftAssign(db, rest.slice(1), flags);
      else if (sub === 'unassign') await cmdShiftUnassign(db, rest.slice(1), flags);
      else if (sub === 'cancel') await cmdShiftCancel(db, rest.slice(1), flags);
      else throw new CliError('shift add|assign|unassign|cancel');
      break;
    case 'publish': await cmdPublish(db, flags); break;
    case 'open': await cmdOpen(db, flags); break;
    case 'team': await cmdTeam(db, flags); break;
    case 'person': await cmdPerson(db, rest, flags); break;
    case 'staff':
      if (sub === 'add') await cmdStaffAdd(db, rest.slice(1), flags);
      else await cmdStaffSet(db, sub, rest.slice(1), flags);
      break;
    case 'venue': case 'venues': await cmdVenues(db, ['add', 'licensed'].includes(sub) ? rest.slice(1) : rest, flags, ['add', 'licensed'].includes(sub) ? sub : 'list'); break;
    case 'clock': await cmdClock(db, sub, rest.slice(1), flags); break;
    case 'timesheets': await cmdTimesheets(db, flags); break;
    case 'approve': await cmdApprove(db, rest, flags); break;
    case 'supplier': case 'suppliers': await cmdSuppliers(db, sub === 'add' ? rest.slice(1) : rest, flags, sub === 'add' ? 'add' : 'list'); break;
    case 'item': case 'items':
      await cmdItems(db, ['add', 'cost', 'par'].includes(sub) ? rest.slice(1) : rest, flags, ['add', 'cost', 'par'].includes(sub) ? sub : 'list'); break;
    case 'price-watch': await cmdPriceWatch(db, flags); break;
    case 'stock': await cmdStock(db, flags); break;
    case 'count': case 'counts': await cmdCount(db, ['start', 'set', 'close'].includes(sub) ? sub : 'list', rest.slice(1), flags); break;
    case 'waste': await cmdWaste(db, sub === 'add' ? rest.slice(1) : rest, flags, sub === 'add' ? 'add' : 'list'); break;
    case 'order': case 'orders': await cmdOrder(db, ['suggest', 'draft', 'sent', 'cancel', 'show'].includes(sub) ? sub : 'list', rest.slice(1), flags); break;
    case 'invoice': case 'invoices': await cmdInvoice(db, ['add', 'paid', 'dispute', 'show'].includes(sub) ? sub : 'list', rest.slice(1), flags); break;
    case 'recipe': case 'recipes':
      if (['add', 'line', 'price', 'show'].includes(sub)) await cmdRecipes(db, rest.slice(1), flags, sub);
      else if (rest.length) await cmdRecipes(db, rest, flags, 'show');
      else await cmdRecipes(db, rest, flags, 'list');
      break;
    case 'menu': await cmdMenu(db, flags); break;
    case 'attention': await cmdAttention(db, flags); break;
    case 'compliance': await cmdCompliance(db, rest, flags); break;
    case 'settings': await cmdSettings(db, rest, flags); break;
    case 'note': await cmdNote(db, sub, rest.slice(1), flags); break;
    case 'notes': await cmdNote(db, 'list', rest, flags); break;
    case 'import': await cmdImport(db, rest, flags); break;
    case 'export': await cmdExport(db, flags); break;
    case 'stats': await cmdStats(db, flags); break;
    default:
      throw new CliError(`Unknown command "${cmd}". Run with no arguments for the list.`);
  }
} catch (e) {
  if (e instanceof CliError) {
    console.error(e.message);
    process.exitCode = e.code;
  } else {
    throw e;
  }
} finally {
  await db.close();
}
