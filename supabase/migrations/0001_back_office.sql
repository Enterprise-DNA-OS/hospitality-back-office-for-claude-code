-- hospitality-back-office-for-claude-code: core schema.
-- A hospitality group's back office the way Loaded sells it: the venues, the
-- team with their rates and their paper, the roster, the timesheets, the
-- day's sales and the cash-up, the suppliers, the stock items with their
-- price history, the orders and the supplier invoices, the stock counts and
-- the waste log, the recipes, and the number the owner actually reads every
-- morning: wages and cost of goods as a share of sales, per venue.
--
-- Runs unchanged on PGlite (embedded) and on Postgres / Supabase.
-- Money is in cents, NZD, excluding GST, except a recipe's menu price, which
-- is the price on the menu (GST inclusive) because that is what the operator
-- types. The views take GST off before they work out a margin.
--
-- Deliberately NOT here: pay runs, PAYE, leave balances (payroll does those),
-- the till itself (the POS records each sale; this keeps the day's totals),
-- and paying suppliers (the accounting system does that). What IS here is the
-- record those systems are fed from, and the margin they never show you
-- together.
--
-- The sharp edges are deliberate:
--   * nobody is rostered past the expiry of their recorded right to work
--     (Immigration Act 2009 s 350), and there is no force flag
--   * nobody holds two overlapping shifts or starts one inside the rest
--     window after the last one ends
--   * a licensed venue trading a day with no certified duty manager on the
--     roster is named (Sale and Supply of Alcohol Act 2012 ss 212-214)
--   * a timesheet is not approved while it is still open, and a short meal
--     break is said out loud (Employment Relations Act 2000 Part 6D)
--   * a cash-up that does not balance carries an explanation or stays loud
--   * a supplier invoice keeps its number and lines; an item's cost comes from
--     what was actually invoiced, so every recipe margin moves with the price
--   * no deleting records: shifts cancel with a reason, staff become former,
--     invoices are disputed or paid, counts close (Employment Relations Act
--     2000 s 130; Goods and Services Tax Act 1985 s 75)

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- The meal breaks the Employment Relations Act 2000 Part 6D (s 69ZD) requires
-- for a work period, in minutes. Over 4 hours and up to 8 earns one 30-minute
-- meal break; each further period restarts the clock.
create or replace function required_meal_minutes(span_hours numeric) returns int
language plpgsql immutable as $$
declare
  meals int := 0;
  h numeric := coalesce(span_hours, 0);
begin
  while h > 4 loop
    meals := meals + 1;
    h := h - 8;
  end loop;
  return meals * 30;
end
$$;

-- Settings ------------------------------------------------------------------------
-- The numbers the margins and rules read. Change them with `settings set`.

create table if not exists settings (
  key         text primary key,
  value       text not null,
  note        text,
  updated_at  timestamptz not null default now()
);

create or replace view v_settings as
select
  coalesce((select value::numeric from settings where key = 'wage_target_pct'), 30)            as wage_target_pct,
  coalesce((select value::numeric from settings where key = 'food_cost_target_pct'), 30)       as food_cost_target_pct,
  coalesce((select value::numeric from settings where key = 'beverage_cost_target_pct'), 25)   as beverage_cost_target_pct,
  coalesce((select value::numeric from settings where key = 'prime_cost_target_pct'), 60)      as prime_cost_target_pct,
  coalesce((select value::numeric from settings where key = 'cashup_tolerance_cents'), 1000)   as cashup_tolerance_cents,
  coalesce((select value::numeric from settings where key = 'count_stale_days'), 14)           as count_stale_days,
  coalesce((select value::numeric from settings where key = 'price_jump_pct'), 10)             as price_jump_pct,
  coalesce((select value::numeric from settings where key = 'rest_between_shifts_hours'), 10)  as rest_between_shifts_hours,
  coalesce((select value::numeric from settings where key = 'max_week_hours'), 50)             as max_week_hours,
  coalesce((select value::numeric from settings where key = 'timesheet_stale_days'), 3)        as timesheet_stale_days,
  coalesce((select value::numeric from settings where key = 'roster_notice_days'), 7)          as roster_notice_days,
  coalesce((select value::numeric from settings where key = 'gst_pct'), 15)                    as gst_pct;

-- Venues --------------------------------------------------------------------------
-- Each site that trades. `licensed` marks a venue that sells alcohol: the duty
-- manager check reads it.

create table if not exists venues (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  address       text,
  licensed      boolean not null default false,
  status        text not null default 'active' check (status in ('active', 'closed')),
  external_ref  text unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists venues_name_lower_idx on venues (lower(name));

-- Staff ---------------------------------------------------------------------------
-- The hourly rate is for costing wages against sales, never for paying anyone.

create table if not exists staff (
  id                             uuid primary key default gen_random_uuid(),
  name                           text not null,
  venue_id                       uuid references venues(id),        -- home venue; they can work anywhere
  role                           text not null default 'front_of_house',
  employment                     text not null default 'casual' check (employment in ('permanent', 'part_time', 'casual')),
  hourly_rate_cents              bigint check (hourly_rate_cents is null or hourly_rate_cents >= 0),
  phone                          text,
  email                          text,
  visa_expires_on                date,          -- null = no expiry on record; the roster gate reads this
  duty_manager_cert_no           text,
  duty_manager_cert_expires_on   date,
  status                         text not null default 'active' check (status in ('active', 'former')),
  note                           text,
  external_ref                   text unique,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now()
);
create unique index if not exists staff_name_lower_idx on staff (lower(name));

-- Shifts --------------------------------------------------------------------------
-- A blank staff_id is an open shift. Ends before starts means it runs past midnight.

create table if not exists shifts (
  id             uuid primary key default gen_random_uuid(),
  ref            text not null unique,                     -- SH-1001
  venue_id       uuid not null references venues(id),
  staff_id       uuid references staff(id),
  on_date        date not null,
  starts_at      time not null,
  ends_at        time not null,
  break_minutes  int not null default 30 check (break_minutes >= 0),
  role_needed    text,
  status         text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  cancel_reason  text,
  note           text,
  external_ref   text unique,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists shifts_date_idx on shifts (on_date);
create index if not exists shifts_staff_idx on shifts (staff_id, on_date);

-- Timesheets ----------------------------------------------------------------------
-- Clock-in to clock-out, wall-clock time at the venue. Approval is the payroll gate.

create table if not exists timesheets (
  id             uuid primary key default gen_random_uuid(),
  ref            text not null unique,                     -- TS-1001
  staff_id       uuid not null references staff(id),
  venue_id       uuid references venues(id),
  shift_id       uuid references shifts(id),
  on_date        date not null,
  clock_in_at    timestamp not null,
  clock_out_at   timestamp,
  break_minutes  int not null default 0 check (break_minutes >= 0),
  status         text not null default 'open' check (status in ('open', 'submitted', 'approved')),
  approved_on    date,
  note           text,
  external_ref   text unique,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (clock_out_at is null or clock_out_at > clock_in_at),
  check (status = 'open' or clock_out_at is not null)
);
create index if not exists timesheets_date_idx on timesheets (on_date);

-- Daily sales ---------------------------------------------------------------------
-- One row per venue per trading day, excluding GST: what the POS end-of-day
-- report says, keyed in or imported. The till keeps every transaction; the
-- margin only needs the day.

create table if not exists daily_sales (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null references venues(id),
  on_date         date not null,
  food_cents      bigint not null default 0 check (food_cents >= 0),
  beverage_cents  bigint not null default 0 check (beverage_cents >= 0),
  other_cents     bigint not null default 0 check (other_cents >= 0),
  covers          int,
  source          text not null default 'manual',          -- manual | pos | import
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (venue_id, on_date)
);

-- Cash-ups ------------------------------------------------------------------------
-- The end-of-night count against what the POS says. A variance over the
-- tolerance needs a note, or it stays on the attention list.

create table if not exists cashups (
  id                   uuid primary key default gen_random_uuid(),
  venue_id             uuid not null references venues(id),
  on_date              date not null,
  pos_cash_cents       bigint not null default 0,
  counted_cash_cents   bigint not null default 0,
  pos_card_cents       bigint not null default 0,
  settled_card_cents   bigint not null default 0,
  float_cents          bigint not null default 0,
  counted_by           text,
  explanation          text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (venue_id, on_date)
);

-- Suppliers -----------------------------------------------------------------------

create table if not exists suppliers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text,
  phone         text,
  order_days    text,                 -- 'Mon, Thu': when they take orders
  account_no    text,                 -- our account number with them
  status        text not null default 'active' check (status in ('active', 'inactive')),
  external_ref  text unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists suppliers_name_lower_idx on suppliers (lower(name));

-- Items ---------------------------------------------------------------------------
-- The stock list, shared by every venue. Quantities are in `unit` (kg, l, ea);
-- a supplier sells in packs of `pack_size` units. `par_qty` is what each venue
-- wants on hand after a delivery.

create table if not exists items (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  category      text not null default 'food' check (category in ('food', 'beverage', 'consumable')),
  unit          text not null default 'ea',
  supplier_id   uuid references suppliers(id),
  pack_size     numeric(12,3) not null default 1 check (pack_size > 0),
  pack_label    text,
  par_qty       numeric(12,3),
  status        text not null default 'active' check (status in ('active', 'discontinued')),
  external_ref  text unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists items_name_lower_idx on items (lower(name));

-- Item prices ---------------------------------------------------------------------
-- Every cost an item has had, per unit, ex GST. Entering a supplier invoice
-- writes one row per line, so recipe costs follow what was actually paid.

create table if not exists item_prices (
  id                uuid primary key default gen_random_uuid(),
  item_id           uuid not null references items(id),
  unit_cost_cents   numeric(12,2) not null check (unit_cost_cents >= 0),
  effective_on      date not null,
  source            text not null default 'manual',      -- manual | invoice | import
  invoice_id        uuid,
  created_at        timestamptz not null default now()
);
create index if not exists item_prices_item_idx on item_prices (item_id, effective_on desc);

-- Orders --------------------------------------------------------------------------

create table if not exists orders (
  id            uuid primary key default gen_random_uuid(),
  ref           text not null unique,                       -- PO-1001
  venue_id      uuid not null references venues(id),
  supplier_id   uuid not null references suppliers(id),
  status        text not null default 'draft' check (status in ('draft', 'sent', 'received', 'cancelled')),
  ordered_on    date,
  expected_on   date,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists order_lines (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references orders(id) on delete cascade,
  item_id           uuid not null references items(id),
  qty               numeric(12,3) not null check (qty > 0),
  unit_cost_cents   numeric(12,2),                          -- the cost expected when ordered
  unique (order_id, item_id)
);

-- Supplier invoices ---------------------------------------------------------------
-- Kept with the supplier's own invoice number: the GST record and the proof of
-- what each item really cost.

create table if not exists invoices (
  id                    uuid primary key default gen_random_uuid(),
  ref                   text not null unique,               -- INV-1001, ours
  venue_id              uuid not null references venues(id),
  supplier_id           uuid not null references suppliers(id),
  order_id              uuid references orders(id),
  supplier_invoice_no   text,
  invoice_date          date not null,
  due_on                date,
  status                text not null default 'entered' check (status in ('entered', 'disputed', 'paid')),
  note                  text,
  external_ref          text unique,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index if not exists invoices_supplier_no_idx on invoices (supplier_id, supplier_invoice_no) where supplier_invoice_no is not null;

create table if not exists invoice_lines (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references invoices(id) on delete cascade,
  item_id           uuid references items(id),
  description       text,
  qty               numeric(12,3) not null,
  unit_cost_cents   numeric(12,2) not null
);

-- Stock counts --------------------------------------------------------------------
-- A count opens, lines are entered as the shelves are walked, and it closes.
-- Two closed counts at a venue are the bookends of a real cost of goods.

create table if not exists stock_counts (
  id            uuid primary key default gen_random_uuid(),
  ref           text not null unique,                       -- SC-1001
  venue_id      uuid not null references venues(id),
  counted_on    date not null,
  status        text not null default 'open' check (status in ('open', 'closed')),
  counted_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists count_lines (
  id         uuid primary key default gen_random_uuid(),
  count_id   uuid not null references stock_counts(id) on delete cascade,
  item_id    uuid not null references items(id),
  qty        numeric(12,3) not null check (qty >= 0),
  unique (count_id, item_id)
);

-- Waste ---------------------------------------------------------------------------

create table if not exists waste (
  id           uuid primary key default gen_random_uuid(),
  venue_id     uuid not null references venues(id),
  item_id      uuid not null references items(id),
  qty          numeric(12,3) not null check (qty > 0),
  reason       text not null default 'spoiled',     -- spoiled | dropped | overproduced | returned | staff meal | comp
  on_date      date not null default current_date,
  recorded_by  text,
  created_at   timestamptz not null default now()
);

-- Recipes -------------------------------------------------------------------------
-- A menu item and what goes into it. `portions` is how many plates the lines
-- make. The menu price is what the customer pays, GST inclusive.

create table if not exists recipes (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  category           text not null default 'food' check (category in ('food', 'beverage')),
  menu_price_cents   bigint,
  portions           numeric(12,3) not null default 1 check (portions > 0),
  status             text not null default 'active' check (status in ('active', 'off_menu')),
  note               text,
  external_ref       text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists recipes_name_lower_idx on recipes (lower(name));

create table if not exists recipe_lines (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references recipes(id) on delete cascade,
  item_id     uuid not null references items(id),
  qty         numeric(12,4) not null check (qty > 0),
  unique (recipe_id, item_id)
);

-- File notes ----------------------------------------------------------------------

create table if not exists file_notes (
  id          uuid primary key default gen_random_uuid(),
  subject     text not null,          -- a person, a venue, a supplier: free text, matched by name
  body        text not null,
  author      text,
  created_at  timestamptz not null default now()
);

-- updated_at triggers ----------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['venues', 'staff', 'shifts', 'timesheets', 'daily_sales', 'cashups', 'suppliers', 'items', 'orders', 'invoices', 'stock_counts', 'recipes'] loop
    execute format('drop trigger if exists %I_updated_at on %I', t, t);
    execute format('create trigger %I_updated_at before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end
$$;

-- =============================================================================
-- Views. The CLI, the dashboards and the documents all read these, so a number
-- means the same thing everywhere.
-- =============================================================================

-- The current cost of each item: the latest price on or before today, and the
-- one before it, so a jump is visible.
create or replace view v_item_cost as
select
  i.id as item_id,
  i.name,
  i.category,
  i.unit,
  i.pack_size,
  i.pack_label,
  i.par_qty,
  i.status,
  s.id as supplier_id,
  s.name as supplier,
  cur.unit_cost_cents,
  cur.effective_on as cost_since,
  prev.unit_cost_cents as previous_cost_cents,
  case when prev.unit_cost_cents > 0 then
    round((cur.unit_cost_cents - prev.unit_cost_cents) * 100.0 / prev.unit_cost_cents, 1)
  end as change_pct
from items i
left join suppliers s on s.id = i.supplier_id
left join lateral (
  select unit_cost_cents, effective_on from item_prices p
  where p.item_id = i.id and p.effective_on <= current_date
  order by effective_on desc, created_at desc limit 1
) cur on true
left join lateral (
  select unit_cost_cents from item_prices p
  where p.item_id = i.id and p.effective_on <= current_date
    and p.unit_cost_cents <> cur.unit_cost_cents and p.effective_on <= cur.effective_on
  order by effective_on desc, created_at desc limit 1
) prev on true;

-- What each plate costs to make today, and what it earns.
create or replace view v_recipe_cost as
with lines as (
  select rl.recipe_id,
         count(*) as lines,
         count(*) filter (where c.unit_cost_cents is null) as lines_without_cost,
         sum(rl.qty * coalesce(c.unit_cost_cents, 0)) as batch_cost_cents
  from recipe_lines rl
  join v_item_cost c on c.item_id = rl.item_id
  group by rl.recipe_id
)
select
  r.id as recipe_id,
  r.name,
  r.category,
  r.status,
  r.portions,
  r.menu_price_cents,
  round(r.menu_price_cents / (1 + (select gst_pct from v_settings) / 100.0)) as price_ex_gst_cents,
  coalesce(l.lines, 0) as lines,
  coalesce(l.lines_without_cost, 0) as lines_without_cost,
  round(coalesce(l.batch_cost_cents, 0) / r.portions, 2) as plate_cost_cents,
  case when r.menu_price_cents > 0 then
    round(coalesce(l.batch_cost_cents, 0) / r.portions * 100.0 / (r.menu_price_cents / (1 + (select gst_pct from v_settings) / 100.0)), 1)
  end as cost_pct,
  case when r.menu_price_cents > 0 then
    round(r.menu_price_cents / (1 + (select gst_pct from v_settings) / 100.0) - coalesce(l.batch_cost_cents, 0) / r.portions)
  end as margin_cents,
  case when r.category = 'beverage' then (select beverage_cost_target_pct from v_settings) else (select food_cost_target_pct from v_settings) end as target_pct,
  case
    when coalesce(l.lines, 0) = 0 then 'NO LINES'
    when r.menu_price_cents is null then 'NO PRICE'
    when coalesce(l.lines_without_cost, 0) > 0 then 'MISSING COST'
    when coalesce(l.batch_cost_cents, 0) / r.portions * 100.0 / (r.menu_price_cents / (1 + (select gst_pct from v_settings) / 100.0))
         > case when r.category = 'beverage' then (select beverage_cost_target_pct from v_settings) else (select food_cost_target_pct from v_settings) end
      then 'OVER TARGET'
    else 'ok'
  end as state
from recipes r
left join lines l on l.recipe_id = r.id;

create or replace view v_staff as
select
  st.id as staff_id,
  st.name,
  st.role,
  st.employment,
  st.hourly_rate_cents,
  st.phone,
  st.email,
  v.name as home_venue,
  st.venue_id,
  st.visa_expires_on,
  st.duty_manager_cert_no,
  st.duty_manager_cert_expires_on,
  st.status,
  st.note,
  case
    when st.status = 'former' then 'former'
    when st.visa_expires_on is not null and st.visa_expires_on < current_date then 'NO WORK RIGHTS'
    when st.visa_expires_on is not null and st.visa_expires_on <= current_date + 30 then 'VISA EXPIRING'
    when st.duty_manager_cert_expires_on is not null and st.duty_manager_cert_expires_on < current_date then 'CERT EXPIRED'
    when st.duty_manager_cert_expires_on is not null and st.duty_manager_cert_expires_on <= current_date + 30 then 'CERT EXPIRING'
    else 'ok'
  end as paper
from staff st
left join venues v on v.id = st.venue_id;

create or replace view v_shifts as
select
  sh.id as shift_id,
  sh.ref,
  sh.on_date,
  v.name as venue,
  v.licensed,
  v.id as venue_id,
  st.name as staff,
  st.id as staff_id,
  st.role as staff_role,
  sh.role_needed,
  sh.starts_at,
  sh.ends_at,
  sh.break_minutes,
  t.s_ts as starts_ts,
  t.e_ts as ends_ts,
  (round(extract(epoch from (t.e_ts - t.s_ts)) / 60)::int - sh.break_minutes) as paid_minutes,
  case when st.hourly_rate_cents is not null then
    round((round(extract(epoch from (t.e_ts - t.s_ts)) / 60)::int - sh.break_minutes) * st.hourly_rate_cents / 60.0)::bigint
  end as cost_cents,
  sh.status,
  sh.cancel_reason,
  sh.note,
  case
    when sh.status = 'cancelled' then 'cancelled'
    when sh.status = 'published' and st.visa_expires_on is not null and st.visa_expires_on < sh.on_date then 'NO WORK RIGHTS'
    when sh.status = 'draft' and sh.on_date <= current_date + (select roster_notice_days from v_settings)::int then 'DRAFT LATE'
    when sh.status = 'draft' then 'draft'
    when sh.staff_id is null and sh.on_date < current_date then 'unfilled past'
    when sh.staff_id is null then 'OPEN'
    when t.e_ts < now()::timestamp then 'worked'
    else 'published'
  end as state
from shifts sh
join venues v on v.id = sh.venue_id
left join staff st on st.id = sh.staff_id
cross join lateral (
  select (sh.on_date + sh.starts_at)::timestamp as s_ts,
         (sh.on_date + sh.ends_at + case when sh.ends_at <= sh.starts_at then interval '1 day' else interval '0 hours' end)::timestamp as e_ts
) t;

create or replace view v_open_shifts as
select * from v_shifts
where staff_id is null and status = 'published' and on_date >= current_date;

create or replace view v_timesheets as
select
  ts.id as timesheet_id,
  ts.ref,
  st.name as staff,
  st.id as staff_id,
  v.name as venue,
  ts.venue_id,
  ts.on_date,
  ts.clock_in_at,
  ts.clock_out_at,
  ts.break_minutes,
  ts.status,
  ts.approved_on,
  ts.note,
  ts.shift_id,
  case when ts.clock_out_at is not null then
    round(extract(epoch from (ts.clock_out_at - ts.clock_in_at)) / 60)::int - ts.break_minutes
  end as worked_minutes,
  case when ts.clock_out_at is not null then
    required_meal_minutes(extract(epoch from (ts.clock_out_at - ts.clock_in_at)) / 3600.0)
  end as required_break_minutes,
  case when ts.clock_out_at is not null
    then ts.break_minutes < required_meal_minutes(extract(epoch from (ts.clock_out_at - ts.clock_in_at)) / 3600.0)
    else false
  end as break_short,
  case when ts.clock_out_at is not null and st.hourly_rate_cents is not null then
    round((round(extract(epoch from (ts.clock_out_at - ts.clock_in_at)) / 60)::int - ts.break_minutes) * st.hourly_rate_cents / 60.0)::bigint
  end as cost_cents,
  (current_date - ts.on_date) as days_old,
  case
    when ts.status = 'open' and ts.on_date < current_date then 'NOT CLOCKED OUT'
    when ts.status = 'open' then 'on shift'
    when ts.status = 'submitted'
         and ts.break_minutes < required_meal_minutes(extract(epoch from (ts.clock_out_at - ts.clock_in_at)) / 3600.0) then 'BREAK SHORT'
    when ts.status = 'submitted' and (current_date - ts.on_date) > (select timesheet_stale_days from v_settings) then 'WAITING ' || (current_date - ts.on_date) || 'd'
    when ts.status = 'submitted' then 'submitted'
    else 'approved'
  end as state
from timesheets ts
join staff st on st.id = ts.staff_id
left join venues v on v.id = ts.venue_id;

-- Two shifts for one person closer together than the rest window.
create or replace view v_rest_clashes as
select
  a.staff,
  a.staff_id,
  a.ref as first_ref,
  b.ref as then_ref,
  b.on_date as then_date,
  round(extract(epoch from (b.starts_ts - a.ends_ts)) / 3600.0, 1) as gap_hours
from v_shifts a
join v_shifts b on b.staff_id = a.staff_id and b.shift_id <> a.shift_id
  and b.starts_ts >= a.ends_ts
  and b.starts_ts < a.ends_ts + make_interval(hours => (select rest_between_shifts_hours from v_settings)::int)
where a.status <> 'cancelled' and b.status <> 'cancelled' and a.staff_id is not null;

-- Each future trading day at a licensed venue, and whether someone on the
-- published roster holds a current duty manager certificate.
create or replace view v_duty_days as
select
  sh.venue,
  sh.venue_id,
  sh.on_date,
  count(*) as shifts,
  bool_or(st.duty_manager_cert_expires_on is not null and st.duty_manager_cert_expires_on >= sh.on_date) as covered
from v_shifts sh
left join staff st on st.id = sh.staff_id
where sh.licensed and sh.status = 'published' and sh.on_date >= current_date
group by sh.venue, sh.venue_id, sh.on_date;

-- The day, per venue: sales, wages from the timesheets, wage share.
create or replace view v_daily as
with wages as (
  select venue_id, on_date, sum(cost_cents) as wage_cents, sum(worked_minutes) as worked_minutes
  from v_timesheets where clock_out_at is not null
  group by venue_id, on_date
),
buys as (
  select i.venue_id, i.invoice_date as on_date, sum(l.qty * l.unit_cost_cents) as purchase_cents
  from invoices i join invoice_lines l on l.invoice_id = i.id
  group by i.venue_id, i.invoice_date
)
select
  v.id as venue_id,
  v.name as venue,
  ds.on_date,
  (ds.food_cents + ds.beverage_cents + ds.other_cents) as sales_cents,
  ds.food_cents,
  ds.beverage_cents,
  ds.covers,
  case when ds.covers > 0 then round((ds.food_cents + ds.beverage_cents + ds.other_cents) / ds.covers::numeric) end as spend_per_cover_cents,
  coalesce(w.wage_cents, 0) as wage_cents,
  coalesce(w.worked_minutes, 0) as worked_minutes,
  case when (ds.food_cents + ds.beverage_cents + ds.other_cents) > 0 then
    round(coalesce(w.wage_cents, 0) * 100.0 / (ds.food_cents + ds.beverage_cents + ds.other_cents), 1)
  end as wage_pct,
  coalesce(b.purchase_cents, 0) as purchase_cents
from daily_sales ds
join venues v on v.id = ds.venue_id
left join wages w on w.venue_id = ds.venue_id and w.on_date = ds.on_date
left join buys b on b.venue_id = ds.venue_id and b.on_date = ds.on_date;

-- The week (Monday start), per venue: what Loaded calls the margin report.
-- Purchases stand in for cost of goods until two counts bookend the period
-- (v_period_cogs has the real figure).
create or replace view v_weekly as
select
  venue_id,
  venue,
  (date_trunc('week', on_date))::date as week_of,
  count(*) as trading_days,
  sum(sales_cents) as sales_cents,
  sum(covers) as covers,
  sum(wage_cents) as wage_cents,
  sum(purchase_cents) as purchase_cents,
  case when sum(sales_cents) > 0 then round(sum(wage_cents) * 100.0 / sum(sales_cents), 1) end as wage_pct,
  case when sum(sales_cents) > 0 then round(sum(purchase_cents) * 100.0 / sum(sales_cents), 1) end as purchase_pct,
  case when sum(sales_cents) > 0 then round((sum(wage_cents) + sum(purchase_cents)) * 100.0 / sum(sales_cents), 1) end as prime_pct
from v_daily
group by venue_id, venue, (date_trunc('week', on_date))::date;

-- The value of each closed count, at the cost each item had on the count day.
create or replace view v_count_value as
select
  sc.id as count_id,
  sc.ref,
  sc.venue_id,
  v.name as venue,
  sc.counted_on,
  sc.status,
  i.category,
  count(*) as lines,
  round(sum(cl.qty * coalesce(p.unit_cost_cents, 0))) as value_cents
from stock_counts sc
join venues v on v.id = sc.venue_id
join count_lines cl on cl.count_id = sc.id
join items i on i.id = cl.item_id
left join lateral (
  select unit_cost_cents from item_prices ip
  where ip.item_id = cl.item_id and ip.effective_on <= sc.counted_on
  order by effective_on desc, created_at desc limit 1
) p on true
group by sc.id, sc.ref, sc.venue_id, v.name, sc.counted_on, sc.status, i.category;

-- The real cost of goods between two closed counts at a venue:
-- opening stock + purchases - closing stock, against the sales of the same days.
create or replace view v_period_cogs as
with counts as (
  select sc.id, sc.ref, sc.venue_id, sc.counted_on,
         lag(sc.id) over (partition by sc.venue_id order by sc.counted_on, sc.created_at) as prev_id,
         lag(sc.ref) over (partition by sc.venue_id order by sc.counted_on, sc.created_at) as prev_ref,
         lag(sc.counted_on) over (partition by sc.venue_id order by sc.counted_on, sc.created_at) as prev_on
  from stock_counts sc where sc.status = 'closed'
),
cats as (select unnest(array['food', 'beverage']) as category)
select
  c.venue_id,
  v.name as venue,
  c.prev_ref as from_count,
  c.ref as to_count,
  c.prev_on as from_date,
  c.counted_on as to_date,
  k.category,
  coalesce(o.value_cents, 0) as opening_cents,
  coalesce(pu.purchase_cents, 0) as purchase_cents,
  coalesce(cl.value_cents, 0) as closing_cents,
  coalesce(o.value_cents, 0) + coalesce(pu.purchase_cents, 0) - coalesce(cl.value_cents, 0) as cogs_cents,
  coalesce(sa.sales_cents, 0) as sales_cents,
  case when coalesce(sa.sales_cents, 0) > 0 then
    round((coalesce(o.value_cents, 0) + coalesce(pu.purchase_cents, 0) - coalesce(cl.value_cents, 0)) * 100.0 / sa.sales_cents, 1)
  end as cogs_pct,
  case when k.category = 'beverage' then (select beverage_cost_target_pct from v_settings) else (select food_cost_target_pct from v_settings) end as target_pct
from counts c
join venues v on v.id = c.venue_id
cross join cats k
left join v_count_value o on o.count_id = c.prev_id and o.category = k.category
left join v_count_value cl on cl.count_id = c.id and cl.category = k.category
left join lateral (
  select round(sum(l.qty * l.unit_cost_cents)) as purchase_cents
  from invoices i join invoice_lines l on l.invoice_id = i.id join items it on it.id = l.item_id
  where i.venue_id = c.venue_id and i.invoice_date > c.prev_on and i.invoice_date <= c.counted_on and it.category = k.category
) pu on true
left join lateral (
  select sum(case when k.category = 'beverage' then ds.beverage_cents else ds.food_cents end) as sales_cents
  from daily_sales ds
  where ds.venue_id = c.venue_id and ds.on_date > c.prev_on and ds.on_date <= c.counted_on
) sa on true
where c.prev_id is not null;

-- Stock on hand per venue: the last closed count, plus what was invoiced since,
-- less what was logged as waste since. Sales do not draw it down (the till
-- does not tell us plates); the next count is the truth.
create or replace view v_stock_on_hand as
with last_count as (
  select distinct on (venue_id) id, ref, venue_id, counted_on
  from stock_counts where status = 'closed'
  order by venue_id, counted_on desc, created_at desc
)
select
  lc.venue_id,
  v.name as venue,
  lc.ref as last_count,
  lc.counted_on,
  c.item_id,
  c.name as item,
  c.category,
  c.unit,
  c.supplier_id,
  c.supplier,
  c.pack_size,
  c.pack_label,
  c.unit_cost_cents,
  coalesce(cl.qty, 0) as counted_qty,
  coalesce(inv.qty, 0) as received_qty,
  coalesce(w.qty, 0) as wasted_qty,
  coalesce(cl.qty, 0) + coalesce(inv.qty, 0) - coalesce(w.qty, 0) as on_hand_qty,
  c.par_qty,
  case when c.par_qty is not null and coalesce(cl.qty, 0) + coalesce(inv.qty, 0) - coalesce(w.qty, 0) < c.par_qty then
    ceil((c.par_qty - (coalesce(cl.qty, 0) + coalesce(inv.qty, 0) - coalesce(w.qty, 0))) / c.pack_size)
  else 0 end as packs_to_par,
  c.par_qty is not null and coalesce(cl.qty, 0) + coalesce(inv.qty, 0) - coalesce(w.qty, 0) < c.par_qty as below_par
from last_count lc
join venues v on v.id = lc.venue_id
cross join v_item_cost c
left join count_lines cl on cl.count_id = lc.id and cl.item_id = c.item_id
left join lateral (
  select sum(l.qty) as qty from invoices i join invoice_lines l on l.invoice_id = i.id
  where i.venue_id = lc.venue_id and l.item_id = c.item_id and i.invoice_date > lc.counted_on
) inv on true
left join lateral (
  select sum(wa.qty) as qty from waste wa
  where wa.venue_id = lc.venue_id and wa.item_id = c.item_id and wa.on_date > lc.counted_on
) w on true
where c.status = 'active' and (cl.qty is not null or inv.qty is not null);

create or replace view v_cashups as
select
  cu.id as cashup_id,
  v.name as venue,
  cu.venue_id,
  cu.on_date,
  cu.pos_cash_cents,
  cu.counted_cash_cents,
  cu.counted_cash_cents - cu.pos_cash_cents as cash_variance_cents,
  cu.pos_card_cents,
  cu.settled_card_cents,
  cu.settled_card_cents - cu.pos_card_cents as card_variance_cents,
  cu.counted_by,
  cu.explanation,
  case
    when (abs(cu.counted_cash_cents - cu.pos_cash_cents) > (select cashup_tolerance_cents from v_settings)
          or abs(cu.settled_card_cents - cu.pos_card_cents) > (select cashup_tolerance_cents from v_settings))
         and coalesce(cu.explanation, '') = '' then 'UNEXPLAINED'
    when abs(cu.counted_cash_cents - cu.pos_cash_cents) > (select cashup_tolerance_cents from v_settings)
         or abs(cu.settled_card_cents - cu.pos_card_cents) > (select cashup_tolerance_cents from v_settings) then 'explained'
    else 'balanced'
  end as state
from cashups cu
join venues v on v.id = cu.venue_id;

-- Trading days (a sales row) with no cash-up, before today.
create or replace view v_missing_cashups as
select v.name as venue, ds.venue_id, ds.on_date
from daily_sales ds
join venues v on v.id = ds.venue_id
where ds.on_date < current_date and ds.on_date >= current_date - 14
  and not exists (select 1 from cashups cu where cu.venue_id = ds.venue_id and cu.on_date = ds.on_date);

create or replace view v_invoices as
with totals as (
  select invoice_id, count(*) as lines, round(sum(qty * unit_cost_cents)) as total_cents,
         count(*) filter (where item_id is null) as unlinked_lines
  from invoice_lines group by invoice_id
),
ordered as (
  select order_id, round(sum(qty * coalesce(unit_cost_cents, 0))) as order_cents from order_lines group by order_id
)
select
  i.id as invoice_id,
  i.ref,
  v.name as venue,
  i.venue_id,
  s.name as supplier,
  i.supplier_id,
  i.supplier_invoice_no,
  i.invoice_date,
  i.due_on,
  i.status,
  i.note,
  o.ref as order_ref,
  i.order_id,
  coalesce(t.lines, 0) as lines,
  coalesce(t.unlinked_lines, 0) as unlinked_lines,
  coalesce(t.total_cents, 0) as total_cents,
  od.order_cents,
  case when od.order_cents is not null then coalesce(t.total_cents, 0) - od.order_cents end as vs_order_cents,
  case
    when i.status = 'paid' then 'paid'
    when i.status = 'disputed' then 'DISPUTED'
    when coalesce(i.supplier_invoice_no, '') = '' then 'NO INVOICE NUMBER'
    when od.order_cents is not null and abs(coalesce(t.total_cents, 0) - od.order_cents) > greatest(100, od.order_cents * 0.02) then 'DIFFERS FROM ORDER'
    when i.due_on is not null and i.due_on < current_date then 'OVERDUE'
    when i.order_id is null then 'no order'
    else 'matches order'
  end as state
from invoices i
join venues v on v.id = i.venue_id
join suppliers s on s.id = i.supplier_id
left join orders o on o.id = i.order_id
left join totals t on t.invoice_id = i.id
left join ordered od on od.order_id = i.order_id;

create or replace view v_orders as
select
  o.id as order_id,
  o.ref,
  v.name as venue,
  o.venue_id,
  s.name as supplier,
  o.supplier_id,
  s.email as supplier_email,
  o.status,
  o.ordered_on,
  o.expected_on,
  o.note,
  count(ol.id) as lines,
  round(sum(ol.qty * coalesce(ol.unit_cost_cents, 0))) as order_cents,
  (select count(*) from invoices i where i.order_id = o.id) as invoices,
  case
    when o.status = 'sent' and o.expected_on < current_date and not exists (select 1 from invoices i where i.order_id = o.id) then 'NOT DELIVERED'
    else o.status
  end as state
from orders o
join venues v on v.id = o.venue_id
join suppliers s on s.id = o.supplier_id
left join order_lines ol on ol.order_id = o.id
group by o.id, o.ref, v.name, o.venue_id, s.name, o.supplier_id, s.email, o.status, o.ordered_on, o.expected_on, o.note;

create or replace view v_hours as
select st.name, sh.staff_id, (date_trunc('week', sh.on_date))::date as week_of, sum(sh.paid_minutes) as paid_minutes, count(*) as shifts
from v_shifts sh join staff st on st.id = sh.staff_id
where sh.status in ('published', 'draft')
group by st.name, sh.staff_id, (date_trunc('week', sh.on_date))::date;

-- Everything that wants a decision, ranked. Rank 1 is today's first conversation.
create or replace view v_attention as
-- 1: somebody on the published roster past their right to work
select 1 as rank, 'NO WORK RIGHTS' as reason, sh.ref as label, sh.staff as who, sh.venue as place,
       'Rostered ' || to_char(sh.on_date, 'Dy DD Mon') || '; recorded right to work expired ' || to_char(st.visa_expires_on, 'DD Mon YYYY') || '. Unassign the shift or record the new visa.' as detail,
       (current_date - st.visa_expires_on) as days
from v_shifts sh join staff st on st.id = sh.staff_id
where sh.state = 'NO WORK RIGHTS' and sh.on_date >= current_date
union all
-- 2: a licensed venue trading with no certified duty manager rostered
select 2, 'NO DUTY MANAGER', to_char(d.on_date, 'Dy DD Mon'), null, d.venue,
       d.shifts || ' published shift(s), nobody on them holds a current duty manager certificate.', (d.on_date - current_date)
from v_duty_days d where not d.covered
union all
-- 3: money that does not add up
select 3, 'CASH-UP UNEXPLAINED', to_char(c.on_date, 'Dy DD Mon'), c.counted_by, c.venue,
       'Cash ' || case when c.cash_variance_cents < 0 then 'short ' else 'over ' end || to_char(abs(c.cash_variance_cents) / 100.0, 'FM999990.00')
       || ', card ' || to_char(c.card_variance_cents / 100.0, 'FM999990.00') || ' against the POS. Needs an explanation.', (current_date - c.on_date)
from v_cashups c where c.state = 'UNEXPLAINED' and c.on_date >= current_date - 14
union all
select 3, 'NO CASH-UP', to_char(m.on_date, 'Dy DD Mon'), null, m.venue,
       'Traded, but no cash-up was recorded.', (current_date - m.on_date)
from v_missing_cashups m
union all
-- 4: the record of who worked is wrong, or a shift breaks the rest window
select 4, 'NOT CLOCKED OUT', t.ref, t.staff, t.venue,
       'Clocked in ' || to_char(t.clock_in_at, 'Dy DD Mon HH24:MI') || ' and never clocked out.', t.days_old
from v_timesheets t where t.state = 'NOT CLOCKED OUT'
union all
select 4, 'REST CLASH', r.then_ref, r.staff, null,
       r.gap_hours || 'h between ' || r.first_ref || ' and ' || r.then_ref || ' against a ' || (select rest_between_shifts_hours from v_settings) || 'h rest window.', (r.then_date - current_date)
from v_rest_clashes r where r.then_date >= current_date
union all
-- 5: the margins
select 5, 'WAGES HIGH', 'last 7 days', null, w.venue,
       'Wages ' || w.wage_pct || '% of sales against a ' || (select wage_target_pct from v_settings) || '% target.', null
from (
  select venue, round(sum(wage_cents) * 100.0 / nullif(sum(sales_cents), 0), 1) as wage_pct
  from v_daily where on_date >= current_date - 7 and on_date < current_date group by venue
) w where w.wage_pct > (select wage_target_pct from v_settings)
union all
select 5, 'COST OF GOODS HIGH', p.category || ' ' || p.from_count || ' to ' || p.to_count, null, p.venue,
       initcap(p.category) || ' cost ' || p.cogs_pct || '% of ' || p.category || ' sales against a ' || p.target_pct || '% target.', null
from (
  select distinct on (venue_id, category) * from v_period_cogs order by venue_id, category, to_date desc
) p where p.cogs_pct > p.target_pct
union all
-- 6: supplier money
select 6, i.state, i.ref, i.supplier, i.venue,
       case i.state
         when 'DIFFERS FROM ORDER' then 'Invoiced ' || to_char(i.total_cents / 100.0, 'FM9999990.00') || ' against ' || i.order_ref || ' at ' || to_char(i.order_cents / 100.0, 'FM9999990.00') || '. Check before paying.'
         when 'NO INVOICE NUMBER' then 'No supplier invoice number on record: it cannot support a GST claim as it stands.'
         when 'OVERDUE' then 'Due ' || to_char(i.due_on, 'DD Mon') || ', not marked paid.'
         else 'Disputed: ' || coalesce(i.note, 'no note')
       end, (current_date - i.invoice_date)
from v_invoices i where i.state in ('DIFFERS FROM ORDER', 'NO INVOICE NUMBER', 'DISPUTED', 'OVERDUE')
union all
select 6, 'PRICE JUMP', c.name, c.supplier, null,
       'Now ' || to_char(c.unit_cost_cents / 100.0, 'FM9990.00') || '/' || c.unit || ', was ' || to_char(c.previous_cost_cents / 100.0, 'FM9990.00') || ' (+' || c.change_pct || '%) since ' || to_char(c.cost_since, 'DD Mon') || '.', (current_date - c.cost_since)
from v_item_cost c where c.change_pct > (select price_jump_pct from v_settings) and c.cost_since >= current_date - 30
union all
-- 7: menu and stock
select 7, 'RECIPE ' || r.state, r.name, null, null,
       case r.state
         when 'OVER TARGET' then 'Costs ' || to_char(r.plate_cost_cents / 100.0, 'FM9990.00') || ' a plate, ' || r.cost_pct || '% of the price ex GST against ' || r.target_pct || '%.'
         when 'MISSING COST' then r.lines_without_cost || ' ingredient(s) have no cost on record, so the margin is wrong.'
         else 'Cannot be costed: ' || lower(r.state) || '.'
       end, null
from v_recipe_cost r where r.status = 'active' and r.state <> 'ok'
union all
select 7, 'BELOW PAR', s.supplier, null, s.venue,
       s.items || ' item(s) under par: ' || s.names || '.', null
from (
  select venue, supplier, count(*) as items, string_agg(item, ', ' order by item) as names
  from v_stock_on_hand where below_par group by venue, supplier
) s
union all
-- 8: the roster and the sheets
select 8, 'OPEN SHIFT', o.ref, coalesce(o.role_needed, 'any role'), o.venue,
       to_char(o.on_date, 'Dy DD Mon') || ' ' || to_char(o.starts_at, 'HH24:MI') || '-' || to_char(o.ends_at, 'HH24:MI') || ' has nobody on it.', (o.on_date - current_date)
from v_open_shifts o
union all
select 8, 'DRAFT LATE', s.ref, s.staff, s.venue,
       to_char(s.on_date, 'Dy DD Mon') || ' is still draft inside the ' || (select roster_notice_days from v_settings) || '-day notice window.', (s.on_date - current_date)
from v_shifts s where s.state = 'DRAFT LATE'
union all
select 8, t.state, t.ref, t.staff, t.venue,
       case when t.state = 'BREAK SHORT' then 'Recorded ' || t.break_minutes || ' min break against ' || t.required_break_minutes || ' required for the span.'
            else 'Submitted ' || t.days_old || ' days ago and not approved.' end, t.days_old
from v_timesheets t where t.state = 'BREAK SHORT' or t.state like 'WAITING%'
union all
-- 9: counts and paper
select 9, 'COUNT STALE', coalesce(lc.ref, 'never counted'), null, v.name,
       case when lc.counted_on is null then 'No closed stock count on record.'
            else 'Last closed count ' || to_char(lc.counted_on, 'DD Mon') || ', ' || (current_date - lc.counted_on) || ' days ago. Cost of goods is a guess until the next one.' end,
       (current_date - lc.counted_on)
from venues v
left join lateral (
  select ref, counted_on from stock_counts sc where sc.venue_id = v.id and sc.status = 'closed' order by counted_on desc limit 1
) lc on true
where v.status = 'active' and (lc.counted_on is null or current_date - lc.counted_on > (select count_stale_days from v_settings))
union all
select 9, 'COUNT LEFT OPEN', sc.ref, sc.counted_by, v.name,
       'Opened ' || to_char(sc.counted_on, 'DD Mon') || ' and never closed.', (current_date - sc.counted_on)
from stock_counts sc join venues v on v.id = sc.venue_id
where sc.status = 'open' and sc.counted_on < current_date - 1
union all
select 9, s.paper, s.name, s.role, s.home_venue,
       case when s.paper = 'VISA EXPIRING' then 'Right to work expires ' || to_char(s.visa_expires_on, 'DD Mon YYYY') || '.'
            when s.paper = 'NO WORK RIGHTS' then 'Recorded right to work expired ' || to_char(s.visa_expires_on, 'DD Mon YYYY') || '.'
            else 'Duty manager certificate ' || case when s.paper = 'CERT EXPIRED' then 'expired ' else 'expires ' end || to_char(s.duty_manager_cert_expires_on, 'DD Mon YYYY') || '.' end,
       null
from v_staff s where s.status = 'active' and s.paper <> 'ok';

-- Row level security: on by default, nothing public. A Supabase install adds
-- policies for its own roles; the embedded database ignores this.
do $$
declare t text;
begin
  foreach t in array array['settings', 'venues', 'staff', 'shifts', 'timesheets', 'daily_sales', 'cashups', 'suppliers', 'items', 'item_prices', 'orders', 'order_lines', 'invoices', 'invoice_lines', 'stock_counts', 'count_lines', 'waste', 'recipes', 'recipe_lines', 'file_notes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from public', t);
  end loop;
end
$$;
