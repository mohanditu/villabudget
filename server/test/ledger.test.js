import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLedger, leaveCreditEstimate, roundTo } from '../src/lib/ledger.js';
import { cycleRange, nextCycleKey, cycleKeyOf } from '../src/lib/dates.js';

const settings = {
  startMonth: '2026-11-01', collectionAmount: 100, roundDecimals: 2, minLeaveDays: 1,
  openingCash: 1700, openingDigital: 0,
};
const vinay = { _id: 'v', name: 'Vinay', openingBalance: 0 };
const mohan = { _id: 'm', name: 'Mohan', openingBalance: 0 };
const vinayLeave = { member: 'v', startDate: '2026-11-01', endDate: '2026-11-15' };

const row = (ledger, key, id) => ledger.cycles.find((c) => c.key === key).rows.find((r) => r.member === id);

test('cycle boundaries', () => {
  assert.deepEqual([cycleRange('2026-11-01').days, cycleRange('2026-11-15').days], [14, 16]);
  assert.equal(cycleRange('2027-02-15').days, 14);
  assert.equal(cycleRange('2026-12-15').days, 17);
  assert.equal(nextCycleKey('2026-12-15'), '2027-01-01');
  assert.equal(cycleKeyOf('2026-11-14'), '2026-11-01');
  assert.equal(cycleKeyOf('2026-11-15'), '2026-11-15');
});

test('Vinay on leave 1–15 Nov, did not pay on 1 Nov', () => {
  const l = computeLedger({ settings, members: [vinay, mohan], leaves: [vinayLeave], today: '2026-11-20' });
  const a = row(l, '2026-11-01', 'v');
  assert.equal(a.leaveDays, 14);
  assert.equal(a.due, 100);
  assert.equal(a.leaveCredit, 100);
  assert.equal(a.netPayable, 0);
  const b = row(l, '2026-11-15', 'v');
  assert.equal(b.leaveDays, 1);
  assert.equal(b.leaveCredit, 6.25);
  assert.equal(b.netPayable, 93.75);
  assert.equal(row(l, '2026-11-15', 'm').netPayable, 200); // Mohan has not paid 1 Nov either
});

test('Vinay paid 100 on 1 Nov before the leave was recorded → advance deducted next cycle', () => {
  const payments = [{ member: 'v', cycle: '2026-11-01', mode: 'Cash', amount: 100 }];
  const l = computeLedger({ settings, members: [vinay], leaves: [vinayLeave], payments, today: '2026-11-20', untilKey: '2026-12-01' });
  assert.equal(row(l, '2026-11-01', 'v').balance, -100);
  assert.equal(row(l, '2026-11-15', 'v').netPayable, -6.25);
  assert.equal(row(l, '2026-12-01', 'v').netPayable, 93.75); // 100 − 6.25 carried
});

test('villa balance: opening 1,700, grocery 1,154, 17 members pay 100 each on 1 Nov', () => {
  const members = Array.from({ length: 18 }, (_, i) => ({ _id: `m${i}`, name: `M${i}`, openingBalance: 0 }));
  const payments = members.slice(1).map((m, i) => ({ member: m._id, cycle: '2026-11-01', mode: i < 10 ? 'Cash' : 'Digital', amount: 100 }));
  const leaves = [{ member: 'm0', startDate: '2026-11-01', endDate: '2026-11-15' }];
  const expenses = [{ date: '2026-11-01', category: 'Grocery', paidFrom: 'Cash', amount: 1154 }];
  const l = computeLedger({ settings, members, leaves, payments, expenses, today: '2026-11-20' });
  const f = l.cycles[0].fund;
  assert.equal(f.closingCash, 1700 + 1000 - 1154);
  assert.equal(f.closingDigital, 700);
  assert.equal(f.closingTotal, 2246);
  assert.equal(l.cycles[1].fund.openingCash, 1546); // carried forward
  assert.equal(l.cycles[1].summary.dueAfterCredits, 17 * 100 + 93.75);
});

test('join and exit mid-cycle are charged per day; rounding setting applies', () => {
  const joiner = { _id: 'j', name: 'J', joinDate: '2026-11-20', openingBalance: 0 };
  const leaver = { _id: 'x', name: 'X', exitDate: '2026-11-07', openingBalance: 0 };
  const l = computeLedger({ settings, members: [joiner, leaver], today: '2026-11-20' });
  assert.equal(row(l, '2026-11-01', 'j').due, 0);
  assert.equal(row(l, '2026-11-15', 'j').due, roundTo((100 * 11) / 16, 2)); // 20–30 Nov = 11 days → 68.75
  assert.equal(row(l, '2026-11-01', 'x').due, 50); // 1–7 Nov = 7 of 14 days
  assert.equal(row(l, '2026-11-15', 'x').due, 0);
  const l0 = computeLedger({ settings: { ...settings, roundDecimals: 0 }, members: [joiner], today: '2026-11-20' });
  assert.equal(row(l0, '2026-11-15', 'j').due, 69);
});

test('minimum leave days and transfers', () => {
  const s = { ...settings, minLeaveDays: 3 };
  const short = { member: 'm', startDate: '2026-11-03', endDate: '2026-11-04' };
  const l = computeLedger({
    settings: s, members: [mohan], leaves: [short], today: '2026-11-20',
    transfers: [{ date: '2026-11-05', direction: 'Cash to Digital', amount: 500 }],
  });
  assert.equal(row(l, '2026-11-01', 'm').leaveCredit, 0);
  assert.equal(leaveCreditEstimate(short, s), 0);
  assert.equal(l.cycles[0].fund.closingCash, 1200);
  assert.equal(l.cycles[0].fund.closingDigital, 500);
  assert.equal(leaveCreditEstimate(vinayLeave, settings), 106.25);
});

// ---------------------------------------------------------------------------------------------
// Daily-rate rule: the snapshot imported from the villa's Google Sheet must reproduce the sheet's
// own Nov-26 tab to the fils (values copied from the sheet on 2026-11-20).
import { readFileSync } from 'node:fs';

test('Google Sheet snapshot reproduces the Nov-26 tab exactly (daily-rate rule)', () => {
  const snap = JSON.parse(readFileSync(new URL('../data/google-sheet-snapshot.json', import.meta.url)));
  const members = snap.members.map((m, i) => ({ _id: `m${i + 1}`, ...m }));
  const idByName = Object.fromEntries(members.map((m) => [m.name, m._id]));
  const ref = (x) => ({ ...x, member: idByName[x.member] });
  const l = computeLedger({
    settings: snap.settings, members, today: '2026-11-20',
    leaves: snap.leaves.map(ref), payments: snap.payments.map(ref), expenses: snap.expenses, transfers: snap.transfers,
  });
  const cyc = (k) => l.cycles.find((c) => c.key === k);
  const r = (k, name) => cyc(k).rows.find((x) => x.member === idByName[name]);

  // BALANCE SUMMARY block of the sheet
  assert.deepEqual([cyc('2026-11-01').fund.closingCash, cyc('2026-11-01').fund.closingDigital], [463.5, 0]);
  assert.deepEqual([cyc('2026-11-15').fund.collectionsCash, cyc('2026-11-15').fund.collectionsDigital], [200, 700]);
  assert.deepEqual([cyc('2026-11-15').fund.expensesCash, cyc('2026-11-15').fund.expensesDigital], [695, 712.14]);
  assert.deepEqual([cyc('2026-11-15').fund.closingCash, cyc('2026-11-15').fund.closingDigital, cyc('2026-11-15').fund.closingTotal], [-31.5, -12.14, -43.64]);
  // COLLECTION STATUS block
  assert.deepEqual([cyc('2026-11-01').summary.leaveCredits, cyc('2026-11-15').summary.leaveCredits], [114.46, 148.66]);
  assert.deepEqual([cyc('2026-11-01').summary.pending, cyc('2026-11-15').summary.pending], [0, 238.18]);
  assert.deepEqual([cyc('2026-11-01').summary.advance, cyc('2026-11-15').summary.advance], [189.46, 76.3]);
  // member rows (Leave Credit / Net Payable / Balance columns)
  assert.deepEqual([r('2026-11-01', 'Sundar Sharma').leaveCredit, r('2026-11-15', 'Sundar Sharma').leaveCredit], [14.46, 80.26]);
  assert.equal(r('2026-11-15', 'Sundar Sharma').balance, 5.28);
  assert.deepEqual([r('2026-11-15', 'Siddhant Tayade').leaveCredit, r('2026-11-15', 'Siddhant Tayade').balance], [67.1, 32.9]);
  assert.deepEqual([r('2026-11-15', 'Vinay Kharayat').netPayable, r('2026-11-15', 'Vinay Kharayat').balance], [98.7, -1.3]);
  assert.deepEqual([r('2026-11-15', 'Vishnu Kaldate').netPayable, r('2026-11-15', 'Vishnu Kaldate').balance], [-25, -25]);
  assert.equal(r('2026-11-15', 'Sajid Ali').balance, -50);
  assert.equal(r('2026-11-15', 'Mohseen Sheikh').balance, 100);
  assert.equal(r('2026-11-15', 'Vijay Manchekar').balance, 100);
});

test('daily-rate rule: 17-day cycle with 1 day away gives no credit (capped at 100), estimate per leave', () => {
  const s = { ...settings, leaveMethod: 'dailyRate', dailyRate: 6.58, openingCash: 0 };
  const l = computeLedger({ settings: s, members: [vinay], leaves: [{ member: 'v', startDate: '2026-12-20', endDate: '2026-12-20' }], today: '2026-12-20' });
  assert.equal(row(l, '2026-12-15', 'v').leaveCredit, 0);          // 16 × 6.58 = 105.28 → MIN(100, …) = 100
  assert.equal(leaveCreditEstimate(vinayLeave, s), 101.3);         // 100 (1st cycle) + 1.30 (15th cycle)
});

// ---------------------------------------------------------------------------------------------
// Collection amount changes per cycle
import { collectionInfo } from '../src/lib/ledger.js';

test('collection amount: "only this cycle" and "this and later cycles"', () => {
  const s = {
    ...settings, openingCash: 0,
    amountChanges: [
      { cycle: '2026-11-15', amount: 150, scope: 'once', note: 'Diwali dinner' },
      { cycle: '2026-12-15', amount: 120, scope: 'onward' },
      { cycle: '2027-01-15', amount: 0, scope: 'once' },
    ],
  };
  const l = computeLedger({ settings: s, members: [mohan], today: '2027-02-01' });
  const amount = (k) => l.cycles.find((c) => c.key === k).collectionAmount;
  assert.deepEqual(
    ['2026-11-01', '2026-11-15', '2026-12-01', '2026-12-15', '2027-01-01', '2027-01-15', '2027-02-01'].map(amount),
    [100, 150, 100, 120, 120, 0, 120],
  );
  assert.equal(row(l, '2026-11-15', 'm').due, 150);
  assert.equal(row(l, '2027-02-01', 'm').netPayable, 100 + 150 + 100 + 120 + 120 + 0 + 120); // nothing paid yet
  // what "Reset" would go back to
  assert.deepEqual(collectionInfo(s, '2026-12-15').fallback, 100);
  assert.deepEqual(collectionInfo(s, '2027-01-15').fallback, 120);
  assert.equal(collectionInfo(s, '2027-01-01').own, false);
  assert.equal(collectionInfo(s, '2027-01-01').rule.cycle, '2026-12-15');
});

test('collection amount change scales the daily rate (Google Sheet rule) and leave credits', () => {
  const s = { ...settings, openingCash: 0, leaveMethod: 'dailyRate', dailyRate: 6.58, amountChanges: [{ cycle: '2026-11-15', amount: 150, scope: 'onward' }] };
  const l = computeLedger({ settings: s, members: [vinay], leaves: [vinayLeave], today: '2026-11-20' });
  const c = l.cycles.find((x) => x.key === '2026-11-15');
  assert.equal(c.dailyRate, 9.87);                                    // ROUND(150 × 6.58 ÷ 100, 2)
  assert.equal(row(l, '2026-11-15', 'v').netDue, 148.05);              // 15 days × 9.87
  assert.equal(row(l, '2026-11-15', 'v').leaveCredit, 1.95);
  assert.equal(leaveCreditEstimate(vinayLeave, s), 101.95);            // 100 (1st cycle at 100) + 1.95
  // pro-rata scales naturally
  const p = computeLedger({ settings: { ...s, leaveMethod: 'prorata' }, members: [vinay], leaves: [vinayLeave], today: '2026-11-20' });
  assert.equal(row(p, '2026-11-15', 'v').netDue, 140.63);             // 150 × 15 ÷ 16 = 140.625
});
