import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanItems, summarizeItems, toBase, itemKey, cleanProduct, sameNameRegExp } from '../src/lib/groceries.js';
import { Expense } from '../src/models/index.js';

const trip = (id, date, description, items, extra = {}) => ({ _id: id, date, description, paidBy: 'Vijay', items, ...extra });

test('cleanItems tidies names, defaults the unit and rounds numbers', () => {
  assert.deepEqual(
    cleanItems([{ name: '  Onion   red ', qty: '2', unit: 'kg', price: '6.005' }, { name: 'Curd', qty: 1, price: 10 }]),
    [{ name: 'Onion red', qty: 2, unit: 'kg', price: 6.01 }, { name: 'Curd', qty: 1, unit: 'pcs', price: 10 }],
  );
  assert.deepEqual(cleanItems(undefined), []);
  assert.deepEqual(cleanItems(null), []);
});

test('cleanItems rejects bad rows with a message naming the item', () => {
  const err = (items) => { try { cleanItems(items); } catch (e) { return [e.status, e.message]; } return null; };
  assert.deepEqual(err([{ name: '', qty: 1, price: 1 }]), [400, 'Item 1: enter the item name']);
  assert.deepEqual(err([{ name: 'Rice', qty: 0, price: 1 }]), [400, 'Rice: the quantity must be more than 0']);
  assert.deepEqual(err([{ name: 'Rice', qty: '', price: 1 }]), [400, 'Rice: the quantity must be more than 0']);
  assert.deepEqual(err([{ name: 'Rice', qty: 0.0001, price: 1 }]), [400, 'Rice: the quantity must be more than 0']);
  assert.deepEqual(err([{ name: 'Rice', qty: 1, unit: 'sack', price: 1 }]), [400, 'Rice: unknown unit "sack"']);
  assert.deepEqual(err([{ name: 'Rice', qty: 1, price: '' }]), [400, 'Rice: enter the price (0 or more)']);
  assert.deepEqual(err([{ name: 'Rice', qty: 1, price: -2 }]), [400, 'Rice: enter the price (0 or more)']);
  assert.deepEqual(err([{ name: 'Rice', qty: 1, price: 'abc' }]), [400, 'Rice: enter the price (0 or more)']);
  assert.deepEqual(err('Rice'), [400, 'Items must be a list']);
  assert.equal(err(Array.from({ length: 201 }, () => ({ name: 'x', qty: 1, price: 1 })))[0], 400);
  assert.equal(err([{ name: 'Free sample', qty: 1, price: 0 }]), null);
});

test('units are compared in a base unit', () => {
  assert.deepEqual(toBase(500, 'g'), { qty: 0.5, unit: 'kg' });
  assert.deepEqual(toBase(250, 'ml'), { qty: 0.25, unit: 'L' });
  assert.deepEqual(toBase(2, 'dozen'), { qty: 24, unit: 'pcs' });
  assert.deepEqual(toBase(3, 'pack'), { qty: 3, unit: 'pack' });
  assert.equal(itemKey('  Basmati  RICE '), 'basmati rice');
});

test('summarizeItems: price history, latest / lowest / highest / average price per kg', () => {
  const items = summarizeItems([
    // given newest first, as the API returns them
    trip('c', '2026-11-19', 'Nesto', [{ name: 'onion', qty: 3, unit: 'kg', price: 10.5 }]),
    trip('b', '2026-11-08', 'Noor', [{ name: 'Onion', qty: 500, unit: 'g', price: 1.25 }, { name: 'Curd', qty: 1, unit: 'pcs', price: 10 }]),
    trip('a', '2026-11-04', 'Nesto', [{ name: 'Onion', qty: 2, unit: 'kg', price: 6 }]),
  ]);
  assert.deepEqual(items.map((i) => i.name), ['onion', 'Curd']); // newest first; latest spelling
  const onion = items[0];
  assert.equal(onion.timesBought, 3);
  assert.equal(onion.totalSpent, 17.75);
  assert.equal(onion.totalQty, 5.5);
  assert.equal(onion.unit, 'kg');
  assert.equal(onion.lastDate, '2026-11-19');
  assert.equal(onion.unitPrice, 3.5);      // 10.50 / 3 kg
  assert.equal(onion.prevUnitPrice, 2.5);  // 1.25 / 0.5 kg
  assert.equal(onion.change, 0.4);         // 40 % dearer than last time
  assert.equal(onion.minUnitPrice, 2.5);
  assert.equal(onion.maxUnitPrice, 3.5);
  assert.equal(onion.avgUnitPrice, 3.23);  // 17.75 / 5.5 kg
  assert.deepEqual([onion.cheapest.date, onion.cheapest.shop], ['2026-11-08', 'Noor']);
  assert.deepEqual(onion.history.map((h) => [h.date, h.expenseId, h.unitPrice]), [['2026-11-19', 'c', 3.5], ['2026-11-08', 'b', 2.5], ['2026-11-04', 'a', 3]]);

  const curd = items[1];
  assert.equal(curd.change, null);
  assert.equal(curd.prevUnitPrice, null);
  assert.equal(curd.unitPrice, 10);
});

test('summarizeItems: unit-price figures ignore purchases in another base unit', () => {
  const [rice] = summarizeItems([
    trip('a', '2026-11-01', '', [{ name: 'Rice', qty: 1, unit: 'pack', price: 40 }]),
    trip('b', '2026-11-10', '', [{ name: 'Rice', qty: 5, unit: 'kg', price: 30 }]),
  ]);
  assert.equal(rice.timesBought, 2);
  assert.equal(rice.totalSpent, 70);
  assert.equal(rice.unit, 'kg');
  assert.equal(rice.totalQty, 5);
  assert.equal(rice.unitPrice, 6);
  assert.equal(rice.prevUnitPrice, null);
  assert.equal(rice.minUnitPrice, 6);
  assert.equal(rice.history[1].baseUnit, 'pack');
});

test('summarizeItems: same date is ordered by when the purchase was entered; untidy items are skipped', () => {
  const [milk] = summarizeItems([
    trip('late', '2026-11-05', '', [{ name: 'Milk', qty: 1, unit: 'L', price: 7 }], { createdAt: new Date('2026-11-05T18:00:00Z') }),
    trip('early', '2026-11-05', '', [{ name: 'Milk', qty: 1, unit: 'L', price: 6 }, { name: ' ', qty: 1, price: 1 }, { name: 'Bad', qty: 0, price: 1 }], { createdAt: new Date('2026-11-05T08:00:00Z') }),
  ]);
  assert.equal(milk.last.expenseId, 'late');
  assert.equal(milk.change, 0.1667);
  assert.deepEqual(summarizeItems([trip('x', '2026-11-01', '', [])]), []);
  assert.deepEqual(summarizeItems([{ _id: 'y', date: '2026-11-01' }]), []); // older expense without items
});

test('Expense schema accepts items and rejects bad ones', async () => {
  const base = { date: '2026-11-20', category: 'Grocery', paidFrom: 'Cash', amount: 16 };
  const ok = new Expense({ ...base, items: [{ name: 'Onion', qty: 2, unit: 'kg', price: 6.004 }] });
  await ok.validate();
  assert.equal(ok.items[0].price, 6);
  assert.equal(new Expense(base).items.length, 0);
  await assert.rejects(new Expense({ ...base, items: [{ name: 'Onion', qty: 2, unit: 'sack', price: 6 }] }).validate());
  await assert.rejects(new Expense({ ...base, items: [{ name: 'Onion', qty: 0, price: 6 }] }).validate());
  await assert.rejects(new Expense({ ...base, items: [{ name: '', qty: 1, price: 6 }] }).validate());
});

test('cleanProduct tidies the name and builds the matching key', () => {
  assert.deepEqual(cleanProduct({ name: '  Basmati   Rice ', category: ' Rice, Flour & Grains ', unit: 'kg', notes: ' 5 kg bag ' }),
    { name: 'Basmati Rice', key: 'basmati rice', category: 'Rice, Flour & Grains', unit: 'kg', notes: '5 kg bag' });
  assert.deepEqual(cleanProduct({ name: 'Eggs' }), { name: 'Eggs', key: 'eggs', category: '', unit: 'pcs', notes: '' });
  const err = (p) => { try { cleanProduct(p); } catch (e) { return [e.status, e.message]; } return null; };
  assert.deepEqual(err({ name: '  ' }), [400, 'Enter the product name']);
  assert.deepEqual(err({ name: 'Rice', unit: 'sack' }), [400, 'Unknown unit "sack"']);
  assert.deepEqual(err({ name: 'x'.repeat(81) }), [400, 'The name is longer than 80 characters']);
  assert.deepEqual(err({ name: 'Rice', category: 'c'.repeat(41) }), [400, 'The category is longer than 40 characters']);
});

test('sameNameRegExp matches the whole name in any case and escapes special characters', () => {
  assert.ok(sameNameRegExp('Onion').test('onion'));
  assert.ok(!sameNameRegExp('Onion').test('Onion red'));
  assert.ok(sameNameRegExp(' Dal (toor) ').test('DAL (TOOR)'));
  assert.ok(!sameNameRegExp('Rice.').test('Rice1'));
});
