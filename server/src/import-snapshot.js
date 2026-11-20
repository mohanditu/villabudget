// Replaces ALL villa data in MongoDB with the contents of a snapshot JSON file
// (e.g. data/google-sheet-snapshot.json, copied from the villa's Google Sheet).
//
//   npm run import -w server -- data/google-sheet-snapshot.json          → dry run: shows what would change
//   npm run import -w server -- data/google-sheet-snapshot.json --yes    → backs up, then replaces
//
// Safety: everything is validated before anything is touched; the current data is written to
// backups/db-<timestamp>.json first; the delete + insert runs in one transaction (all or nothing).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connectDb } from './db.js';
import { Settings, Member, Leave, Payment, Expense, Transfer } from './models/index.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const apply = args.includes('--yes');
if (!file) {
  console.error('Usage: npm run import -w server -- <snapshot.json> [--yes]');
  process.exit(1);
}
const snap = JSON.parse(readFileSync(path.resolve(file), 'utf8'));
const MODELS = { members: Member, leaves: Leave, payments: Payment, expenses: Expense, transfers: Transfer };

// ---- 1. build + validate every document before touching the database
const problems = [];
const memberIds = new Map();
const members = (snap.members ?? []).map((m) => {
  const doc = new Member(m);
  if (memberIds.has(doc.name)) problems.push(`duplicate member name: ${doc.name}`);
  memberIds.set(doc.name, doc._id);
  return doc;
});
const byName = (kind) => (x, i) => {
  const id = memberIds.get(x.member);
  if (!id) problems.push(`${kind} #${i + 1}: unknown member "${x.member}"`);
  return { ...x, member: id };
};
const payments = (snap.payments ?? []).map(byName('payment')).map((p) => new Payment({ date: p.cycle, ...p }));
const docs = {
  members,
  leaves: (snap.leaves ?? []).map(byName('leave')).map((l) => new Leave(l)),
  payments,
  expenses: (snap.expenses ?? []).map((e) => new Expense(e)),
  transfers: (snap.transfers ?? []).map((t) => new Transfer(t)),
};
const settingsDoc = new Settings({ key: 'main', ...snap.settings });
for (const [kind, list] of Object.entries({ ...docs, settings: [settingsDoc] })) {
  for (const [i, d] of list.entries()) {
    try { await d.validate(); } catch (err) {
      problems.push(`${kind} #${i + 1}: ${Object.values(err.errors ?? { e: err }).map((e) => e.message).join('; ')}`);
    }
  }
}
for (const l of snap.leaves ?? []) {
  if (l.endDate < l.startDate) problems.push(`leave ${l.member}: last day before first day`);
}
if (problems.length) {
  console.error('Snapshot has problems – nothing was changed:\n  ' + problems.join('\n  '));
  process.exit(1);
}

await connectDb();
try {
  await Promise.all([Settings, ...Object.values(MODELS)].map((m) => m.init())); // create collections/indexes outside the transaction
  const before = Object.fromEntries(await Promise.all(Object.entries(MODELS).map(async ([k, m]) => [k, await m.countDocuments()])));

  // Keep uploaded bills: move them onto the matching new expense (same date, category, amount, paid from, description).
  // Bills whose expense is not in the snapshot are reported; their files stay in the database (ids are in the backup).
  const keyOf = (e) => [e.date, e.category, Number(e.amount).toFixed(2), e.paidFrom, (e.description ?? '').trim()].join('|');
  const pool = new Map();
  for (const e of await Expense.find({ 'bills.0': { $exists: true } }).lean()) {
    if (!pool.has(keyOf(e))) pool.set(keyOf(e), []);
    pool.get(keyOf(e)).push(e);
  }
  let billsKept = 0;
  for (const d of docs.expenses) {
    const old = pool.get(keyOf(d))?.shift();
    if (old) { d.bills = old.bills; billsKept += old.bills.length; }
  }
  const unmatched = [...pool.values()].flat().filter((e) => e.bills.length);

  console.log(`\nSnapshot: ${snap.source ?? file}`);
  console.log('                 now in DB  →  after import');
  for (const k of Object.keys(MODELS)) console.log(`  ${k.padEnd(12)} ${String(before[k]).padStart(9)}  →  ${docs[k].length}`);
  const s = snap.settings;
  console.log(`  settings      start ${s.startMonth}, opening cash ${s.openingCash} / digital ${s.openingDigital}, rule ${s.leaveMethod}${s.leaveMethod === 'dailyRate' ? ` (${s.dailyRate}/day)` : ''}`);
  console.log(`  bills         ${billsKept} kept on their matching expense${unmatched.length ? `; ${unmatched.reduce((n, e) => n + e.bills.length, 0)} on expenses not in the snapshot – their files stay in the database but will no longer be linked:` : ''}`);
  for (const e of unmatched) console.log(`                  ${e.date} ${e.category} ${e.amount} "${e.description}" → ${e.bills.map((b) => b.name).join(', ')}`);
  for (const n of snap.notImported ?? []) console.log(`  not imported: ${n}`);

  if (!apply) {
    console.log('\nDry run – nothing changed. Add --yes to back up the current data and replace it.');
  } else {
    // ---- 2. backup
    const backupDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../backups');
    mkdirSync(backupDir, { recursive: true });
    const backup = { takenAt: new Date().toISOString(), settings: await Settings.find().lean() };
    for (const [k, m] of Object.entries(MODELS)) backup[k] = await m.find().lean();
    const backupFile = path.join(backupDir, `db-${backup.takenAt.replace(/[:.]/g, '-')}.json`);
    writeFileSync(backupFile, JSON.stringify(backup, null, 2));
    console.log(`\nBackup of the previous data: ${backupFile}`);

    // ---- 3. replace, all or nothing
    await mongoose.connection.transaction(async (session) => {
      for (const m of Object.values(MODELS)) await m.deleteMany({}, { session });
      await Settings.deleteMany({}, { session });
      await Settings.create([settingsDoc.toObject()], { session });
      for (const [k, m] of Object.entries(MODELS)) {
        if (docs[k].length) await m.insertMany(docs[k], { session });
      }
    });
    const after = await Promise.all(Object.entries(MODELS).map(async ([k, m]) => `${k} ${await m.countDocuments()}`));
    console.log(`Imported. Database now has: ${after.join(', ')}.`);
  }
} finally {
  await mongoose.disconnect();
}
