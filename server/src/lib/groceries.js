// Grocery items. One shopping trip is one Grocery expense (it is what moves the Cash / Digital
// funds); its `items` list says what was bought: name, quantity, unit and the price paid.
// This file checks those items and builds each item's price history. Pure – no database access.

export const UNITS = ['pcs', 'kg', 'g', 'L', 'ml', 'pack', 'dozen', 'bundle', 'bottle', 'box', 'bag', 'tray'];
export const MAX_ITEMS_PER_EXPENSE = 200;
const MAX_NAME = 80;

// Prices are compared in a base unit, so 500 g for 4 AED and 1 kg for 8 AED are the same price.
export const BASE_UNITS = { g: ['kg', 0.001], ml: ['L', 0.001], dozen: ['pcs', 12] };

const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
const fail = (message) => Object.assign(new Error(message), { status: 400 });
const tidy = (name) => String(name ?? '').trim().replace(/\s+/g, ' ');

/** Items with the same name in any letter case are the same item ("Onion" = "onion "). */
export const itemKey = (name) => tidy(name).toLowerCase();

export function toBase(qty, unit) {
  const [baseUnit, factor] = BASE_UNITS[unit] ?? [unit, 1];
  return { qty: qty * factor, unit: baseUnit };
}

/** Checks the items sent by the browser; returns clean items or throws an error with status 400. */
export function cleanItems(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw fail('Items must be a list');
  if (raw.length > MAX_ITEMS_PER_EXPENSE) throw fail(`A purchase can have at most ${MAX_ITEMS_PER_EXPENSE} items`);
  return raw.map((it, i) => {
    const name = tidy(it?.name);
    if (!name) throw fail(`Item ${i + 1}: enter the item name`);
    if (name.length > MAX_NAME) throw fail(`Item ${i + 1}: the name is longer than ${MAX_NAME} characters`);
    const qty = round(Number(it.qty), 3);
    if (it.qty === '' || it.qty == null || !(qty > 0)) throw fail(`${name}: the quantity must be more than 0`);
    const unit = it.unit || 'pcs';
    if (!UNITS.includes(unit)) throw fail(`${name}: unknown unit "${unit}"`);
    const price = Number(it.price);
    if (it.price === '' || it.price == null || !Number.isFinite(price) || price < 0) throw fail(`${name}: enter the price (0 or more)`);
    return { name, qty, unit, price: round(price, 2) };
  });
}

// ---------------------------------------------------------------- products (the list of things we buy)
/** Suggested product categories; categories already used are added to these. */
export const PRODUCT_CATEGORIES = ['Vegetables', 'Fruits', 'Dairy & Eggs', 'Rice, Flour & Grains', 'Pulses & Lentils', 'Spices & Masala',
  'Oil & Ghee', 'Bakery', 'Meat & Fish', 'Drinks', 'Snacks', 'Cleaning & Household', 'Other'];

/** Checks a product sent by the browser; returns { name, key, category, unit, notes } or throws (status 400). */
export function cleanProduct(raw) {
  const name = tidy(raw?.name);
  if (!name) throw fail('Enter the product name');
  if (name.length > MAX_NAME) throw fail(`The name is longer than ${MAX_NAME} characters`);
  const unit = raw.unit || 'pcs';
  if (!UNITS.includes(unit)) throw fail(`Unknown unit "${unit}"`);
  const category = tidy(raw.category);
  if (category.length > 40) throw fail('The category is longer than 40 characters');
  const notes = String(raw.notes ?? '').trim();
  if (notes.length > 200) throw fail('The notes are longer than 200 characters');
  return { name, key: itemKey(name), category, unit, notes };
}

/** Matches an item name exactly, ignoring letter case (names are stored tidied, so spaces already match). */
export const sameNameRegExp = (name) => new RegExp(`^${tidy(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

const time = (d) => (d ? new Date(d).getTime() : 0);

/**
 * One row per item ever bought, newest purchase first:
 * how often, total spent, the latest purchase, price per base unit (latest, previous, lowest,
 * highest, average) and the full history. Unit-price figures only use purchases in the same
 * base unit as the latest one, so "1 pack" and "2 kg" of the same item are never mixed.
 */
export function summarizeItems(purchases) {
  const sorted = [...purchases].sort((a, b) => a.date.localeCompare(b.date) || time(a.createdAt) - time(b.createdAt));
  const byKey = new Map();
  for (const p of sorted) {
    for (const it of p.items ?? []) {
      const key = itemKey(it.name);
      if (!key || !(it.qty > 0)) continue;
      const base = toBase(it.qty, it.unit);
      if (!byKey.has(key)) byKey.set(key, { key, name: it.name, entries: [] });
      const rec = byKey.get(key);
      rec.name = it.name; // the latest spelling is shown
      rec.entries.push({
        expenseId: String(p._id), date: p.date, shop: p.description ?? '', paidBy: p.paidBy ?? '',
        qty: it.qty, unit: it.unit, price: it.price, baseUnit: base.unit, unitPrice: it.price / base.qty,
      });
    }
  }

  return [...byKey.values()].map(({ key, name, entries }) => {
    const last = entries.at(-1);
    const same = entries.filter((e) => e.baseUnit === last.baseUnit);
    const qty = same.reduce((s, e) => s + toBase(e.qty, e.unit).qty, 0);
    const spentSame = same.reduce((s, e) => s + e.price, 0);
    const prev = same.at(-2);
    // the latest purchase wins a tie, so "lowest" points at the most recent cheap buy
    const cheapest = same.reduce((best, e) => (e.unitPrice <= best.unitPrice ? e : best));
    const dearest = same.reduce((best, e) => (e.unitPrice >= best.unitPrice ? e : best));
    const out = (e) => ({ ...e, unitPrice: round(e.unitPrice, 2) });
    return {
      key,
      name,
      timesBought: entries.length,
      totalSpent: round(entries.reduce((s, e) => s + e.price, 0), 2),
      lastDate: last.date,
      unit: last.baseUnit,
      totalQty: round(qty, 3),
      last: out(last),
      unitPrice: round(last.unitPrice, 2),
      prevUnitPrice: prev ? round(prev.unitPrice, 2) : null,
      change: prev && prev.unitPrice > 0 ? round((last.unitPrice - prev.unitPrice) / prev.unitPrice, 4) : null,
      minUnitPrice: round(cheapest.unitPrice, 2),
      maxUnitPrice: round(dearest.unitPrice, 2),
      avgUnitPrice: round(spentSame / qty, 2),
      cheapest: out(cheapest),
      history: entries.map(out).reverse(),
    };
  }).sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name));
}
