import mongoose from 'mongoose';
import { isISODate } from '../lib/dates.js';
import { UNITS, MAX_ITEMS_PER_EXPENSE } from '../lib/groceries.js';

const { Schema, model } = mongoose;

const isoDate = (required = false) => ({
  type: String,
  required,
  validate: { validator: (v) => v == null || v === '' || isISODate(v), message: 'must be a date YYYY-MM-DD' },
  set: (v) => (v === '' ? null : v),
});
const money = { type: Number, default: 0, set: (v) => Math.round(Number(v) * 100) / 100 };
const opts = { timestamps: true, versionKey: false };

const SettingsSchema = new Schema({
  key: { type: String, default: 'main', unique: true },
  villaName: { type: String, default: 'Our Villa', trim: true },
  startMonth: { ...isoDate(true), default: '2026-11-01', validate: { validator: (v) => isISODate(v) && v.endsWith('-01'), message: 'must be the 1st of a month' } },
  collectionAmount: { type: Number, default: 100, min: 0 },
  roundDecimals: { type: Number, default: 2, min: 0, max: 2 },
  minLeaveDays: { type: Number, default: 1, min: 1 },
  // How a part cycle (leave / join / exit) is charged – see lib/ledger.js makeCharge().
  leaveMethod: { type: String, enum: ['prorata', 'dailyRate'], default: 'prorata' },
  dailyRate: { type: Number, default: 6.58, min: 0 },
  // collection amount changes per cycle – see lib/ledger.js collectionInfo()
  amountChanges: {
    type: [new Schema({
      cycle: { type: String, required: true, validate: { validator: (v) => isISODate(v) && /-(01|15)$/.test(v), message: 'must be YYYY-MM-01 or YYYY-MM-15' } },
      amount: { type: Number, required: true, min: 0, set: (v) => Math.round(Number(v) * 100) / 100 },
      scope: { type: String, enum: ['once', 'onward'], required: true },
      note: { type: String, trim: true, default: '', maxlength: 200 },
    }, { _id: false })],
    default: [],
  },
  openingCash: money,
  openingDigital: money,
  categories: { type: [String], default: ['Water', 'Grocery', 'Gas Cylinder', 'Cleaning Supplies', 'Electricity / Internet', 'Miscellaneous'] },
  // expenses in this category are the shopping trips listed on the Groceries page
  groceryCategory: { type: String, default: 'Grocery', trim: true },
}, opts);

const MemberSchema = new Schema({
  name: { type: String, required: true, trim: true, unique: true },
  room: { type: String, trim: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  joinDate: isoDate(),
  exitDate: isoDate(),
  openingBalance: money,
  notes: { type: String, trim: true, default: '' },
}, opts);

const LeaveSchema = new Schema({
  member: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
  startDate: isoDate(true),
  endDate: isoDate(true),
  reason: { type: String, trim: true, default: '' },
}, opts);

const PaymentSchema = new Schema({
  member: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
  cycle: { ...isoDate(true), index: true, validate: { validator: (v) => isISODate(v) && /-(01|15)$/.test(v), message: 'must be YYYY-MM-01 or YYYY-MM-15' } },
  date: isoDate(true),
  mode: { type: String, enum: ['Cash', 'Digital'], required: true },
  amount: { ...money, required: true },
  note: { type: String, trim: true, default: '' },
}, opts);

const ExpenseSchema = new Schema({
  date: { ...isoDate(true), index: true },
  category: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  paidFrom: { type: String, enum: ['Cash', 'Digital'], required: true },
  amount: { ...money, required: true },
  paidBy: { type: String, trim: true, default: '' },
  ref: { type: String, trim: true, default: '' },
  // attached bill photos / PDFs – the files themselves are in the GridFS bucket "bills"
  bills: {
    type: [new Schema({
      fileId: { type: Schema.Types.ObjectId, required: true },
      name: { type: String, required: true },
      type: { type: String, required: true },
      size: { type: Number, required: true },
      uploadedAt: { type: String, required: true },
    }, { _id: false })],
    default: [],
  },
  // what was bought (Groceries page) – checked by lib/groceries.js cleanItems() before saving
  items: {
    type: [new Schema({
      name: { type: String, required: true, trim: true, maxlength: 80 },
      qty: { type: Number, required: true, min: 0.001 },
      unit: { type: String, enum: UNITS, default: 'pcs' },
      price: { type: Number, required: true, min: 0, set: (v) => Math.round(Number(v) * 100) / 100 },
    }, { _id: false })],
    default: [],
    validate: { validator: (v) => v.length <= MAX_ITEMS_PER_EXPENSE, message: `at most ${MAX_ITEMS_PER_EXPENSE} items` },
  },
}, opts);

// The list of things the villa buys (Products page). Grocery items are linked to a product by name:
// `key` is the name in lower case with single spaces – see lib/groceries.js itemKey().
const ProductSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  key: { type: String, required: true, unique: true },
  category: { type: String, trim: true, default: '', maxlength: 40 },
  unit: { type: String, enum: UNITS, default: 'pcs' },
  notes: { type: String, trim: true, default: '', maxlength: 200 },
}, opts);

const TransferSchema = new Schema({
  date: { ...isoDate(true), index: true },
  direction: { type: String, enum: ['Cash to Digital', 'Digital to Cash'], required: true },
  amount: { ...money, required: true },
  doneBy: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, default: '' },
}, opts);

export const Settings = model('Settings', SettingsSchema);
export const Member = model('Member', MemberSchema);
export const Leave = model('Leave', LeaveSchema);
export const Payment = model('Payment', PaymentSchema);
export const Expense = model('Expense', ExpenseSchema);
export const Transfer = model('Transfer', TransferSchema);
export const Product = model('Product', ProductSchema);

export async function getSettings() {
  // hydrated (not lean) so fields added to the schema later get their defaults on older records
  const doc = (await Settings.findOne({ key: 'main' })) ?? (await Settings.create({ key: 'main' }));
  return doc.toObject();
}
