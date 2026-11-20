const nf = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const money = (n) => (n == null || n === '' ? '' : Math.abs(n) < 0.005 ? '–' : nf.format(n));

/** Like money() but shows 0.00 instead of a dash (used on KPI cards). */
export const money0 = (n) => nf.format(Math.abs(n) < 0.005 ? 0 : n);

export function date(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}-${MONTHS[Number(m) - 1]}-${y}`;
}

export function shortDate(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}

export function shortCycleLabel(c) {
  const [y, m] = c.key.split('-');
  return `${MONTHS[Number(m) - 1]} ${y} · ${c.half}`;
}

export function cycleLabel(c) {
  const [y, m] = c.key.split('-');
  return `${MONTHS[Number(m) - 1]} ${y} · ${c.half} cycle`;
}

export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(new Date());
}

export function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const balanceClass = (n) => (n > 0.004 ? 'owes' : n < -0.004 ? 'advance' : '');
