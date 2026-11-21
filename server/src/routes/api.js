import express, { Router } from 'express';
import mongoose from 'mongoose';
import { Settings, Member, Leave, Payment, Expense, Transfer, Product, getSettings } from '../models/index.js';
import { computeLedger, leaveCreditEstimate, leaveDayCount } from '../lib/ledger.js';
import { todayISO, cycleKeyOf, nextCycleKey } from '../lib/dates.js';
import {
  MAX_BILL_BYTES, MAX_BILLS_PER_EXPENSE, sniffBillType, cleanBillName, saveBillFile, findBillFile, deleteBillFiles, billsBucket,
} from '../lib/bills.js';
import {
  UNITS, BASE_UNITS, PRODUCT_CATEGORIES, cleanItems, cleanProduct, summarizeItems, itemKey, sameNameRegExp,
} from '../lib/groceries.js';

export const api = Router();
const tz = () => process.env.TZ_VILLA || 'Asia/Dubai';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));

async function loadAll() {
  const [settings, members, leaves, payments, expenses, transfers] = await Promise.all([
    getSettings(),
    Member.find().sort({ createdAt: 1 }).lean(),
    Leave.find().lean(),
    Payment.find().lean(),
    Expense.find().lean(),
    Transfer.find().lean(),
  ]);
  return { settings, members, leaves, payments, expenses, transfers };
}

async function ledger(untilKey) {
  const data = await loadAll();
  return { data, result: computeLedger({ ...data, today: todayISO(tz()), untilKey }) };
}

// ---------------------------------------------------------------- settings
api.get('/settings', wrap(async (_req, res) => res.json(await getSettings())));
api.put('/settings', wrap(async (req, res) => {
  const fields = ['villaName', 'startMonth', 'collectionAmount', 'roundDecimals', 'minLeaveDays', 'leaveMethod', 'dailyRate', 'openingCash', 'openingDigital', 'categories', 'groceryCategory'];
  const doc = await Settings.findOneAndUpdate({ key: 'main' }, pick(req.body, fields), { returnDocument: 'after', upsert: true, runValidators: true });
  res.json(doc);
}));

// Collection amount for one cycle ("only this cycle" or "this and later cycles").
const cycleParam = (v) => {
  if (!/^\d{4}-\d{2}-(01|15)$/.test(v)) throw new HttpError(400, 'Cycle must be YYYY-MM-01 or YYYY-MM-15');
  return v;
};
api.put('/collections/:cycle/amount', wrap(async (req, res) => {
  const key = cycleParam(req.params.cycle);
  const settings = await getSettings();
  if (key < settings.startMonth) throw new HttpError(400, 'Cycle is before the start month');
  const amount = Number(req.body.amount);
  if (req.body.amount === '' || req.body.amount == null || !Number.isFinite(amount) || amount < 0) throw new HttpError(400, 'Amount must be 0 or more');
  const scope = req.body.scope === 'onward' ? 'onward' : 'once';
  const changes = (settings.amountChanges ?? []).filter((c) => c.cycle !== key);
  changes.push({ cycle: key, amount, scope, note: String(req.body.note ?? '').trim() });
  changes.sort((a, b) => (a.cycle < b.cycle ? -1 : 1));
  res.json(await Settings.findOneAndUpdate({ key: 'main' }, { amountChanges: changes }, { returnDocument: 'after', runValidators: true }));
}));
api.delete('/collections/:cycle/amount', wrap(async (req, res) => {
  const key = cycleParam(req.params.cycle);
  res.json(await Settings.findOneAndUpdate({ key: 'main' }, { $pull: { amountChanges: { cycle: key } } }, { returnDocument: 'after' }));
}));

// ---------------------------------------------------------------- dashboard / ledger
api.get('/ledger', wrap(async (req, res) => {
  const { result } = await ledger(req.query.until);
  res.json({ ...result, cycles: result.cycles.map(({ rows, ...c }) => c) });
}));

api.get('/collections/:cycle', wrap(async (req, res) => {
  const key = cycleKeyOf(req.params.cycle);
  const { data, result } = await ledger(key > cycleKeyOf(todayISO(tz())) ? key : undefined);
  const cycle = result.cycles.find((c) => c.key === key);
  if (!cycle) throw new HttpError(404, 'Cycle is before the start month');
  const statusById = new Map(result.memberSummary.map((s) => [s.member, s.status]));
  const payments = data.payments.filter((p) => p.cycle === key).sort((a, b) => a.date.localeCompare(b.date));
  res.json({
    ...cycle,
    rows: cycle.rows.map((r) => ({ ...r, status: statusById.get(r.member) })),
    payments,
    rule: pick(data.settings, ['collectionAmount', 'leaveMethod', 'dailyRate', 'roundDecimals']),
    prevKey: result.cycles[result.cycles.indexOf(cycle) - 1]?.key ?? null,
    nextKey: nextCycleKey(key),
  });
}));

api.get('/members/:id/statement', wrap(async (req, res) => {
  const { data, result } = await ledger();
  const member = data.members.find((m) => String(m._id) === req.params.id);
  if (!member) throw new HttpError(404, 'Member not found');
  res.json({
    member,
    summary: result.memberSummary.find((s) => s.member === req.params.id),
    cycles: result.cycles.map((c) => ({ key: c.key, half: c.half, startDate: c.startDate, endDate: c.endDate, days: c.days, isFuture: c.isFuture, ...c.rows.find((r) => r.member === req.params.id) })),
    leaves: data.leaves.filter((l) => String(l.member) === req.params.id),
    payments: data.payments.filter((p) => String(p.member) === req.params.id),
  });
}));

// ---------------------------------------------------------------- members
const MEMBER_FIELDS = ['name', 'room', 'phone', 'joinDate', 'exitDate', 'openingBalance', 'notes'];
function checkMemberDates(b) {
  if (b.joinDate && b.exitDate && b.exitDate < b.joinDate) throw new HttpError(400, 'Exit date is before join date');
}
api.get('/members', wrap(async (_req, res) => {
  const { result, data } = await ledger();
  const sum = new Map(result.memberSummary.map((s) => [s.member, s]));
  res.json(data.members.map((m) => ({ ...m, ...sum.get(String(m._id)), _id: m._id })));
}));
api.post('/members', wrap(async (req, res) => {
  checkMemberDates(req.body);
  res.status(201).json(await Member.create(pick(req.body, MEMBER_FIELDS)));
}));
api.put('/members/:id', wrap(async (req, res) => {
  const cur = await Member.findById(req.params.id).lean();
  if (!cur) throw new HttpError(404, 'Member not found');
  const body = pick(req.body, MEMBER_FIELDS);
  checkMemberDates({ ...cur, ...body });
  res.json(await Member.findByIdAndUpdate(req.params.id, body, { returnDocument: 'after', runValidators: true }));
}));
api.delete('/members/:id', wrap(async (req, res) => {
  const [p, l] = await Promise.all([Payment.countDocuments({ member: req.params.id }), Leave.countDocuments({ member: req.params.id })]);
  if (p || l) throw new HttpError(409, 'This member has payments or leaves – set an Exit Date instead of deleting.');
  await Member.findByIdAndDelete(req.params.id);
  res.status(204).end();
}));

// ---------------------------------------------------------------- leaves
const LEAVE_FIELDS = ['member', 'startDate', 'endDate', 'reason'];
async function validateLeave(body, id) {
  if (!body.member || !body.startDate || !body.endDate) throw new HttpError(400, 'Member, first day and last day are required');
  if (body.endDate < body.startDate) throw new HttpError(400, 'Last day away is before the first day');
  const member = await Member.findById(body.member).lean();
  if (!member) throw new HttpError(400, 'Unknown member');
  if ((member.joinDate && body.startDate < member.joinDate) || (member.exitDate && body.endDate > member.exitDate)) {
    throw new HttpError(400, `Leave is outside ${member.name}'s join / exit dates`);
  }
  const overlap = await Leave.findOne({ member: body.member, _id: { $ne: id }, startDate: { $lte: body.endDate }, endDate: { $gte: body.startDate } }).lean();
  if (overlap) throw new HttpError(409, `Overlaps an existing leave (${overlap.startDate} → ${overlap.endDate})`);
}
api.get('/leaves', wrap(async (_req, res) => {
  const settings = await getSettings();
  const leaves = await Leave.find().populate('member', 'name').sort({ startDate: -1 }).lean();
  res.json(leaves.map((l) => ({ ...l, days: leaveDayCount(l), eligible: leaveDayCount(l) >= settings.minLeaveDays, creditEstimate: leaveCreditEstimate(l, settings) })));
}));
api.post('/leaves', wrap(async (req, res) => {
  const body = pick(req.body, LEAVE_FIELDS);
  await validateLeave(body);
  res.status(201).json(await Leave.create(body));
}));
api.put('/leaves/:id', wrap(async (req, res) => {
  const cur = await Leave.findById(req.params.id).lean();
  if (!cur) throw new HttpError(404, 'Leave not found');
  const body = { ...cur, ...pick(req.body, LEAVE_FIELDS) };
  await validateLeave(body, req.params.id);
  res.json(await Leave.findByIdAndUpdate(req.params.id, pick(body, LEAVE_FIELDS), { returnDocument: 'after', runValidators: true }));
}));
api.delete('/leaves/:id', wrap(async (req, res) => { await Leave.findByIdAndDelete(req.params.id); res.status(204).end(); }));

// ---------------------------------------------------------------- payments
api.post('/payments', wrap(async (req, res) => {
  const body = pick(req.body, ['member', 'cycle', 'date', 'mode', 'amount', 'note']);
  body.cycle = body.cycle && cycleKeyOf(body.cycle);
  body.date ||= todayISO(tz());
  if (!Number(body.amount)) throw new HttpError(400, 'Amount is required (use a minus amount for a refund)');
  const settings = await getSettings();
  if (body.cycle < settings.startMonth) throw new HttpError(400, 'Cycle is before the start month');
  if (!(await Member.exists({ _id: body.member }))) throw new HttpError(400, 'Unknown member');
  res.status(201).json(await Payment.create(body));
}));
api.delete('/payments/:id', wrap(async (req, res) => { await Payment.findByIdAndDelete(req.params.id); res.status(204).end(); }));

// ---------------------------------------------------------------- expenses & transfers
function crud(path, Model, fields, sort, { beforeDelete, prepare = (b) => b, afterSave = async () => {} } = {}) {
  api.get(path, wrap(async (_req, res) => res.json(await Model.find().sort(sort).lean())));
  api.post(path, wrap(async (req, res) => {
    const doc = await Model.create(prepare(pick(req.body, fields)));
    await afterSave(doc);
    res.status(201).json(doc);
  }));
  api.put(`${path}/:id`, wrap(async (req, res) => {
    const doc = await Model.findByIdAndUpdate(req.params.id, prepare(pick(req.body, fields)), { returnDocument: 'after', runValidators: true });
    if (!doc) throw new HttpError(404, 'Not found');
    await afterSave(doc);
    res.json(doc);
  }));
  api.delete(`${path}/:id`, wrap(async (req, res) => {
    const doc = await Model.findByIdAndDelete(req.params.id);
    if (doc && beforeDelete) await beforeDelete(doc);
    res.status(204).end();
  }));
}
crud('/expenses', Expense, ['date', 'category', 'description', 'paidFrom', 'amount', 'paidBy', 'ref', 'items'], { date: -1, createdAt: -1 }, {
  beforeDelete: (doc) => deleteBillFiles(doc.bills.map((b) => b.fileId)),
  // items are only replaced when sent, so older clients that don't send them keep what is saved
  prepare: (body) => ('items' in body ? { ...body, items: cleanItems(body.items) } : body),
  // an item typed on the Groceries page that isn't a product yet becomes one
  afterSave: (doc) => ensureProducts(doc.items).catch((err) => console.error('Could not add new products:', err.message)),
});

// ---------------------------------------------------------------- groceries (itemised Grocery expenses)
api.get('/groceries', wrap(async (_req, res) => {
  const category = (await getSettings()).groceryCategory || 'Grocery';
  const [purchases, products] = await Promise.all([
    Expense.find({ category }).sort({ date: -1, createdAt: -1 }).lean(),
    Product.find({}, { name: 1, key: 1, category: 1, unit: 1 }).sort({ key: 1 }).lean(),
  ]);
  res.json({ category, units: UNITS, baseUnits: BASE_UNITS, purchases, items: summarizeItems(purchases), products });
}));

// ---------------------------------------------------------------- products (the list of things we buy)
/** Adds a product for every item name that isn't one yet (unit from the item). Returns how many were added. */
async function ensureProducts(items = []) {
  const byKey = new Map();
  for (const it of items) {
    const key = itemKey(it.name);
    if (key && !byKey.has(key)) byKey.set(key, it);
  }
  if (!byKey.size) return 0;
  try {
    const res = await Product.bulkWrite([...byKey].map(([key, it]) => ({
      updateOne: { filter: { key }, update: { $setOnInsert: { key, name: it.name.trim(), unit: it.unit || 'pcs', category: '', notes: '' } }, upsert: true },
    })), { ordered: false });
    return res.upsertedCount;
  } catch (err) {
    // two saves adding the same new product at once: the other one won, which is fine
    if (err.code === 11000 || err.writeErrors?.every((w) => w.code === 11000)) return err.result?.upsertedCount ?? 0;
    throw err;
  }
}

const itemizedExpenses = () => Expense.find({ 'items.0': { $exists: true } }, { date: 1, createdAt: 1, description: 1, paidBy: 1, items: 1 }).lean();

api.get('/products', wrap(async (_req, res) => {
  const [products, itemized] = await Promise.all([Product.find().lean(), itemizedExpenses()]);
  const summary = summarizeItems(itemized);
  const stats = new Map(summary.map(({ history, ...s }) => [s.key, s]));
  const keys = new Set(products.map((p) => p.key));
  res.json({
    units: UNITS,
    categories: [...new Set([...PRODUCT_CATEGORIES, ...products.map((p) => p.category).filter(Boolean)])],
    products: products.map((p) => ({ ...p, stats: stats.get(p.key) ?? null })),
    unlisted: summary.filter((s) => !keys.has(s.key)).map((s) => s.name), // bought before, not in the list yet
  });
}));

async function checkProductName(body, id) {
  const other = await Product.findOne({ key: body.key, _id: { $ne: id } }).lean();
  if (other) throw new HttpError(409, `"${other.name}" is already in the product list`);
}
api.post('/products', wrap(async (req, res) => {
  const body = cleanProduct(req.body);
  await checkProductName(body);
  res.status(201).json(await Product.create(body));
}));
api.put('/products/:id', wrap(async (req, res) => {
  const cur = await Product.findById(objectId(req.params.id, 'Product')).lean();
  if (!cur) throw new HttpError(404, 'Product not found');
  const body = cleanProduct({ ...cur, ...pick(req.body, ['name', 'category', 'unit', 'notes']) });
  await checkProductName(body, cur._id);
  const doc = await Product.findByIdAndUpdate(cur._id, body, { returnDocument: 'after', runValidators: true });
  let renamed = 0;
  if (body.name !== cur.name) {
    // renaming also renames the item in past purchases, so its price history stays in one piece
    const same = sameNameRegExp(cur.name);
    const r = await Expense.updateMany({ 'items.name': same }, { $set: { 'items.$[it].name': body.name } }, { arrayFilters: [{ 'it.name': same }] });
    renamed = r.modifiedCount;
  }
  res.json({ ...doc.toObject(), renamedInPurchases: renamed });
}));
api.delete('/products/:id', wrap(async (req, res) => {
  const cur = await Product.findById(objectId(req.params.id, 'Product')).lean();
  if (!cur) return res.status(204).end();
  const used = await Expense.countDocuments({ 'items.name': sameNameRegExp(cur.name) });
  if (used) throw new HttpError(409, `${cur.name} is in ${used} purchase${used === 1 ? '' : 's'}, so it stays in the list (you can rename it).`);
  await Product.findByIdAndDelete(cur._id);
  res.status(204).end();
}));
api.post('/products/from-purchases', wrap(async (_req, res) => {
  const summary = summarizeItems(await itemizedExpenses());
  res.json({ added: await ensureProducts(summary.map((s) => ({ name: s.name, unit: s.last.unit }))) });
}));

// ---------------------------------------------------------------- bills (photo / PDF attachments)
const objectId = (v, what) => {
  if (!mongoose.isValidObjectId(v)) throw new HttpError(404, `${what} not found`);
  return new mongoose.Types.ObjectId(String(v));
};

// The file is sent as the raw request body; its name goes in the X-File-Name header (URI-encoded).
api.post('/expenses/:id/bills', express.raw({ type: () => true, limit: MAX_BILL_BYTES }), wrap(async (req, res) => {
  const expenseId = objectId(req.params.id, 'Expense');
  if (!(await Expense.exists({ _id: expenseId }))) throw new HttpError(404, 'Expense not found');
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || buf.length === 0) throw new HttpError(400, 'No file received');
  const type = sniffBillType(buf);
  if (!type) throw new HttpError(415, 'Only photos (JPG, PNG, WEBP) and PDF files can be attached');
  let rawName = 'bill';
  try { rawName = decodeURIComponent(req.get('x-file-name') || 'bill'); } catch { /* keep default */ }
  const name = cleanBillName(rawName, type);

  const fileId = await saveBillFile(buf, { name, type, expenseId });
  const entry = { fileId, name, type, size: buf.length, uploadedAt: new Date().toISOString() };
  // atomic: only add while the expense still has room (safe with several uploads at once)
  const doc = await Expense.findOneAndUpdate(
    { _id: expenseId, [`bills.${MAX_BILLS_PER_EXPENSE - 1}`]: { $exists: false } },
    { $push: { bills: entry } }, { returnDocument: 'after' },
  );
  if (!doc) {
    await deleteBillFiles([fileId]);
    throw new HttpError(409, `An expense can have at most ${MAX_BILLS_PER_EXPENSE} bills`);
  }
  res.status(201).json(doc);
}));

api.get('/bills/:fileId', wrap(async (req, res, next) => {
  const id = objectId(req.params.fileId, 'Bill');
  const file = await findBillFile(id);
  if (!file) throw new HttpError(404, 'Bill not found');
  res.set({
    'Content-Type': file.metadata?.type || 'application/octet-stream',
    'Content-Length': String(file.length),
    'Content-Disposition': `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=31536000, immutable', // a file id never changes content
  });
  billsBucket().openDownloadStream(id)
    .once('error', (err) => (res.headersSent ? res.destroy(err) : next(err)))
    .pipe(res);
}));

api.delete('/expenses/:id/bills/:fileId', wrap(async (req, res) => {
  const fileId = objectId(req.params.fileId, 'Bill');
  const doc = await Expense.findOneAndUpdate({ _id: objectId(req.params.id, 'Expense') }, { $pull: { bills: { fileId } } }, { returnDocument: 'after' });
  if (!doc) throw new HttpError(404, 'Expense not found');
  await deleteBillFiles([fileId]);
  res.json(doc);
}));
crud('/transfers', Transfer, ['date', 'direction', 'amount', 'doneBy', 'notes'], { date: -1, createdAt: -1 });

// ---------------------------------------------------------------- errors
// eslint-disable-next-line no-unused-vars
api.use((err, _req, res, _next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: `File is too large – the limit is ${MAX_BILL_BYTES / 1024 / 1024} MB` });
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (err.name === 'ValidationError' || err.name === 'CastError') return res.status(400).json({ error: err.message });
  if (err.code === 11000) return res.status(409).json({ error: 'A record with this name already exists' });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});
