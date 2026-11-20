// Villa budget calculation engine (pure – no database access).
//
// Rules:
//   memberDays  = days of the cycle inside the member's Join → Exit window
//   leaveDays   = days of the cycle (inside memberDays) covered by an eligible leave
//   presentDays = memberDays − leaveDays
//   due         = charge(memberDays)      netDue = charge(presentDays)      (charge: see makeCharge)
//   leaveCredit = due − netDue
//   netPayable  = broughtForward + netDue
//   balance     = netPayable − paidCash − paidDigital      (negative = advance, deducted next cycle automatically)
//   Fund closing (per Cash / Digital) = opening + collections − expenses ± transfers

import { toDayNum, cycleKeyOf, cycleRange, listCycleKeys } from './dates.js';

export function roundTo(x, decimals = 2) {
  const f = 10 ** decimals;
  return (Math.sign(x) * Math.round(Math.abs(x) * f + 1e-9)) / f;
}
const r2 = (x) => roundTo(x, 2);
const idOf = (doc) => String(doc._id ?? doc.id);

/**
 * Collection amount that applies to one cycle. settings.amountChanges holds entries
 * { cycle: 'YYYY-MM-01' | 'YYYY-MM-15', amount, scope, note }:
 *   scope 'onward' – from that cycle until the next 'onward' change (like the Google Sheet's
 *                    "Collection amount changes" table)
 *   scope 'once'   – only that cycle; the cycles after it keep whatever applied before
 * Without any entry the standard settings.collectionAmount applies.
 * Returns { amount, rule (the entry that decided it, or null), own (this cycle has its own entry),
 *           fallback (the amount this cycle would have without its own entry) }.
 */
export function collectionInfo(settings, key) {
  const base = Number(settings.collectionAmount);
  const changes = settings.amountChanges ?? [];
  const latestOnward = (exclude) => changes
    .filter((c) => c.scope === 'onward' && c.cycle <= key && c.cycle !== exclude)
    .sort((a, b) => (a.cycle < b.cycle ? -1 : 1)).at(-1);
  const own = changes.find((c) => c.cycle === key) ?? null;
  const rule = (own?.scope === 'once' ? own : latestOnward(null)) ?? null;
  const fallbackRule = latestOnward(key);
  return {
    amount: rule ? Number(rule.amount) : base,
    rule: rule && { cycle: rule.cycle, scope: rule.scope, amount: Number(rule.amount), note: rule.note ?? '' },
    own: Boolean(own),
    fallback: fallbackRule ? Number(fallbackRule.amount) : base,
  };
}

/** Daily rate for a cycle whose collection is C: scaled from the standard rate, ROUND(C × rate ÷ standard, 2) – as in the sheet. */
export function cycleDailyRate(settings, C) {
  const base = Number(settings.collectionAmount);
  return r2(base > 0 ? (Number(settings.dailyRate) * C) / base : Number(settings.dailyRate));
}

/**
 * Returns charge(days, cycleDays): what a member pays for `days` days of a cycle whose collection is C.
 *  - 'prorata'   : ROUND(collection × days ÷ cycleDays, roundDecimals)            (Villa_Monthly_Budget_v2.xlsx)
 *  - 'dailyRate' : 0 days → 0 · whole cycle → collection · otherwise MIN(collection, ROUND(days × dailyRate, 2))
 *                  (exactly the formula of the villa's Google Sheet month tabs, daily rate 6.58 = 100 × 24 ÷ 365)
 */
export function makeCharge(settings, C = Number(settings.collectionAmount)) {
  if (settings.leaveMethod === 'dailyRate') {
    const rate = cycleDailyRate(settings, C);
    return (days, cycleDays) => (days <= 0 ? 0 : days >= cycleDays ? C : Math.min(C, r2(days * rate)));
  }
  const rd = Number(settings.roundDecimals ?? 2);
  return (days, cycleDays) => roundTo((C * days) / cycleDays, rd);
}

export function leaveDayCount(leave) {
  return toDayNum(leave.endDate) - toDayNum(leave.startDate) + 1;
}

export function memberStatus(member, leaves, today) {
  if (member.exitDate && member.exitDate < today) return 'Left';
  if (member.joinDate && member.joinDate > today) return 'Upcoming';
  const onLeave = leaves.some((l) => String(l.member) === idOf(member) && l.startDate <= today && l.endDate >= today);
  return onLeave ? 'On Leave' : 'Active';
}

/**
 * Compute every cycle from the start month until `untilKey` (default: the later of today's cycle
 * and the latest cycle that has any payment / expense / transfer).
 */
export function computeLedger({ settings, members, leaves = [], payments = [], expenses = [], transfers = [], today, untilKey }) {
  const minDays = Number(settings.minLeaveDays);
  const startKey = cycleKeyOf(settings.startMonth);

  const latestData = [
    cycleKeyOf(today),
    ...payments.map((p) => p.cycle),
    ...expenses.map((e) => cycleKeyOf(e.date)),
    ...transfers.map((t) => cycleKeyOf(t.date)),
  ].filter((k) => k >= startKey).sort().at(-1) ?? startKey;
  const keys = listCycleKeys(startKey, untilKey ?? latestData);

  // eligible leave intervals per member
  const leaveMap = new Map();
  for (const l of leaves) {
    if (leaveDayCount(l) < minDays) continue;
    const k = String(l.member);
    if (!leaveMap.has(k)) leaveMap.set(k, []);
    leaveMap.get(k).push([toDayNum(l.startDate), toDayNum(l.endDate)]);
  }
  // payments per member+cycle
  const paid = new Map();
  for (const p of payments) {
    const k = `${p.member}|${p.cycle}`;
    const cur = paid.get(k) ?? { cash: 0, digital: 0 };
    if (p.mode === 'Cash') cur.cash += Number(p.amount); else cur.digital += Number(p.amount);
    paid.set(k, cur);
  }

  const balance = new Map(members.map((m) => [idOf(m), r2(Number(m.openingBalance || 0))]));
  const totals = new Map(members.map((m) => [idOf(m), { paid: 0, leaveDays: 0, leaveCredit: 0 }]));
  let openCash = r2(Number(settings.openingCash || 0));
  let openDigital = r2(Number(settings.openingDigital || 0));
  const cycles = [];

  for (const key of keys) {
    const cyc = cycleRange(key);
    const amountInfo = collectionInfo(settings, key);
    const charge = makeCharge(settings, amountInfo.amount);
    const rows = members.map((m) => {
      const id = idOf(m);
      const join = m.joinDate ? toDayNum(m.joinDate) : -Infinity;
      const exit = m.exitDate ? toDayNum(m.exitDate) : Infinity;
      const ms = Math.max(cyc.start, join);
      const me = Math.min(cyc.end, exit);
      const memberDays = Math.max(0, me - ms + 1);
      let leaveDays = 0;
      const ivs = leaveMap.get(id) ?? [];
      for (let d = ms; d <= me; d++) if (ivs.some(([a, b]) => d >= a && d <= b)) leaveDays++;
      const presentDays = memberDays - leaveDays;
      const due = charge(memberDays, cyc.days);
      const netDue = charge(presentDays, cyc.days);
      const leaveCredit = r2(due - netDue);
      const broughtForward = balance.get(id);
      const netPayable = r2(broughtForward + netDue);
      const p = paid.get(`${id}|${key}`) ?? { cash: 0, digital: 0 };
      const bal = r2(netPayable - p.cash - p.digital);
      balance.set(id, bal);
      const t = totals.get(id);
      t.paid = r2(t.paid + p.cash + p.digital);
      t.leaveDays += leaveDays;
      t.leaveCredit = r2(t.leaveCredit + leaveCredit);
      return {
        member: id, name: m.name, memberDays, leaveDays, presentDays, due, leaveCredit, netDue,
        broughtForward, netPayable, paidCash: r2(p.cash), paidDigital: r2(p.digital), balance: bal,
      };
    });

    const inCycle = (iso) => iso >= cyc.startISO && iso <= cyc.endISO;
    const sum = (arr, f) => r2(arr.reduce((s, x) => s + f(x), 0));
    const exp = expenses.filter((e) => inCycle(e.date));
    const trf = transfers.filter((t) => inCycle(t.date));
    const fund = {
      openingCash: openCash,
      openingDigital: openDigital,
      collectionsCash: sum(rows, (r) => r.paidCash),
      collectionsDigital: sum(rows, (r) => r.paidDigital),
      expensesCash: sum(exp.filter((e) => e.paidFrom === 'Cash'), (e) => Number(e.amount)),
      expensesDigital: sum(exp.filter((e) => e.paidFrom === 'Digital'), (e) => Number(e.amount)),
      transfersToCash: r2(sum(trf.filter((t) => t.direction === 'Digital to Cash'), (t) => Number(t.amount))
        - sum(trf.filter((t) => t.direction === 'Cash to Digital'), (t) => Number(t.amount))),
    };
    fund.closingCash = r2(fund.openingCash + fund.collectionsCash - fund.expensesCash + fund.transfersToCash);
    fund.closingDigital = r2(fund.openingDigital + fund.collectionsDigital - fund.expensesDigital - fund.transfersToCash);
    fund.closingTotal = r2(fund.closingCash + fund.closingDigital);
    openCash = fund.closingCash;
    openDigital = fund.closingDigital;

    cycles.push({
      key, half: cyc.half, startDate: cyc.startISO, endDate: cyc.endISO, days: cyc.days,
      collectionAmount: amountInfo.amount, amountRule: amountInfo.rule, hasOwnAmount: amountInfo.own, amountFallback: amountInfo.fallback,
      dailyRate: settings.leaveMethod === 'dailyRate' ? cycleDailyRate(settings, amountInfo.amount) : null,
      isCurrent: key === cycleKeyOf(today), isFuture: cyc.startISO > today,
      rows, fund,
      summary: {
        membersCharged: rows.filter((r) => r.netDue > 0).length,
        dueAfterCredits: sum(rows, (r) => r.netDue),
        leaveCredits: sum(rows, (r) => r.leaveCredit),
        collected: r2(fund.collectionsCash + fund.collectionsDigital),
        pending: sum(rows.filter((r) => r.balance > 0), (r) => r.balance),
        advance: sum(rows.filter((r) => r.balance < 0), (r) => -r.balance),
      },
    });
  }

  const currentKey = cycleKeyOf(today);
  const current = cycles.findLast((c) => c.key <= currentKey) ?? null;
  const last = cycles.at(-1);
  const memberSummary = members.map((m) => {
    const id = idOf(m);
    const curRow = current?.rows.find((r) => r.member === id);
    return {
      member: id, name: m.name, status: memberStatus(m, leaves, today),
      openingBalance: r2(Number(m.openingBalance || 0)), ...totals.get(id),
      currentBalance: curRow ? curRow.balance : r2(Number(m.openingBalance || 0)),
    };
  });

  return {
    today,
    currentKey: current?.key ?? null,
    kpis: {
      cash: last?.fund.closingCash ?? openCash,
      digital: last?.fund.closingDigital ?? openDigital,
      total: last?.fund.closingTotal ?? r2(openCash + openDigital),
      pendingNow: current?.summary.pending ?? 0,
      inVilla: memberSummary.filter((s) => s.status === 'Active').length,
      onLeave: memberSummary.filter((s) => s.status === 'On Leave').length,
    },
    cycles,
    memberSummary,
  };
}

/**
 * Total credit of one leave for someone who is a member for the whole of every cycle it touches
 * (sum over those cycles of charge(full cycle) − charge(days present)). Shown in the Leave list and form.
 */
export function leaveCreditEstimate(leave, settings) {
  if (leaveDayCount(leave) < Number(settings.minLeaveDays)) return 0;
  const a = toDayNum(leave.startDate);
  const b = toDayNum(leave.endDate);
  let total = 0;
  for (const key of listCycleKeys(cycleKeyOf(leave.startDate), cycleKeyOf(leave.endDate))) {
    const c = cycleRange(key);
    const charge = makeCharge(settings, collectionInfo(settings, key).amount);
    const overlap = Math.max(0, Math.min(b, c.end) - Math.max(a, c.start) + 1);
    total += charge(c.days, c.days) - charge(c.days - overlap, c.days);
  }
  return r2(total);
}
