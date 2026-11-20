import mongoose from 'mongoose';

export async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set – copy server/.env.example to server/.env and fill it in.');
  await mongoose.connect(uri, { dbName: process.env.DB_NAME || 'villa_budget', serverSelectionTimeoutMS: 15000 });
  console.log(`MongoDB connected (db: ${mongoose.connection.name})`);
  return mongoose.connection;
}
