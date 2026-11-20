// Bill attachments (photos / PDFs) stored in MongoDB GridFS, bucket "bills".
// Keeping them in the database (not on this computer's disk) means they are available from
// every device and travel with the rest of the villa data.
import mongoose from 'mongoose';

export const MAX_BILL_BYTES = 10 * 1024 * 1024; // per file (photos are shrunk in the browser first)
export const MAX_BILLS_PER_EXPENSE = 10;

let bucket;
export function billsBucket() {
  bucket ??= new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'bills' });
  return bucket;
}

/**
 * Detects the real file type from its first bytes – the browser's Content-Type is not trusted.
 * Only formats every browser can display are accepted (no SVG/HTML, so nothing can run as a page).
 */
export function sniffBillType(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 5 && buf.toString('latin1', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };

/** Safe display name: no path parts or control characters, sensible length, extension matching the real type. */
export function cleanBillName(raw, type) {
  let name = String(raw || 'bill').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f"<>|]/g, '').trim().slice(0, 120) || 'bill';
  const ext = EXT[type];
  if (ext && !name.toLowerCase().endsWith(ext) && !(ext === '.jpg' && /\.jpe?g$/i.test(name))) name = name.replace(/\.[a-z0-9]{1,5}$/i, '') + ext;
  return name;
}

export function saveBillFile(buf, { name, type, expenseId }) {
  return new Promise((resolve, reject) => {
    const up = billsBucket().openUploadStream(name, { metadata: { type, expense: expenseId } });
    up.once('error', reject).once('finish', () => resolve(up.id));
    up.end(buf);
  });
}

export async function findBillFile(id) {
  return (await billsBucket().find({ _id: id }).limit(1).toArray())[0] ?? null;
}

/** Deletes GridFS files; files that are already gone are ignored. */
export async function deleteBillFiles(ids) {
  for (const id of ids) {
    try { await billsBucket().delete(new mongoose.Types.ObjectId(String(id))); } catch (err) {
      if (!/FileNotFound|not found/i.test(err.message)) throw err;
    }
  }
}
