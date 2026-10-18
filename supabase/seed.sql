-- Demo data for hospitality-back-office-for-claude-code.
-- Tidewater Hospitality, a fictional Tauranga group with two venues: Tidewater
-- Kitchen and Bar (licensed, dinner Tuesday to Sunday) and Tidewater Cafe
-- (every day, breakfast and lunch). Ten active staff and one former, four
-- weeks of sales and timesheets behind, next week's roster ahead, seven
-- suppliers, twenty-two stock items with their price history, invoices,
-- orders, stock counts, waste and nine recipes.
--
-- Deliberately messy, so the attention list has something to say:
--   Lucas Meyer's recorded right to work expired 9 days ago and he still
--     holds two published bar shifts next week
--   next Saturday the licensed Kitchen and Bar trades with nobody rostered
--     who holds a current duty manager certificate
--   the Cafe's wages ran at about 35% of sales last week: roadworks out front
--     cut trade by a quarter and the roster did not move
--   the Kitchen and Bar's food cost between the last two counts is 36% of
--     food sales against a 30% target, because scotch fillet went from
--     $38.50 to $45.50 a kilo ten days ago and the menu price did not move
--   the scotch fillet dish now costs 34% of its price; the truffle fries
--     cannot be costed (no price on record for truffle oil)
--   the Kitchen and Bar's last cash-up before yesterday is $85 short with no
--     explanation, and the Cafe did no cash-up yesterday
--   Southern Dry Goods invoiced 75kg of fries against an order for 50kg;
--     a Harbour Fresh invoice has no invoice number; a Coastal Fish invoice
--     is past due; a coffee order is a day late
--   bacon, blue cod and tomatoes are under par at the Kitchen and Bar
--   the Cafe's last closed stock count is 20 days old and the one started 4
--     days ago was never closed
--   Emma Walsh clocked in yesterday and never clocked out; Sofia Marino's
--     9-hour sheet has no meal break; two sheets have waited past the line
--   Ben Tuilagi closes the kitchen at 22:30 next Friday and opens at 07:00
--     on Saturday; one Sunday cafe shift is open; two Monday shifts are
--     still draft inside the notice window
--   Priya Nair's right to work expires in 25 days; Aroha Ngata's duty
--     manager certificate in 21
--
-- Dates are relative to current_date (next week's roster is anchored to next
-- Monday), so the demo reads the same whatever day you run it. Ids derive
-- from names, every insert is ON CONFLICT DO NOTHING, so running it twice
-- changes nothing.
--
-- Staff, venues, suppliers, rates, prices and events are DEMO VALUES for a
-- fictional business. No real person or business is depicted.

create or replace function seed_uuid(seed text) returns uuid language sql immutable as $$
  select (substr(m, 1, 8) || '-' || substr(m, 9, 4) || '-4' || substr(m, 13, 3)
          || '-8' || substr(m, 16, 3) || '-' || substr(m, 19, 12))::uuid
  from (select md5(seed) as m) s
$$;

-- Settings -------------------------------------------------------------------------

insert into settings (key, value, note) values
  ('wage_target_pct', '30', 'wages as a share of sales ex GST, per venue'),
  ('food_cost_target_pct', '30', 'food cost of goods and food recipes, share of price ex GST'),
  ('beverage_cost_target_pct', '25', 'beverage cost of goods and drinks recipes'),
  ('prime_cost_target_pct', '60', 'wages plus cost of goods'),
  ('cashup_tolerance_cents', '1000', 'a cash-up variance over this needs an explanation'),
  ('count_stale_days', '14', 'a venue without a closed count for longer is loud'),
  ('price_jump_pct', '10', 'an item cost rise over this in 30 days is loud'),
  ('rest_between_shifts_hours', '10', 'minimum gap between one shift ending and the next starting'),
  ('max_week_hours', '50', 'the agreed weekly ceiling'),
  ('timesheet_stale_days', '3', 'a submitted sheet older than this is late pay'),
  ('roster_notice_days', '7', 'shifts inside this window should be published'),
  ('gst_pct', '15', 'taken off menu prices before a margin is worked out')
on conflict (key) do nothing;

-- Venues ---------------------------------------------------------------------------

insert into venues (id, name, address, licensed) values
  (seed_uuid('venue:kb'), 'Tidewater Kitchen and Bar', '12 Strand Lane, Tauranga', true),
  (seed_uuid('venue:cafe'), 'Tidewater Cafe', '3 Harbour Street, Tauranga', false)
on conflict do nothing;

-- Staff ----------------------------------------------------------------------------

insert into staff (id, name, venue_id, role, employment, hourly_rate_cents, phone, email, visa_expires_on, duty_manager_cert_no, duty_manager_cert_expires_on, status, note) values
  (seed_uuid('staff:Noah Griffin'), 'Noah Griffin', seed_uuid('venue:kb'), 'manager', 'permanent', 3400, '021 555 0101', 'noah@tidewater.example', null, 'GMC-0418', current_date + 200, 'active', null),
  (seed_uuid('staff:Aroha Ngata'), 'Aroha Ngata', seed_uuid('venue:kb'), 'supervisor', 'permanent', 2900, '021 555 0102', 'aroha@tidewater.example', null, 'GMC-0552', current_date + 21, 'active', 'Renewal paperwork started? Ask.'),
  (seed_uuid('staff:Ben Tuilagi'), 'Ben Tuilagi', seed_uuid('venue:kb'), 'chef', 'permanent', 3100, '021 555 0103', 'ben@tidewater.example', null, null, null, 'active', null),
  (seed_uuid('staff:Mei Chen'), 'Mei Chen', seed_uuid('venue:kb'), 'chef', 'permanent', 2900, '021 555 0104', 'mei@tidewater.example', null, null, null, 'active', null),
  (seed_uuid('staff:Lucas Meyer'), 'Lucas Meyer', seed_uuid('venue:kb'), 'bartender', 'casual', 2600, '021 555 0105', 'lucas@tidewater.example', current_date - 9, null, null, 'active', 'Working holiday visa.'),
  (seed_uuid('staff:Sofia Marino'), 'Sofia Marino', seed_uuid('venue:kb'), 'front_of_house', 'casual', 2500, '021 555 0106', 'sofia@tidewater.example', null, null, null, 'active', null),
  (seed_uuid('staff:Tom Reid'), 'Tom Reid', seed_uuid('venue:kb'), 'kitchen_hand', 'casual', 2400, '021 555 0107', 'tom@tidewater.example', null, null, null, 'active', null),
  (seed_uuid('staff:Emma Walsh'), 'Emma Walsh', seed_uuid('venue:cafe'), 'barista', 'part_time', 2550, '021 555 0108', 'emma@tidewater.example', null, null, null, 'active', null),
  (seed_uuid('staff:Priya Nair'), 'Priya Nair', seed_uuid('venue:cafe'), 'barista', 'casual', 2500, '021 555 0109', 'priya@tidewater.example', current_date + 25, null, null, 'active', 'Student visa, 20 hours a week in term.'),
  (seed_uuid('staff:Jack Harmon'), 'Jack Harmon', seed_uuid('venue:cafe'), 'cook', 'part_time', 2700, '021 555 0110', 'jack@tidewater.example', null, null, null, 'active', null),
  (seed_uuid('staff:Hana Kim'), 'Hana Kim', seed_uuid('venue:cafe'), 'barista', 'casual', 2450, null, null, null, null, null, 'former', 'Moved to Auckland.')
on conflict do nothing;

-- The standing weekly pattern: who works where, which days (ISO: 1 = Monday),
-- and when. Timesheets behind and the roster ahead are both built from it.
create or replace function seed_pattern()
returns table (name text, venue text, dows int[], starts time, ends time, brk int)
language sql immutable as $$
  values
    ('Noah Griffin', 'kb', array[2,3,4,5,6], '15:00'::time, '23:00'::time, 30),
    ('Aroha Ngata', 'kb', array[3,4,5,6,7], '16:00'::time, '23:30'::time, 30),
    ('Ben Tuilagi', 'kb', array[2,3,4,5,6], '14:00'::time, '22:30'::time, 30),
    ('Mei Chen', 'kb', array[2,4,5,6,7], '11:00'::time, '19:30'::time, 30),
    ('Lucas Meyer', 'kb', array[5,6], '17:00'::time, '23:30'::time, 30),
    ('Sofia Marino', 'kb', array[3,4,5,6,7], '17:00'::time, '22:30'::time, 30),
    ('Tom Reid', 'kb', array[4,5,6,7], '17:00'::time, '22:00'::time, 30),
    ('Emma Walsh', 'cafe', array[1,2,3,4,5], '06:30'::time, '14:30'::time, 30),
    ('Priya Nair', 'cafe', array[3,4,5,6,7], '07:00'::time, '15:00'::time, 30),
    ('Jack Harmon', 'cafe', array[1,2,4,5,6], '07:00'::time, '15:00'::time, 30)
$$;

-- Daily sales, the last 28 days, ex GST. The Kitchen and Bar is closed Monday.
-- The Cafe's last seven days run at three quarters of normal (roadworks).

insert into daily_sales (id, venue_id, on_date, food_cents, beverage_cents, other_cents, covers, source)
select seed_uuid('sales:kb:' || d::text), seed_uuid('venue:kb'), d,
       (t.food * 100)::bigint, (t.bev * 100)::bigint, 0, round((t.food + t.bev) / 62.0)::int, 'pos'
from (select (current_date - g)::date as d from generate_series(1, 28) g) days
join (values (2, 1360, 640), (3, 1632, 768), (4, 2040, 960), (5, 3400, 1600), (6, 3944, 1856), (7, 2380, 1120)) t(dow, food, bev)
  on t.dow = extract(isodow from days.d)::int
on conflict do nothing;

insert into daily_sales (id, venue_id, on_date, food_cents, beverage_cents, other_cents, covers, source, note)
select seed_uuid('sales:cafe:' || d::text), seed_uuid('venue:cafe'), d,
       round(t.total * 0.55 * m * 100)::bigint, round(t.total * 0.45 * m * 100)::bigint, 0, round(t.total * m / 18.0)::int, 'pos',
       case when m < 1 then 'Roadworks on Harbour Street' end
from (select (current_date - g)::date as d, case when g <= 7 then 0.75 else 1 end as m from generate_series(1, 28) g) days
join (values (1, 1300), (2, 1250), (3, 1300), (4, 1400), (5, 1600), (6, 2000), (7, 1900)) t(dow, total)
  on t.dow = extract(isodow from days.d)::int
on conflict do nothing;

-- Timesheets. The exceptions go in first; the pattern then fills every other
-- day and skips the ones already taken.

insert into timesheets (id, ref, staff_id, venue_id, on_date, clock_in_at, clock_out_at, break_minutes, status, note) values
  (seed_uuid('ts:Emma Walsh:' || (current_date - 1)::text), 'TS-1001', seed_uuid('staff:Emma Walsh'), seed_uuid('venue:cafe'), current_date - 1,
   (current_date - 1) + time '06:30', null, 0, 'open', null),
  (seed_uuid('ts:Sofia Marino:' || (current_date - 2)::text), 'TS-1002', seed_uuid('staff:Sofia Marino'), seed_uuid('venue:kb'), current_date - 2,
   (current_date - 2) + time '12:00', (current_date - 2) + time '21:00', 0, 'submitted', 'Covered lunch and dinner'),
  (seed_uuid('ts:Jack Harmon:' || (current_date - 5)::text), 'TS-1003', seed_uuid('staff:Jack Harmon'), seed_uuid('venue:cafe'), current_date - 5,
   (current_date - 5) + time '07:00', (current_date - 5) + time '15:00', 30, 'submitted', null),
  (seed_uuid('ts:Priya Nair:' || (current_date - 6)::text), 'TS-1004', seed_uuid('staff:Priya Nair'), seed_uuid('venue:cafe'), current_date - 6,
   (current_date - 6) + time '07:00', (current_date - 6) + time '15:00', 30, 'submitted', null)
on conflict do nothing;

insert into timesheets (id, ref, staff_id, venue_id, on_date, clock_in_at, clock_out_at, break_minutes, status, approved_on)
select seed_uuid('ts:' || p.name || ':' || d::text),
       'TS-' || (3000 + row_number() over (order by d, p.name)),
       seed_uuid('staff:' || p.name), seed_uuid('venue:' || p.venue), d,
       d + p.starts,
       d + p.ends + case when p.ends <= p.starts then interval '1 day' else interval '0 hours' end,
       p.brk,
       case when g > 3 then 'approved' else 'submitted' end,
       case when g > 3 then d + 2 end
from generate_series(1, 28) g
cross join lateral (select (current_date - g)::date as d) dd
join seed_pattern() p on extract(isodow from dd.d)::int = any(p.dows)
where not (p.name = 'Lucas Meyer' and dd.d >= current_date - 9)
on conflict do nothing;

-- Next week's roster. Exceptions first: Ben opens Saturday after closing
-- Friday, and the Sunday cafe shift is open.

insert into shifts (id, ref, venue_id, staff_id, on_date, starts_at, ends_at, break_minutes, role_needed, status, note) values
  (seed_uuid('sh:Ben Tuilagi:' || ((date_trunc('week', current_date))::date + 12)::text), 'SH-1001', seed_uuid('venue:kb'), seed_uuid('staff:Ben Tuilagi'),
   (date_trunc('week', current_date))::date + 12, '07:00', '15:00', 30, null, 'published', 'Brunch prep for the wedding party'),
  (seed_uuid('sh:open:cafe:sun'), 'SH-1002', seed_uuid('venue:cafe'), null,
   (date_trunc('week', current_date))::date + 13, '08:00', '14:00', 30, 'barista', 'published', 'Hana''s old Sunday')
on conflict do nothing;

insert into shifts (id, ref, venue_id, staff_id, on_date, starts_at, ends_at, break_minutes, status)
select seed_uuid('sh:' || p.name || ':' || d::text),
       'SH-' || (2000 + row_number() over (order by d, p.name)),
       seed_uuid('venue:' || p.venue), seed_uuid('staff:' || p.name), d, p.starts, p.ends, p.brk,
       case when extract(isodow from d)::int = 1 then 'draft' else 'published' end
from generate_series(7, 13) g
cross join lateral (select ((date_trunc('week', current_date))::date + g) as d) dd
join seed_pattern() p on extract(isodow from dd.d)::int = any(p.dows)
where not (p.name in ('Noah Griffin', 'Aroha Ngata') and extract(isodow from dd.d)::int = 6)
on conflict do nothing;

-- Cash-ups for every trading day in the last fortnight, except the Cafe
-- yesterday. Cash is 8% of takings (GST inclusive), the rest is card.

insert into cashups (id, venue_id, on_date, pos_cash_cents, counted_cash_cents, pos_card_cents, settled_card_cents, float_cents, counted_by)
select seed_uuid('cashup:' || ds.venue_id::text || ':' || ds.on_date::text), ds.venue_id, ds.on_date,
       round(tot * 1.15 * 0.08), round(tot * 1.15 * 0.08),
       round(tot * 1.15) - round(tot * 1.15 * 0.08), round(tot * 1.15) - round(tot * 1.15 * 0.08),
       30000,
       case when ds.venue_id = seed_uuid('venue:kb') then 'Aroha Ngata' else 'Emma Walsh' end
from daily_sales ds
cross join lateral (select (ds.food_cents + ds.beverage_cents + ds.other_cents) as tot) t
where ds.on_date >= current_date - 14 and ds.on_date < current_date
  and not (ds.venue_id = seed_uuid('venue:cafe') and ds.on_date = current_date - 1)
on conflict do nothing;

-- The Kitchen and Bar's last cash-up before yesterday is $85 short.
update cashups set counted_cash_cents = pos_cash_cents - 8500
where venue_id = seed_uuid('venue:kb')
  and on_date = (select max(on_date) from cashups where venue_id = seed_uuid('venue:kb') and on_date < current_date - 1);

-- A small over at the Cafe, explained.
update cashups set counted_cash_cents = pos_cash_cents + 1400, explanation = 'Float topped up from the safe and not recorded'
where venue_id = seed_uuid('venue:cafe') and on_date = current_date - 3;

-- Suppliers ------------------------------------------------------------------------

insert into suppliers (id, name, email, phone, order_days, account_no) values
  (seed_uuid('sup:meats'), 'Bay City Meats', 'orders@baycitymeats.example', '07 555 0201', 'Mon, Wed, Fri', 'TW-118'),
  (seed_uuid('sup:fish'), 'Coastal Fish Co', 'orders@coastalfish.example', '07 555 0202', 'Tue, Thu', 'TID-77'),
  (seed_uuid('sup:produce'), 'Harbour Fresh Produce', 'sales@harbourfresh.example', '07 555 0203', 'Daily', 'H-2231'),
  (seed_uuid('sup:dry'), 'Southern Dry Goods', 'orders@southerndry.example', '07 555 0204', 'Mon, Thu', 'SDG-4410'),
  (seed_uuid('sup:coffee'), 'Kahu Coffee Roasters', 'hello@kahucoffee.example', '07 555 0205', 'Mon', 'KAHU-19'),
  (seed_uuid('sup:wine'), 'Vintners Direct', 'trade@vintnersdirect.example', '07 555 0206', 'Wed', 'VD-0907'),
  (seed_uuid('sup:dairy'), 'Lakeside Dairy', 'orders@lakesidedairy.example', '07 555 0207', 'Daily', 'LD-552')
on conflict do nothing;

-- Items ----------------------------------------------------------------------------

insert into items (id, name, category, unit, supplier_id, pack_size, pack_label, par_qty) values
  (seed_uuid('item:scotch'), 'Scotch fillet', 'food', 'kg', seed_uuid('sup:meats'), 5, '5kg vac pack', 10),
  (seed_uuid('item:mince'), 'Beef mince', 'food', 'kg', seed_uuid('sup:meats'), 5, '5kg bag', 8),
  (seed_uuid('item:bacon'), 'Streaky bacon', 'food', 'kg', seed_uuid('sup:meats'), 2, '2kg pack', 4),
  (seed_uuid('item:cod'), 'Blue cod fillet', 'food', 'kg', seed_uuid('sup:fish'), 2, '2kg tray', 6),
  (seed_uuid('item:fries'), 'Frozen fries', 'food', 'kg', seed_uuid('sup:dry'), 12.5, '12.5kg carton', 25),
  (seed_uuid('item:buns'), 'Brioche buns', 'food', 'ea', seed_uuid('sup:dry'), 24, 'box of 24', 48),
  (seed_uuid('item:batter'), 'Batter mix', 'food', 'kg', seed_uuid('sup:dry'), 10, '10kg bag', 5),
  (seed_uuid('item:oil'), 'Canola oil', 'food', 'l', seed_uuid('sup:dry'), 20, '20l drum', 15),
  (seed_uuid('item:aioli'), 'Aioli', 'food', 'kg', seed_uuid('sup:dry'), 2, '2kg tub', 2),
  (seed_uuid('item:sourdough'), 'Sourdough loaf', 'food', 'ea', seed_uuid('sup:dry'), 1, 'loaf', 6),
  (seed_uuid('item:cos'), 'Cos lettuce', 'food', 'ea', seed_uuid('sup:produce'), 12, 'box of 12', 24),
  (seed_uuid('item:tomato'), 'Tomatoes', 'food', 'kg', seed_uuid('sup:produce'), 5, '5kg box', 8),
  (seed_uuid('item:lemon'), 'Lemons', 'food', 'ea', seed_uuid('sup:produce'), 40, 'bag of 40', 40),
  (seed_uuid('item:parmesan'), 'Parmesan', 'food', 'kg', seed_uuid('sup:dairy'), 1, '1kg block', 1.5),
  (seed_uuid('item:eggs'), 'Free-range eggs', 'food', 'ea', seed_uuid('sup:dairy'), 30, 'tray of 30', 60),
  (seed_uuid('item:butter'), 'Butter', 'food', 'kg', seed_uuid('sup:dairy'), 0.5, '500g block', 3),
  (seed_uuid('item:truffle'), 'Truffle oil', 'food', 'l', seed_uuid('sup:dry'), 0.25, '250ml bottle', null),
  (seed_uuid('item:milk'), 'Milk', 'beverage', 'l', seed_uuid('sup:dairy'), 2, '2l bottle', 10),
  (seed_uuid('item:beans'), 'Coffee beans', 'beverage', 'kg', seed_uuid('sup:coffee'), 1, '1kg bag', 2),
  (seed_uuid('item:pinot'), 'Pinot gris', 'beverage', 'ea', seed_uuid('sup:wine'), 12, 'case of 12 bottles', 24),
  (seed_uuid('item:lager'), 'Craft lager 330ml', 'beverage', 'ea', seed_uuid('sup:wine'), 24, 'case of 24', 96),
  (seed_uuid('item:cups'), 'Takeaway cups', 'consumable', 'ea', seed_uuid('sup:dry'), 1000, 'carton of 1000', 1000)
on conflict do nothing;

-- Every item's cost 60 days ago (cents per unit, ex GST). Truffle oil has
-- none on record, deliberately. Scotch fillet's jump arrives on an invoice.
insert into item_prices (id, item_id, unit_cost_cents, effective_on, source)
select seed_uuid('price:' || k || ':base'), seed_uuid('item:' || k), c, current_date - 60, 'import'
from (values ('scotch', 3850), ('mince', 1450), ('bacon', 1890), ('cod', 4200), ('fries', 310), ('buns', 95),
             ('batter', 420), ('oil', 380), ('aioli', 1100), ('sourdough', 650), ('cos', 220), ('tomato', 650),
             ('lemon', 45), ('parmesan', 3200), ('eggs', 62), ('butter', 1450), ('milk', 185), ('beans', 3800),
             ('pinot', 1650), ('lager', 245), ('cups', 18)) v(k, c)
on conflict do nothing;

insert into item_prices (id, item_id, unit_cost_cents, effective_on, source, invoice_id) values
  (seed_uuid('price:scotch:jump'), seed_uuid('item:scotch'), 4550, current_date - 10, 'invoice', seed_uuid('inv:kb-meats-10'))
on conflict do nothing;

-- Orders ---------------------------------------------------------------------------

insert into orders (id, ref, venue_id, supplier_id, status, ordered_on, expected_on, note) values
  (seed_uuid('po:1001'), 'PO-1001', seed_uuid('venue:kb'), seed_uuid('sup:meats'), 'received', current_date - 6, current_date - 5, null),
  (seed_uuid('po:1002'), 'PO-1002', seed_uuid('venue:kb'), seed_uuid('sup:dry'), 'received', current_date - 4, current_date - 3, null),
  (seed_uuid('po:1003'), 'PO-1003', seed_uuid('venue:cafe'), seed_uuid('sup:coffee'), 'sent', current_date - 2, current_date - 1, 'Weekly beans')
on conflict do nothing;

insert into order_lines (id, order_id, item_id, qty, unit_cost_cents) values
  (seed_uuid('pol:1001:scotch'), seed_uuid('po:1001'), seed_uuid('item:scotch'), 10, 4550),
  (seed_uuid('pol:1001:mince'), seed_uuid('po:1001'), seed_uuid('item:mince'), 10, 1450),
  (seed_uuid('pol:1002:fries'), seed_uuid('po:1002'), seed_uuid('item:fries'), 50, 310),
  (seed_uuid('pol:1002:buns'), seed_uuid('po:1002'), seed_uuid('item:buns'), 96, 95),
  (seed_uuid('pol:1003:beans'), seed_uuid('po:1003'), seed_uuid('item:beans'), 10, 3800)
on conflict do nothing;

-- Supplier invoices ------------------------------------------------------------------
-- (key, venue, supplier, order, supplier invoice no, days ago, terms in days)

insert into invoices (id, ref, venue_id, supplier_id, order_id, supplier_invoice_no, invoice_date, due_on, status)
select seed_uuid('inv:' || k), ref, seed_uuid('venue:' || ven), seed_uuid('sup:' || sup),
       case when po is null then null else seed_uuid('po:' || po) end,
       no, current_date - ago, current_date - ago + terms,
       case when ago > 17 then 'paid' else 'entered' end
from (values
  ('kb-dry-27', 'INV-1001', 'kb', 'dry', null, 'SDG-88102', 27, 30),
  ('kb-meats-26', 'INV-1002', 'kb', 'meats', null, 'BCM-30412', 26, 30),
  ('kb-fish-25', 'INV-1003', 'kb', 'fish', null, 'CF-5521', 25, 7),
  ('kb-produce-26', 'INV-1004', 'kb', 'produce', null, 'HF-77120', 26, 20),
  ('kb-wine-26', 'INV-1005', 'kb', 'wine', null, 'VD-11903', 26, 30),
  ('kb-dairy-25', 'INV-1006', 'kb', 'dairy', null, 'LD-20981', 25, 20),
  ('kb-dry-13', 'INV-1007', 'kb', 'dry', null, 'SDG-88377', 13, 30),
  ('kb-meats-12', 'INV-1008', 'kb', 'meats', null, 'BCM-30588', 12, 30),
  ('kb-produce-12', 'INV-1009', 'kb', 'produce', null, 'HF-77391', 12, 20),
  ('kb-wine-12', 'INV-1010', 'kb', 'wine', null, 'VD-12011', 12, 30),
  ('kb-fish-11', 'INV-1011', 'kb', 'fish', null, 'CF-5602', 11, 7),
  ('kb-dairy-11', 'INV-1012', 'kb', 'dairy', null, 'LD-21140', 11, 20),
  ('kb-meats-10', 'INV-1013', 'kb', 'meats', null, 'BCM-30641', 10, 30),
  ('kb-produce-9', 'INV-1014', 'kb', 'produce', null, 'HF-77455', 9, 20),
  ('kb-fish-8', 'INV-1015', 'kb', 'fish', null, 'CF-5630', 8, 30),
  ('kb-meats-5', 'INV-1016', 'kb', 'meats', '1001', 'BCM-30790', 5, 30),
  ('kb-dry-3', 'INV-1017', 'kb', 'dry', '1002', 'SDG-88540', 3, 30),
  ('kb-produce-2', 'INV-1018', 'kb', 'produce', null, null, 2, 20),
  ('cafe-coffee-27', 'INV-1019', 'cafe', 'coffee', null, 'KAHU-2207', 27, 20),
  ('cafe-dairy-25', 'INV-1020', 'cafe', 'dairy', null, 'LD-20990', 25, 20),
  ('cafe-coffee-15', 'INV-1021', 'cafe', 'coffee', null, 'KAHU-2231', 15, 20),
  ('cafe-dairy-13', 'INV-1022', 'cafe', 'dairy', null, 'LD-21102', 13, 20),
  ('cafe-dry-12', 'INV-1023', 'cafe', 'dry', null, 'SDG-88401', 12, 30),
  ('cafe-dairy-4', 'INV-1024', 'cafe', 'dairy', null, 'LD-21390', 4, 20),
  ('kb-dry-20', 'INV-1025', 'kb', 'dry', null, 'SDG-88240', 20, 30),
  ('kb-meats-19', 'INV-1026', 'kb', 'meats', null, 'BCM-30501', 19, 30),
  ('kb-produce-19', 'INV-1027', 'kb', 'produce', null, 'HF-77260', 19, 20),
  ('kb-wine-19', 'INV-1028', 'kb', 'wine', null, 'VD-11960', 19, 30),
  ('kb-fish-18', 'INV-1029', 'kb', 'fish', null, 'CF-5570', 18, 7),
  ('kb-dairy-18', 'INV-1030', 'kb', 'dairy', null, 'LD-21060', 18, 20),
  ('cafe-meats-26', 'INV-1031', 'cafe', 'meats', null, 'BCM-30420', 26, 30),
  ('cafe-produce-26', 'INV-1032', 'cafe', 'produce', null, 'HF-77125', 26, 20),
  ('cafe-dry-26', 'INV-1033', 'cafe', 'dry', null, 'SDG-88110', 26, 30),
  ('cafe-coffee-21', 'INV-1034', 'cafe', 'coffee', null, 'KAHU-2219', 21, 20),
  ('cafe-meats-19', 'INV-1035', 'cafe', 'meats', null, 'BCM-30507', 19, 30),
  ('cafe-produce-19', 'INV-1036', 'cafe', 'produce', null, 'HF-77266', 19, 20),
  ('cafe-dry-19', 'INV-1037', 'cafe', 'dry', null, 'SDG-88250', 19, 30),
  ('cafe-dairy-18', 'INV-1038', 'cafe', 'dairy', null, 'LD-21066', 18, 20),
  ('cafe-coffee-8', 'INV-1039', 'cafe', 'coffee', null, 'KAHU-2240', 8, 20),
  ('cafe-meats-5', 'INV-1040', 'cafe', 'meats', null, 'BCM-30795', 5, 30),
  ('cafe-produce-5', 'INV-1041', 'cafe', 'produce', null, 'HF-77480', 5, 20),
  ('cafe-dry-5', 'INV-1042', 'cafe', 'dry', null, 'SDG-88530', 5, 30)
) v(k, ref, ven, sup, po, no, ago, terms)
on conflict do nothing;

insert into invoice_lines (id, invoice_id, item_id, qty, unit_cost_cents)
select seed_uuid('invl:' || k || ':' || item), seed_uuid('inv:' || k), seed_uuid('item:' || item), qty, cost
from (values
  ('kb-dry-27', 'fries', 125, 310), ('kb-dry-27', 'buns', 192, 95), ('kb-dry-27', 'batter', 20, 420), ('kb-dry-27', 'oil', 40, 380), ('kb-dry-27', 'aioli', 6, 1100), ('kb-dry-27', 'sourdough', 30, 650),
  ('kb-meats-26', 'scotch', 25, 3850), ('kb-meats-26', 'mince', 25, 1450), ('kb-meats-26', 'bacon', 6, 1890),
  ('kb-fish-25', 'cod', 45, 4200),
  ('kb-produce-26', 'cos', 108, 220), ('kb-produce-26', 'tomato', 35, 650), ('kb-produce-26', 'lemon', 120, 45),
  ('kb-wine-26', 'pinot', 60, 1650), ('kb-wine-26', 'lager', 192, 245),
  ('kb-dairy-25', 'eggs', 180, 62), ('kb-dairy-25', 'butter', 10, 1450), ('kb-dairy-25', 'parmesan', 3, 3200), ('kb-dairy-25', 'milk', 40, 185),
  ('kb-dry-13', 'fries', 125, 310), ('kb-dry-13', 'buns', 192, 95), ('kb-dry-13', 'batter', 20, 420), ('kb-dry-13', 'oil', 40, 380), ('kb-dry-13', 'aioli', 6, 1100), ('kb-dry-13', 'sourdough', 30, 650),
  ('kb-meats-12', 'scotch', 10, 3850), ('kb-meats-12', 'mince', 15, 1450), ('kb-meats-12', 'bacon', 6, 1890),
  ('kb-produce-12', 'cos', 60, 220), ('kb-produce-12', 'tomato', 20, 650), ('kb-produce-12', 'lemon', 120, 45),
  ('kb-wine-12', 'pinot', 60, 1650), ('kb-wine-12', 'lager', 192, 245),
  ('kb-fish-11', 'cod', 30, 4200),
  ('kb-dairy-11', 'eggs', 180, 62), ('kb-dairy-11', 'butter', 10, 1450), ('kb-dairy-11', 'parmesan', 3, 3200), ('kb-dairy-11', 'milk', 40, 185),
  ('kb-meats-10', 'scotch', 15, 4550), ('kb-meats-10', 'mince', 10, 1450),
  ('kb-produce-9', 'cos', 48, 220), ('kb-produce-9', 'tomato', 15, 650),
  ('kb-fish-8', 'cod', 15, 4200),
  ('kb-meats-5', 'scotch', 10, 4550), ('kb-meats-5', 'mince', 10, 1450),
  ('kb-dry-3', 'fries', 75, 310), ('kb-dry-3', 'buns', 96, 95),
  ('kb-produce-2', 'cos', 36, 220), ('kb-produce-2', 'lemon', 80, 45),
  ('cafe-coffee-27', 'beans', 12, 3800),
  ('cafe-dairy-25', 'milk', 150, 185), ('cafe-dairy-25', 'eggs', 180, 62), ('cafe-dairy-25', 'butter', 4, 1450),
  ('cafe-coffee-15', 'beans', 12, 3800),
  ('cafe-dairy-13', 'milk', 150, 185), ('cafe-dairy-13', 'eggs', 180, 62),
  ('cafe-dry-12', 'sourdough', 40, 650), ('cafe-dry-12', 'cups', 1000, 18),
  ('cafe-dairy-4', 'milk', 120, 185), ('cafe-dairy-4', 'eggs', 90, 62),
  ('kb-dry-20', 'fries', 125, 310), ('kb-dry-20', 'buns', 192, 95), ('kb-dry-20', 'batter', 20, 420), ('kb-dry-20', 'oil', 40, 380), ('kb-dry-20', 'aioli', 6, 1100), ('kb-dry-20', 'sourdough', 30, 650),
  ('kb-meats-19', 'scotch', 25, 3850), ('kb-meats-19', 'mince', 25, 1450), ('kb-meats-19', 'bacon', 6, 1890),
  ('kb-produce-19', 'cos', 108, 220), ('kb-produce-19', 'tomato', 35, 650), ('kb-produce-19', 'lemon', 120, 45),
  ('kb-wine-19', 'pinot', 60, 1650), ('kb-wine-19', 'lager', 192, 245),
  ('kb-fish-18', 'cod', 45, 4200),
  ('kb-dairy-18', 'eggs', 180, 62), ('kb-dairy-18', 'butter', 10, 1450), ('kb-dairy-18', 'parmesan', 3, 3200), ('kb-dairy-18', 'milk', 40, 185),
  ('cafe-meats-26', 'bacon', 15, 1890), ('cafe-produce-26', 'tomato', 20, 650), ('cafe-produce-26', 'cos', 24, 220), ('cafe-dry-26', 'sourdough', 40, 650),
  ('cafe-coffee-21', 'beans', 12, 3800),
  ('cafe-meats-19', 'bacon', 15, 1890), ('cafe-produce-19', 'tomato', 20, 650), ('cafe-produce-19', 'cos', 24, 220), ('cafe-dry-19', 'sourdough', 40, 650),
  ('cafe-dairy-18', 'milk', 150, 185), ('cafe-dairy-18', 'eggs', 180, 62), ('cafe-dairy-18', 'butter', 8, 1450),
  ('cafe-coffee-8', 'beans', 12, 3800),
  ('cafe-meats-5', 'bacon', 15, 1890), ('cafe-produce-5', 'tomato', 20, 650), ('cafe-produce-5', 'cos', 24, 220), ('cafe-dry-5', 'sourdough', 40, 650)
) v(k, item, qty, cost)
on conflict do nothing;

-- Stock counts ---------------------------------------------------------------------
-- The Kitchen and Bar counts every Monday-ish: 14 and 7 days ago, both closed.
-- The Cafe's last closed count is 20 days old, and one opened 4 days ago was
-- never finished.

insert into stock_counts (id, ref, venue_id, counted_on, status, counted_by) values
  (seed_uuid('sc:1001'), 'SC-1001', seed_uuid('venue:kb'), current_date - 14, 'closed', 'Noah Griffin'),
  (seed_uuid('sc:1002'), 'SC-1002', seed_uuid('venue:kb'), current_date - 7, 'closed', 'Noah Griffin'),
  (seed_uuid('sc:1003'), 'SC-1003', seed_uuid('venue:cafe'), current_date - 20, 'closed', 'Jack Harmon'),
  (seed_uuid('sc:1004'), 'SC-1004', seed_uuid('venue:cafe'), current_date - 4, 'open', 'Jack Harmon')
on conflict do nothing;

insert into count_lines (id, count_id, item_id, qty)
select seed_uuid('cl:' || c || ':' || item), seed_uuid('sc:' || c), seed_uuid('item:' || item), qty
from (values
  ('1001', 'scotch', 8), ('1001', 'mince', 6), ('1001', 'bacon', 3), ('1001', 'cod', 4), ('1001', 'fries', 20), ('1001', 'buns', 40),
  ('1001', 'batter', 6), ('1001', 'oil', 15), ('1001', 'cos', 18), ('1001', 'tomato', 6), ('1001', 'lemon', 30), ('1001', 'parmesan', 1.5),
  ('1001', 'eggs', 60), ('1001', 'butter', 3), ('1001', 'sourdough', 6), ('1001', 'aioli', 2),
  ('1001', 'pinot', 30), ('1001', 'lager', 120), ('1001', 'milk', 10), ('1001', 'beans', 2),
  ('1002', 'scotch', 7), ('1002', 'mince', 6), ('1002', 'bacon', 3), ('1002', 'cod', 4), ('1002', 'fries', 20), ('1002', 'buns', 40),
  ('1002', 'batter', 6), ('1002', 'oil', 15), ('1002', 'cos', 18), ('1002', 'tomato', 6), ('1002', 'lemon', 30), ('1002', 'parmesan', 1.5),
  ('1002', 'eggs', 60), ('1002', 'butter', 3), ('1002', 'sourdough', 6), ('1002', 'aioli', 2),
  ('1002', 'pinot', 28), ('1002', 'lager', 110), ('1002', 'milk', 10), ('1002', 'beans', 2),
  ('1003', 'beans', 6), ('1003', 'milk', 30), ('1003', 'eggs', 90), ('1003', 'sourdough', 10), ('1003', 'bacon', 4),
  ('1003', 'butter', 3), ('1003', 'cups', 800),
  ('1004', 'beans', 5), ('1004', 'milk', 24)
) v(c, item, qty)
on conflict do nothing;

-- Waste ----------------------------------------------------------------------------

insert into waste (id, venue_id, item_id, qty, reason, on_date, recorded_by) values
  (seed_uuid('waste:1'), seed_uuid('venue:kb'), seed_uuid('item:scotch'), 1.5, 'spoiled', current_date - 4, 'Ben Tuilagi'),
  (seed_uuid('waste:2'), seed_uuid('venue:kb'), seed_uuid('item:cod'), 1, 'spoiled', current_date - 3, 'Mei Chen'),
  (seed_uuid('waste:3'), seed_uuid('venue:kb'), seed_uuid('item:fries'), 2, 'dropped', current_date - 2, 'Tom Reid'),
  (seed_uuid('waste:4'), seed_uuid('venue:cafe'), seed_uuid('item:milk'), 4, 'spoiled', current_date - 2, 'Emma Walsh')
on conflict do nothing;

-- Recipes --------------------------------------------------------------------------
-- Menu prices are what the customer pays, GST inclusive.

insert into recipes (id, name, category, menu_price_cents, portions, note) values
  (seed_uuid('rec:scotch'), 'Scotch fillet 300g', 'food', 5400, 1, 'With fries, cos and tomato'),
  (seed_uuid('rec:fish'), 'Fish and chips', 'food', 3400, 1, null),
  (seed_uuid('rec:burger'), 'Cheeseburger', 'food', 2800, 1, null),
  (seed_uuid('rec:caesar'), 'Caesar salad', 'food', 2400, 1, null),
  (seed_uuid('rec:truffle'), 'Truffle fries', 'food', 1600, 1, null),
  (seed_uuid('rec:benedict'), 'Eggs benedict', 'food', 2600, 1, 'Cafe'),
  (seed_uuid('rec:flatwhite'), 'Flat white', 'beverage', 600, 1, 'Cafe'),
  (seed_uuid('rec:pinot'), 'Pinot gris 150ml', 'beverage', 1600, 1, 'Five glasses a bottle'),
  (seed_uuid('rec:lager'), 'Craft lager', 'beverage', 1200, 1, null)
on conflict do nothing;

insert into recipe_lines (id, recipe_id, item_id, qty)
select seed_uuid('rl:' || r || ':' || item), seed_uuid('rec:' || r), seed_uuid('item:' || item), qty
from (values
  ('scotch', 'scotch', 0.3), ('scotch', 'fries', 0.2), ('scotch', 'butter', 0.03), ('scotch', 'tomato', 0.1), ('scotch', 'cos', 0.25),
  ('fish', 'cod', 0.16), ('fish', 'batter', 0.05), ('fish', 'fries', 0.25), ('fish', 'lemon', 1), ('fish', 'oil', 0.05), ('fish', 'aioli', 0.03),
  ('burger', 'mince', 0.18), ('burger', 'buns', 1), ('burger', 'bacon', 0.04), ('burger', 'fries', 0.2), ('burger', 'cos', 0.1), ('burger', 'tomato', 0.05), ('burger', 'aioli', 0.02),
  ('caesar', 'cos', 1), ('caesar', 'bacon', 0.06), ('caesar', 'parmesan', 0.03), ('caesar', 'eggs', 1), ('caesar', 'sourdough', 0.1),
  ('truffle', 'fries', 0.3), ('truffle', 'truffle', 0.01), ('truffle', 'parmesan', 0.02),
  ('benedict', 'eggs', 2), ('benedict', 'sourdough', 0.15), ('benedict', 'bacon', 0.08), ('benedict', 'butter', 0.04),
  ('flatwhite', 'beans', 0.018), ('flatwhite', 'milk', 0.2), ('flatwhite', 'cups', 1),
  ('pinot', 'pinot', 0.2),
  ('lager', 'lager', 1)
) v(r, item, qty)
on conflict do nothing;

-- File notes -----------------------------------------------------------------------

insert into file_notes (id, subject, body, author, created_at) values
  (seed_uuid('note:1'), 'Bay City Meats', 'Rep says scotch fillet up again next month. Asked for a price on ribeye as an alternative.', 'Noah Griffin', now() - interval '9 days'),
  (seed_uuid('note:2'), 'Tidewater Cafe', 'Council says the Harbour Street roadworks run another three weeks.', 'Emma Walsh', now() - interval '5 days')
on conflict do nothing;

drop function if exists seed_pattern();
