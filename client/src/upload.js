// Preparing and uploading bill attachments (photos / PDFs) for expenses.
import { api } from './api.js';

export const BILL_ACCEPT = 'image/*,application/pdf';
export const MAX_BILL_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 1800;      // px – plenty to read a receipt
const JPEG_QUALITY = 0.82;

export const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const isImage = (f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name);

/** Returns an error message if the file can't be attached, otherwise null. */
export function checkBillFile(f) {
  if (isPdf(f)) return f.size > MAX_BILL_BYTES ? `${f.name} is larger than 10 MB` : null;
  if (isImage(f)) return null; // photos are shrunk before upload
  return `${f.name} is not a photo or PDF`;
}

/**
 * Photos are resized (longest side 1800 px) and saved as JPEG in the browser, so a 5 MB phone photo
 * becomes ~300 KB. Small JPG/PNG/WEBP files and PDFs are sent unchanged. If the browser can't read
 * the image (e.g. HEIC on Chrome) the original is sent and the server decides.
 */
export async function prepareBill(file) {
  if (isPdf(file)) return { blob: file, name: file.name };
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const webSafe = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
    if (scale === 1 && webSafe && file.size <= 800 * 1024) { bmp.close?.(); return { blob: file, name: file.name }; }
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // transparent PNGs get a white background instead of black
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) throw new Error('could not convert');
    return { blob, name: `${file.name.replace(/\.[^.]+$/, '') || 'bill'}.jpg` };
  } catch {
    return { blob: file, name: file.name };
  }
}

/** Uploads files one after another; returns the updated expense and any per-file errors. */
export async function uploadBills(expenseId, files, onProgress) {
  let expense = null;
  const errors = [];
  for (const [i, f] of files.entries()) {
    onProgress?.(i + 1, files.length);
    try {
      const { blob, name } = await prepareBill(f);
      expense = await api.upload(`/expenses/${expenseId}/bills`, blob, name);
    } catch (e) {
      errors.push(`${f.name}: ${e.message}`);
    }
  }
  return { expense, errors };
}
