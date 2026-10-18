#!/usr/bin/env node
// End-to-end smoke test on a throwaway embedded database.
// Runs migrate, seed, then every CLI command that matters, and asserts on the JSON.
// Passes on Windows and Linux. No network, no Postgres install.
//
// The seed is relative to current_date (the roster ahead anchors to next
// Monday, the trailing windows are seven days), so every assertion here holds
// whatever day you run it.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'backoffice-smoke-'));
const scratch = mkdtempSync(path.join(tmpdir(), 'backoffice-smoke-files-'));
const env = { ...process.env, DATA_DIR: dataDir };
delete env.DATABASE_URL; // the smoke test always runs embedded

let step = 0;
function run(label, args, { json = true, expectFail = false } = {}) {
  step++;
  const argv = [path.join(root, 'scripts', args[0]), ...args.slice(1), ...(json && !expectFail ? ['--json'] : [])];
  const res = spawnSync(process.execPath, argv, { cwd: root, env, encoding: 'utf8' });
  const ok = expectFail ? res.status !== 0 : res.status === 0;
  if (!ok) {
    console.error(`\nFAIL step ${step} (${label}): exit ${res.status}\n--- stdout\n${res.stdout}\n--- stderr\n${res.stderr}`);
    process.exit(1);
  }
  console.log(`  ok  ${String(step).padStart(2)}  ${label}`);
  if (!json || expectFail) return { stdout: res.stdout, stderr: res.stderr };
  try {
    return JSON.parse(res.stdout);
  } catch {
    console.error(`\nFAIL step ${step} (${label}): output is not JSON\n${res.stdout}\n${res.stderr}`);
    process.exit(1);
  }
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`\nFAIL assertion: ${msg}`);
    process.exit(1);
  }
}

const n = (v) => Number(v ?? 0);
const V = (...a) => ['venue.mjs', ...a];
const KB = 'Tidewater Kitchen and Bar';

console.log(`smoke: data dir ${dataDir}`);
try {
  run('migrate', ['migrate.mjs'], { json: false });
  run('migrate again (idempotent)', ['migrate.mjs'], { json: false });
  run('seed', ['seed.mjs'], { json: false });
  run('seed again (idempotent)', ['seed.mjs'], { json: false });
  run('help', V('help'), { json: false });

  // ---- the numbers -----------------------------------------------------------

  const stats = run('stats', V('stats'));
  assert(stats.venues === 2, `two venues (${stats.venues})`);
  assert(stats.active_staff === 10, `ten active staff (${stats.active_staff})`);
  assert(stats.open_shifts === 1, `one open shift (${stats.open_shifts})`);
  assert(stats.not_clocked_out === 1, `one sheet never clocked out (${stats.not_clocked_out})`);
  assert(stats.cashups_unexplained === 1 && stats.cashups_missing === 1, `one short cash-up, one missing (${stats.cashups_unexplained}, ${stats.cashups_missing})`);
  assert(stats.invoice_issues === 3, `three invoices need a look (${stats.invoice_issues})`);
  assert(stats.below_par === 3, `three items under par (${stats.below_par})`);
  assert(stats.recipes_off === 2, `two recipes off (${stats.recipes_off})`);

  const attention = run('attention', V('attention'));
  assert(attention[0].rank === 1 && attention[0].reason === 'NO WORK RIGHTS' && attention[0].who === 'Lucas Meyer', `a right-to-work breach leads (${JSON.stringify(attention[0])})`);
  const reasons = attention.map((a) => a.reason);
  for (const r of ['NO DUTY MANAGER', 'CASH-UP UNEXPLAINED', 'NO CASH-UP', 'NOT CLOCKED OUT', 'REST CLASH', 'WAGES HIGH', 'COST OF GOODS HIGH',
    'DIFFERS FROM ORDER', 'NO INVOICE NUMBER', 'OVERDUE', 'PRICE JUMP', 'RECIPE OVER TARGET', 'RECIPE MISSING COST', 'BELOW PAR', 'OPEN SHIFT',
    'DRAFT LATE', 'BREAK SHORT', 'COUNT STALE', 'COUNT LEFT OPEN', 'CERT EXPIRING', 'VISA EXPIRING']) {
    assert(reasons.includes(r), `attention names ${r}`);
  }
  const wagesHigh = attention.filter((a) => a.reason === 'WAGES HIGH');
  assert(wagesHigh.length === 1 && wagesHigh[0].place === 'Tidewater Cafe', `only the Cafe's wages are high (${JSON.stringify(wagesHigh)})`);

  const today = run('today (yesterday by venue)', V('today'));
  assert(today.venues.length === 2, `both venues traded yesterday (${today.venues.length})`);
  assert(today.venues.find((v) => v.venue === 'Tidewater Cafe').cashup === null, 'the Cafe has no cash-up for yesterday');
  assert(n(today.venues.find((v) => v.venue === 'Tidewater Cafe').vs_last_week_pct) === -25, 'the Cafe is down a quarter on last week');

  const margins = run('margins', V('margins'));
  const food = margins.cost_of_goods.find((c) => c.venue === KB && c.category === 'food');
  const bev = margins.cost_of_goods.find((c) => c.venue === KB && c.category === 'beverage');
  assert(n(food.cogs_pct) === 36.3, `food cost 36.3% between counts (${food.cogs_pct})`);
  assert(n(bev.cogs_pct) === 22.9, `beverage cost 22.9% (${bev.cogs_pct})`);
  assert(n(food.cogs_cents) === 536150, `food used $5,361.50 (${food.cogs_cents})`);
  assert(margins.weeks.length >= 6, `weekly rows for both venues (${margins.weeks.length})`);

  const cogs = run('cogs', V('cogs'));
  assert(cogs.length === 2, `one count-to-count period, two categories (${cogs.length})`);

  const sales = run('sales', V('sales', '--days=7'));
  assert(sales.length >= 12, `a week of sales rows (${sales.length})`);

  const cashups = run('cashups', V('cashups'));
  const short = cashups.cashups.find((c) => c.state === 'UNEXPLAINED');
  assert(short && n(short.cash_variance_cents) === -8500, `the $85 short cash-up (${JSON.stringify(short)})`);
  assert(cashups.missing.length === 1, `one missing cash-up (${cashups.missing.length})`);

  // ---- menu and costs ----------------------------------------------------------

  const recipes = run('recipes', V('recipes'));
  const scotch = recipes.find((r) => r.name === 'Scotch fillet 300g');
  assert(scotch.state === 'OVER TARGET' && n(scotch.cost_pct) === 33.9, `scotch fillet over target at 33.9% (${scotch.state} ${scotch.cost_pct})`);
  assert(recipes.find((r) => r.name === 'Truffle fries').state === 'MISSING COST', 'truffle fries cannot be costed');

  const card = run('recipe show', V('recipe', 'show', 'scotch'));
  assert(card.lines.length === 5 && n(card.price_for_target_cents) === 6100, `five lines, $61 brings it to target (${card.price_for_target_cents})`);

  const watch = run('price-watch', V('price-watch'));
  assert(watch.moves.length === 1 && n(watch.moves[0].change_pct) === 18.2, `scotch fillet +18.2% (${JSON.stringify(watch.moves.map((m) => m.change_pct))})`);
  assert(watch.recipes_affected.some((r) => r.recipe === 'Scotch fillet 300g'), 'and it names the dish it hits');

  const repriced = run('recipe price', V('recipe', 'price', 'scotch', '--price=61'));
  assert(repriced.state === 'ok', `at $61 the dish is back on target (${repriced.state} ${repriced.cost_pct})`);

  const menu = run('menu', V('menu'));
  assert(menu[0].name === 'Scotch fillet 300g', `the steak earns the most a plate (${menu[0].name})`);

  run('recipe add', V('recipe', 'add', 'Truffle', 'arancini', '--price=18', '--category=food'), { expectFail: false });
  const line = run('recipe line', V('recipe', 'line', 'Truffle arancini', 'parmesan', '0.03'));
  assert(line.lines === 1 && line.state === 'ok', `costed from one line (${line.state})`);

  run('item cost', V('item', 'cost', 'truffle', 'oil', '--cost=120'));
  const truffle = run('recipe show truffle fries', V('recipe', 'show', 'Truffle fries'));
  assert(truffle.state === 'ok', `a cost on record fixes the margin (${truffle.state})`);

  const items = run('items', V('items'));
  assert(items.length === 22, `22 stock items (${items.length})`);

  // ---- stock, orders, invoices -------------------------------------------------

  const below = run('stock --below', V('stock', '--below'));
  assert(below.length === 3 && below.every((b) => b.venue === KB), `three items under par at the Kitchen and Bar (${below.length})`);

  const suggest = run('order suggest', V('order', 'suggest', 'kitchen'));
  assert(suggest.lines.length === 3, `three par lines (${suggest.lines.length})`);
  const cod = suggest.lines.find((l) => l.item === 'Blue cod fillet');
  assert(cod.packs === 2 && cod.qty === 4, `cod: 2 trays, 4kg (${JSON.stringify(cod)})`);

  const po = run('order draft from par', V('order', 'draft', 'kitchen', 'Bay City Meats'));
  assert(po.status === 'draft' && po.lines.length === 1 && po.lines[0].item === 'Streaky bacon' && po.lines[0].qty === 2, `a draft for 2kg of bacon (${JSON.stringify(po.lines)})`);
  run('order draft refuses an empty order', V('order', 'draft', 'cafe', 'Vintners Direct'), { expectFail: true });
  run('order sent', V('order', 'sent', po.ref));

  const inv = run('invoice add against the order', V('invoice', 'add', 'kitchen', 'Bay City Meats', '--no=BCM-31001', '--lines=bacon:2@19.90', `--order=${po.ref}`));
  assert(inv.cost_moves.length === 1 && inv.cost_moves[0].now_cents === 1990, `bacon's cost moves to $19.90 (${JSON.stringify(inv.cost_moves)})`);
  assert(inv.state === 'DIFFERS FROM ORDER' && n(inv.vs_order_cents) === 200, `a dollar a kilo over the order price is caught (${inv.state} ${inv.vs_order_cents})`);
  const bacon = run('the item carries the new cost', V('items')).find((i) => i.name === 'Streaky bacon');
  assert(n(bacon.unit_cost_cents) === 1990, `bacon costs $19.90 now (${bacon.unit_cost_cents})`);

  const noNumber = run('invoice add with no number', V('invoice', 'add', 'kitchen', 'Harbour Fresh', '--lines=Tomatoes:10@6.50'));
  assert(noNumber.state === 'NO INVOICE NUMBER', `loud without a number (${noNumber.state})`);
  run('invoice add refuses a bad line', V('invoice', 'add', 'kitchen', 'Harbour Fresh', '--lines=Tomatoes ten'), { expectFail: true });
  run('invoice dispute needs a reason', V('invoice', 'dispute', 'INV-1017'), { expectFail: true });
  run('invoice dispute', V('invoice', 'dispute', 'INV-1017', '--why=Short delivered: ordered 50kg fries'));

  const shown = run('invoice show', V('invoice', 'show', 'INV-1017'));
  const fries = shown.lines.find((l) => l.item === 'Frozen fries');
  assert(n(fries.qty) === 75 && n(fries.ordered_qty) === 50, `75kg invoiced against 50kg ordered (${JSON.stringify(fries)})`);

  run('invoice paid', V('invoice', 'paid', 'INV-1011'));
  const open = run('invoices --open', V('invoices', '--open'));
  assert(open.some((i) => i.state === 'DISPUTED') && !open.some((i) => i.ref === 'INV-1011'), 'disputed shows, paid drops off');
  const okInv = run('invoice add at the ordered price', V('invoice', 'add', 'cafe', 'Kahu Coffee', '--no=KAHU-2250', '--lines=Coffee beans:10@38.00', '--order=PO-1003'));
  assert(okInv.state === 'matches order' && okInv.cost_moves.length === 0, `matches, no cost move (${okInv.state})`);

  const orders = run('orders', V('orders', '--all'));
  assert(orders.find((o) => o.ref === 'PO-1003').state === 'received', 'the coffee order is received');
  assert(orders.find((o) => o.ref === po.ref).status === 'received', 'the invoiced order is received');

  const waste = run('waste add', V('waste', 'add', 'kitchen', 'scotch', 'fillet', '0.5', '--reason=dropped'));
  assert(waste.cost_cents === 2275, `half a kilo at $45.50 (${waste.cost_cents})`);
  const wasteList = run('waste', V('waste'));
  assert(wasteList.length === 5, `five waste rows (${wasteList.length})`);

  // A count closes only when everything on the last count is counted again.
  const sc = run('count start', V('count', 'start', 'kitchen'));
  run('count start refuses a second open count', V('count', 'start', 'kitchen'), { expectFail: true });
  run('count set one line', V('count', 'set', sc.ref, 'Scotch', 'fillet', '12'));
  const half = run('count close refuses a half count', V('count', 'close', sc.ref), { expectFail: true });
  assert(/missing 19 item/.test(half.stderr), `names what is missing (${half.stderr.trim().slice(0, 120)})`);
  const lines = 'Beef mince=10;Streaky bacon=4;Blue cod fillet=5;Frozen fries=60;Brioche buns=100;Batter mix=5;Canola oil=12;Cos lettuce=30;Tomatoes=8;Lemons=60;Parmesan=1;Free-range eggs=40;Butter=2.5;Sourdough loaf=4;Aioli=1.5;Pinot gris=24;Craft lager 330ml=96;Milk=8;Coffee beans=1.5';
  run('count set the rest', V('count', 'set', sc.ref, `--lines=${lines}`));
  const closed = run('count close', V('count', 'close', sc.ref));
  assert(closed.lines === 20 && closed.cost_of_goods.length === 2, `closed with a new cost of goods period (${closed.lines}, ${closed.cost_of_goods.length})`);
  run('a closed count stays closed', V('count', 'set', sc.ref, 'Milk', '9'), { expectFail: true });
  const counts = run('counts', V('counts'));
  assert(counts.length === 5, `five counts (${counts.length})`);

  // ---- the roster and time -----------------------------------------------------

  const roster = run('roster next week', V('roster'));
  assert(roster.length === 45, `45 shifts next week (${roster.length})`);
  assert(roster.filter((s) => s.state === 'NO WORK RIGHTS').length === 2, 'two shifts past a right to work');

  const lucasShift = roster.find((s) => s.staff === 'Lucas Meyer');
  const refusedVisa = run('the right-to-work gate', V('shift', 'add', 'kitchen', `--date=${lucasShift.on_date}`, '--start=10:00', '--end=14:00', '--staff=lucas'), { expectFail: true });
  assert(/Immigration Act 2009 s 350/.test(refusedVisa.stderr), 'cites the Act');

  const open1 = roster.find((s) => s.state === 'OPEN');
  run('the overlap gate', V('shift', 'assign', open1.ref, 'Priya'), { expectFail: true });
  run('shift assign', V('shift', 'assign', open1.ref, 'Emma'));

  const meiTue = roster.find((s) => s.staff === 'Mei Chen' && new Date(`${s.on_date}T00:00:00`).getDay() === 2);
  const wed = new Date(`${meiTue.on_date}T00:00:00`); wed.setDate(wed.getDate() + 1);
  const wedIso = `${wed.getFullYear()}-${String(wed.getMonth() + 1).padStart(2, '0')}-${String(wed.getDate()).padStart(2, '0')}`;
  const rest = run('the rest-window gate', V('shift', 'add', 'kitchen', `--date=${wedIso}`, '--start=05:00', '--end=09:00', '--staff=Mei'), { expectFail: true });
  assert(/rest window/.test(rest.stderr), 'names the rest window');
  const added = run('shift add', V('shift', 'add', 'kitchen', `--date=${wedIso}`, '--start=10:00', '--end=14:00', '--staff=Tom'));
  assert(added.status === 'draft', 'a new shift starts as draft');
  run('shift cancel needs a reason', V('shift', 'cancel', added.ref), { expectFail: true });
  run('shift cancel', V('shift', 'cancel', added.ref, '--reason=Function cancelled'));

  const pub = run('publish next week', V('publish'));
  assert(pub.published.length === 2 && pub.refused.length === 0, `the two Monday drafts publish (${pub.published.length}, ${pub.refused.length})`);

  run('clock in refuses someone already in', V('clock', 'in', 'Emma'), { expectFail: true });
  const out = run('clock out the forgotten sheet', V('clock', 'out', 'Emma', '--at=14:30', '--break=30'));
  assert(out.worked_minutes === 450 && out.status === 'submitted', `7.5h worked (${out.worked_minutes})`);
  const tom = run('clock in', V('clock', 'in', 'Tom', '--venue=kitchen', '--at=09:00'));
  const refusedOpen = run('approve an open sheet', V('approve', tom.ref));
  assert(refusedOpen.refused.length === 1 && /still open/.test(refusedOpen.refused[0].why), 'an open sheet is not approved');
  const approvedShort = run('approve the short-break sheet', V('approve', 'TS-1002'));
  assert(approvedShort.approved[0].break_short === true, 'approval says the short break out loud');
  const all = run('approve --all', V('approve', '--all'));
  assert(all.approved.length > 10, `the queue clears (${all.approved.length})`);
  const pending = run('timesheets --pending', V('timesheets', '--pending'));
  assert(pending.every((t) => t.status === 'open'), 'only the open sheet is left');

  const team = run('team', V('team'));
  assert(team.find((s) => s.name === 'Lucas Meyer').paper === 'NO WORK RIGHTS', 'the team shows the paper');
  const person = run('person', V('person', 'priya'));
  assert(person.paper === 'VISA EXPIRING' && person.shifts.length === 5, `Priya's card (${person.paper}, ${person.shifts.length})`);
  run('an ambiguous name lists and exits 1', V('person', 'a'), { expectFail: true });
  run('staff visa', V('staff', 'visa', 'Lucas', '--expires=2027-06-30'));
  const cleared = run('the breach clears', V('attention'));
  assert(!cleared.some((a) => a.reason === 'NO WORK RIGHTS'), 'no right-to-work items left');
  run('staff add', V('staff', 'add', 'Ari', 'Bell', '--role=barista', '--venue=cafe', '--rate=25'));
  run('staff cert', V('staff', 'cert', 'Mei', '--number=GMC-0999', '--expires=2027-12-31'));
  const duty = run('duty manager cover now holds', V('compliance', 'duty-manager'));
  assert(duty[0].issues.length === 0, 'Mei covers Saturday');

  // ---- cash, sales, rules, settings, notes ---------------------------------------

  run('cashup add', V('cashup', 'add', 'cafe', '--date=yesterday', '--pos-cash=95.20', '--counted=95.20', '--pos-card=1630.80', '--settled=1630.80', '--by=Emma'));
  run('cashup explain', V('cashup', 'explain', 'kitchen', short.on_date, '--why=Refund paid in cash, docket in the safe'));
  const cash2 = run('cash is clean', V('cashups'));
  assert(cash2.missing.length === 0 && !cash2.cashups.some((c) => c.state === 'UNEXPLAINED'), 'no missing or unexplained cash-ups');

  run('sales add', V('sales', 'add', 'cafe', '--date=today', '--food=520', '--bev=410', '--covers=51'));
  run('sales add refuses an empty day', V('sales', 'add', 'cafe', '--date=today'), { expectFail: true });

  const compliance = run('compliance', V('compliance'));
  assert(compliance.length === 6, `six rules (${compliance.length})`);
  assert(compliance.find((r) => r.rule === 'gst-records').issues.length === 2, 'two invoices without a number');
  run('unknown rule', V('compliance', 'nonsense'), { expectFail: true });

  run('settings set', V('settings', 'set', 'wage_target_pct', '45'));
  const relaxed = run('the threshold moves the list', V('attention'));
  assert(!relaxed.some((a) => a.reason === 'WAGES HIGH'), 'no wage alarm at 45%');
  run('unknown setting', V('settings', 'set', 'nonsense', '1'), { expectFail: true });

  run('note add', V('note', 'add', 'Bay City Meats', 'Agreed ribeye at 41.00 a kilo from next month'));
  const notes = run('notes', V('notes', 'ribeye'));
  assert(notes.length === 2, `both ribeye notes (${notes.length})`);

  run('suppliers', V('suppliers'));
  run('venues', V('venues'));
  const lic = run('venue licensed', V('venue', 'licensed', 'cafe'));
  assert(lic.licensed === true, 'the cafe is now licensed');

  // ---- moving in: import from Loaded's exports ------------------------------------

  const staffCsv = path.join(scratch, 'staff.csv');
  const tsCsv = path.join(scratch, 'timesheets.csv');
  const itemsCsv = path.join(scratch, 'items.csv');
  const salesCsv = path.join(scratch, 'sales.csv');
  writeFileSync(staffCsv, '﻿First Name,Last Name,Email,Mobile,Position,Location,Pay Rate\r\nNoah,Griffin,noah@tidewater.example,021 555 0101,Manager,Tidewater Kitchen and Bar,35.00\r\nRua,Tane,rua@example.com,021 555 0199,Kitchen Hand,Tidewater Kitchen and Bar,24.50\r\n');
  writeFileSync(tsCsv, 'Employee,Date,Clock In,Clock Out,Break (mins),Location\nRua Tane,01/10/2026,17:00,22:00,30,Tidewater Kitchen and Bar\nRua Tane,02/10/2026,17:00,22:30,0.5,Tidewater Kitchen and Bar\nRua Tane,,17:00,22:00,30,Tidewater Kitchen and Bar\nNobody Here,03/10/2026,17:00,22:00,30,Tidewater Kitchen and Bar\n');
  writeFileSync(itemsCsv, 'Stock Item,Category,Unit of Measure,Supplier,Pack Size,Par Level,Last Price\nScotch fillet,Meat,kg,Bay City Meats,5,10,46.00\nHaloumi,Dairy,kg,Island Cheese Co,1,2,"24.90"\nHouse sauvignon,Wine,ea,Vintners Direct,12,24,12.50\n');
  writeFileSync(salesCsv, 'Date,Location,Food Sales,Beverage Sales,Covers\n18/09/2026,Tidewater Kitchen and Bar,"2,100.00",900.00,48\n19/09/2026,Tidewater Kitchen and Bar,2400,1100,55\n');

  const importArgs = ['import', 'loaded', `--staff=${staffCsv}`, `--timesheets=${tsCsv}`, `--items=${itemsCsv}`, `--sales=${salesCsv}`];
  const dry = run('import: dry run first', V(...importArgs, '--dry-run'));
  assert(dry.dry_run === true && dry.created.some((c) => c.what === 'staff' && c.name === 'Rua Tane'), 'the dry run names who would land');
  assert(dry.skipped.some((s) => /missing date/.test(s.why)) && dry.skipped.some((s) => /Nobody Here/.test(s.why)), `and names every skip (${JSON.stringify(dry.skipped)})`);
  const after = run('nothing was written', V('stats'));
  assert(after.active_staff === 11, `still eleven active (${after.active_staff})`);

  const imported = run('import for real', V(...importArgs));
  assert(imported.updated.some((u) => u.what === 'staff' && u.name === 'Noah Griffin'), 'Noah matched, not duplicated');
  assert(imported.created.some((c) => c.what === 'supplier' && c.name === 'Island Cheese Co'), 'a new supplier arrives with its item');
  assert(imported.created.filter((c) => c.what === 'timesheet').length === 2, 'two timesheets land');
  const rua = run('the imported person', V('person', 'Rua'));
  assert(rua.visa_expires_on === null && rua.duty_manager_cert_expires_on === null, 'the paper does not come across');
  assert(rua.timesheets.find((t) => t.on_date === '2026-10-02').break_minutes === 30, 'a break in hours reads as minutes');
  const scotchNow = run('the import moved a cost', V('items')).find((i) => i.name === 'Scotch fillet');
  assert(n(scotchNow.unit_cost_cents) === 4600, `scotch fillet at $46 (${scotchNow.unit_cost_cents})`);

  const again = run('import again (idempotent)', V(...importArgs));
  assert(again.created.length === 0, `the second pass creates nothing (${JSON.stringify(again.created)})`);

  // ---- moving out, views, documents ------------------------------------------------

  const exported = run('export', V('export', `--out=${path.join(scratch, 'out')}`));
  assert(exported.written.length === 6, `six files (${exported.written.length})`);
  for (const w of exported.written) {
    assert(existsSync(path.join(scratch, 'out', w.file)), `${w.file} exists`);
    assert(readFileSync(path.join(scratch, 'out', w.file), 'utf8').split('\n').length > 2, `${w.file} has rows`);
  }

  const view = run('npm run view', ['view.mjs'], { json: false });
  assert((view.stdout.match(/^view:/gm) || []).length === 3, 'three dashboards render');
  const docs = run('npm run docs', ['docs.mjs'], { json: false });
  assert(/document\(s\) rendered/.test(docs.stdout) && !/^0 document/m.test(docs.stdout), 'the paperwork renders');

  console.log(`\nPASS: ${step} steps.`);
} finally {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
}
