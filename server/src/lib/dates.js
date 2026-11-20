// Date helpers. All dates are stored and exchanged as ISO strings "YYYY-MM-DD"
// (no time, no time zone) and converted to integer "day numbers" for arithmetic.

const DAY_MS = 86_400_000;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function toDayNum(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

export function fromDayNum(n) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function isISODate(value) {
  return typeof value === 'string' && ISO_RE.test(value) && fromDayNum(toDayNum(value)) === value;
}

/** Today's date in the villa's time zone (UAE by default). */
export function todayISO(timeZone = 'Asia/Dubai') {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
}

function lastDayOfMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based here
}

/**
 * A cycle is identified by its first day: "YYYY-MM-01" (1st–14th) or "YYYY-MM-15" (15th–month end).
 */
export function cycleKeyOf(iso) {
  const [y, m, d] = iso.split('-');
  return `${y}-${m}-${Number(d) < 15 ? '01' : '15'}`;
}

export function cycleRange(key) {
  const [y, m, d] = key.split('-').map(Number);
  const start = toDayNum(key);
  const end = d === 1 ? start + 13 : toDayNum(`${key.slice(0, 8)}${String(lastDayOfMonth(y, m)).padStart(2, '0')}`);
  return { key, start, end, days: end - start + 1, startISO: key, endISO: fromDayNum(end), half: d === 1 ? '1st' : '15th' };
}

export function nextCycleKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  if (d === 1) return `${key.slice(0, 8)}15`;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

export function listCycleKeys(fromKey, toKey) {
  const keys = [];
  for (let k = fromKey; k <= toKey; k = nextCycleKey(k)) keys.push(k);
  return keys;
}
