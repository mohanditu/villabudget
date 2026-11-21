import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { itemKey, perUnit, searchProducts } from '../grocery.js';
import { shortDate } from '../format.js';

const MAX_SHOWN = 40;

/**
 * Item name box on the Groceries page: type to search the product list, pick with a click / tap or
 * ↑ ↓ Enter. A name that isn't a product can still be typed (it is added to Products on save).
 *
 * products: [{ _id, name, key, category, unit }]; stats: key → price summary of that item (or undefined)
 * onChange(text) while typing; onPick(product) when one is chosen.
 */
export function ProductPicker({ value, onChange, onPick, products, stats, placeholder, ariaLabel, disabled }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef(null);
  const id = useId();
  const listId = `${id}-list`;

  const matches = useMemo(
    () => searchProducts(products, value, (p) => stats.get(p.key)?.lastDate ?? '').slice(0, MAX_SHOWN),
    [products, value, stats],
  );
  const q = itemKey(value);
  // "not a product yet" only once nothing matches – while matches show, the person is still searching
  const isNew = q !== '' && matches.length === 0;
  const showList = open && (matches.length > 0 || isNew);

  useEffect(() => {
    if (active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, id]);

  // after a pick, carry on with the quantity of the same line
  const nextField = () => inputRef.current?.closest('.item-row')?.querySelector('input[type=number]');
  const choose = (p) => {
    onPick(p);
    setOpen(false);
    setActive(-1);
    nextField()?.focus();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      // Enter in the item box never submits the purchase half-typed
      e.preventDefault();
      if (showList && matches[active]) choose(matches[active]);
      else { setOpen(false); nextField()?.focus(); }
    } else if (e.key === 'Escape' && showList) {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="combo item-name">
      <input ref={inputRef} value={value} placeholder={placeholder} aria-label={ariaLabel} disabled={disabled} maxLength={80}
        role="combobox" aria-autocomplete="list" aria-expanded={showList} aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${id}-${active}` : undefined}
        autoComplete="off" autoCapitalize="words" spellCheck={false}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={onKeyDown} />
      {showList && (
        // mousedown would blur the input before the click lands, so it is cancelled
        <ul className="combo-list" role="listbox" id={listId} onMouseDown={(e) => e.preventDefault()}>
          {matches.map((p, i) => {
            const s = stats.get(p.key);
            return (
              <li key={p._id} id={`${id}-${i}`} role="option" aria-selected={i === active} className={i === active ? 'active' : ''}
                onClick={() => choose(p)} onMouseEnter={() => setActive(i)}>
                <span className="combo-name">{p.name}</span>
                <span className="combo-meta">
                  {[p.category, p.unit, s && `${perUnit(s.unitPrice, s.unit)} on ${shortDate(s.lastDate)}`].filter(Boolean).join(' · ')}
                </span>
              </li>
            );
          })}
          {isNew && (
            <li className="combo-new" aria-disabled="true">
              <b>{value.trim()}</b> isn't in Products yet – it will be added when you save.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
