// Seeds an EMPTY database with the villa's starting data (same as the Excel v2 example).
// It never overwrites: if any member already exists it stops.
import mongoose from 'mongoose';
import { connectDb } from './db.js';
import { Settings, Member, Leave, Expense } from './models/index.js';

const MEMBERS = ['Vinay Kharayat', 'Mohan Singh', 'Shubham Dubey', 'Gourav Pandey', 'Sandeep Sharma', 'Sajid Ali',
  'Vishnu Kaldate', 'Mohseen Sheikh', 'Aftab Sheikh', 'Sourav Kature', 'Sundar Sharma', 'Siddhant Tayade', 'Ashu Bhardwaj'];

await connectDb();
try {
  if (await Member.estimatedDocumentCount()) {
    console.log('Database already has members – seed skipped (nothing changed).');
  } else {
    await Settings.findOneAndUpdate({ key: 'main' }, {
      villaName: 'Our Villa', startMonth: '2026-11-01', collectionAmount: 100, roundDecimals: 2, minLeaveDays: 1,
      openingCash: 1700, openingDigital: 0,
    }, { upsert: true, runValidators: true });
    const members = await Member.insertMany(MEMBERS.map((name) => ({ name })));
    await Leave.create({ member: members[0]._id, startDate: '2026-11-01', endDate: '2026-11-15', reason: 'On leave, did not contribute on 1 Nov' });
    await Expense.create({ date: '2026-11-01', category: 'Grocery', description: 'Grocery shopping', paidFrom: 'Cash', amount: 1154 });
    console.log(`Seeded: settings, ${members.length} members, 1 leave (Vinay 1–15 Nov), 1 expense (Grocery 1,154).`);
  }
} finally {
  await mongoose.disconnect();
}
