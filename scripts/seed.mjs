#!/usr/bin/env node
// Loads supabase/seed.sql: Tidewater Hospitality, a fictional Tauranga group
// with a licensed kitchen and bar and a cafe, four weeks of sales and
// timesheets behind, next week's roster ahead, suppliers, invoices, counts,
// waste and recipes. Every row has a derived id and inserts with ON CONFLICT
// DO NOTHING, so re-running it is harmless.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';

export async function seed(db) {
  const sql = readFileSync(path.join(REPO_ROOT, 'supabase', 'seed.sql'), 'utf8');
  await db.exec(sql);
  const [c] = await db.query(`
    select (select count(*) from venues)        as venues,
           (select count(*) from staff)         as staff,
           (select count(*) from shifts)        as shifts,
           (select count(*) from timesheets)    as timesheets,
           (select count(*) from daily_sales)   as daily_sales,
           (select count(*) from cashups)       as cashups,
           (select count(*) from suppliers)     as suppliers,
           (select count(*) from items)         as items,
           (select count(*) from invoices)      as invoices,
           (select count(*) from stock_counts)  as stock_counts,
           (select count(*) from recipes)       as recipes
  `);
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)]));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const db = await getDb();
  try {
    const counts = await seed(db);
    console.log('seeded:', Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' '));
  } finally {
    await db.close();
  }
}
