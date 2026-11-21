// Small helpers shared by the Groceries and Products pages.
import { money0 } from './format.js';

/** Items and products with the same name in any letter case are the same thing ("Onion" = "onion "). */
export const itemKey = (name) => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export const qtyText = (qty, unit) => `${Number(qty)} ${unit}`;

/** "3.50/kg", "0.46/pc" */
export const perUnit = (price, unit) => `${money0(price)}/${unit === 'pcs' ? 'pc' : unit}`;

/**
 * Products matching a search, best first: name starts with it, then a word in the name starts with it,
 * then the name contains it, then only the category matches. No search: most recently bought first.
 */
export function searchProducts(products, query, lastDate = () => '') {
  const q = itemKey(query);
  if (!q) {
    return [...products].sort((a, b) => lastDate(b).localeCompare(lastDate(a)) || a.name.localeCompare(b.name));
  }
  const scored = [];
  for (const p of products) {
    const at = p.key.indexOf(q);
    let score = -1;
    if (at === 0) score = 0;
    else if (at > 0) score = p.key[at - 1] === ' ' ? 1 : 2;
    else if (itemKey(p.category).includes(q)) score = 3;
    if (score >= 0) scored.push([score, p]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).map(([, p]) => p);
}
