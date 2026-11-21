import { Fragment, useMemo, useState } from 'react';
import { api, useData } from '../api.js';
import { Link } from 'react-router-dom';
import { Money, ErrorBanner, Loading, PageHeader, Field, Card, ModeBadge, Kpi, SearchBox, Trend } from '../components/ui.jsx';
import { BillDropzone, SavedBills, BillThumbs, AttachButton, BillViewer } from '../components/bills.jsx';
import { ProductPicker } from '../components/ProductPicker.jsx';
import { Icon } from '../components/icons.jsx';
import { date, shortDate, money, money0, todayISO } from '../format.js';
import { itemKey, qtyText, perUnit } from '../grocery.js';
import { uploadBills } from '../upload.js';

// A grocery purchase is a shopping trip: one expense in the grocery category (so the Cash / Digital
// funds stay right) plus the list of items bought. The item list feeds the "Items & prices" table.

// Row ids keep React from mixing rows up while typing. (crypto.randomUUID only works over HTTPS,
// and the app is opened over plain http on the LAN.)
let nextRowId = 0;
const blankItem = () => ({ id: ++nextRowId, name: '', qty: '1', unit: 'pcs', price: '' });
const isBlank = (it) => !it.name.trim() && String(it.price).trim() === '';
/** There is always an empty row at the end, so the next item can be typed straight away. */
const withBlankRow = (items) => (items.length && isBlank(items.at(-1)) ? items : [...items, blankItem()]);
const emptyForm = () => ({ date: todayISO(), paidFrom: 'Cash', paidBy: '', description: '', ref: '', amount: '', autoTotal: true, items: [blankItem()] });

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const round2 = (n) => Math.round(n * 100) / 100;

export default function Groceries() {
  const { data, error, loading, reload } = useData('/groceries');
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [pending, setPending] = useState([]);      // bill files chosen in the form, uploaded on save
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);      // "Uploading bill 1 of 2…"
  const [busyRow, setBusyRow] = useState(null);    // purchase getting bills from the list
  const [viewer, setViewer] = useState(null);      // { id, index }
  const [month, setMonth] = useState('');
  const [query, setQuery] = useState('');
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  const purchases = useMemo(() => data?.purchases ?? [], [data]);
  const known = useMemo(() => new Map((data?.items ?? []).map((it) => [it.key, it])), [data]);   // price history by item
  const products = useMemo(() => data?.products ?? [], [data]);
  const productByKey = useMemo(() => new Map(products.map((p) => [p.key, p])), [products]);
  const months = useMemo(() => [...new Set(purchases.map((p) => p.date.slice(0, 7)))].sort().reverse(), [purchases]);
  const buyers = useMemo(() => [...new Set(purchases.map((p) => p.paidBy?.trim()).filter(Boolean))].sort(), [purchases]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const byId = (id) => purchases.find((p) => p._id === id);
  const label = (p) => `${p.description || 'groceries'} ${money(p.amount)} on ${date(p.date)}`;

  const filled = form.items.filter((it) => !isBlank(it));
  const unpriced = filled.filter((it) => String(it.price).trim() === '');
  const itemsSum = round2(filled.reduce((s, it) => s + (Number(it.price) || 0), 0));
  const total = form.autoTotal && filled.length > unpriced.length ? itemsSum.toFixed(2) : form.amount;

  const resetForm = () => { setForm(emptyForm()); setEditing(null); setPending([]); };

  const startEdit = (p) => {
    if (!p) return;
    const items = (p.items ?? []).map((it) => ({ ...blankItem(), name: it.name, qty: String(it.qty), unit: it.unit, price: String(it.price) }));
    const sum = round2(items.reduce((s, it) => s + Number(it.price), 0));
    setForm({
      date: p.date, paidFrom: p.paidFrom, paidBy: p.paidBy ?? '', description: p.description ?? '', ref: p.ref ?? '',
      amount: String(p.amount), autoTotal: items.length > 0 && Math.abs(sum - p.amount) < 0.005, items: [...items, blankItem()],
    });
    setEditing(p._id);
    setPending([]);
    setErr(null);
    setMsg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setSaving(true);
    try {
      const body = {
        date: form.date, category: data.category, paidFrom: form.paidFrom, paidBy: form.paidBy, description: form.description, ref: form.ref,
        amount: Number(total),
        // sent as typed – the server checks each row and says which one is wrong
        items: filled.map(({ name, qty, unit, price }) => ({ name, qty, unit, price })),
      };
      const saved = editing ? await api.put(`/expenses/${editing}`, body) : await api.post('/expenses', body);
      const added = [...new Map(filled.filter((it) => !productByKey.has(itemKey(it.name))).map((it) => [itemKey(it.name), it.name.trim()])).values()];
      let note = `${editing ? 'Purchase updated' : 'Purchase added'}${filled.length ? ` with ${plural(filled.length, 'item')}` : ''}.`;
      if (added.length) note += ` New in Products: ${added.join(', ')}.`;
      if (pending.length) {
        const { errors } = await uploadBills(saved._id, pending, (n, all) => setStatus(`Uploading bill ${n} of ${all}…`));
        const attached = pending.length - errors.length;
        if (attached) note += ` ${plural(attached, 'bill')} attached.`;
        if (errors.length) setErr(new Error(`Not attached – ${errors.join(' · ')}`));
      }
      setMsg(note);
      resetForm();
      reload();
    } catch (e2) {
      setErr(e2);
    } finally {
      setStatus(null);
      setSaving(false);
    }
  };

  const remove = async (p) => {
    const extra = p.bills?.length ? ` Its ${plural(p.bills.length, 'bill')} will be deleted too.` : '';
    if (!confirm(`Delete the purchase ${label(p)}?\nIt is also removed from Expenses and the ${p.paidFrom} balance.${extra}`)) return;
    try { await api.del(`/expenses/${p._id}`); if (editing === p._id) resetForm(); reload(); } catch (e) { setErr(e); }
  };

  const attach = async (p, files) => {
    setErr(null);
    setMsg(null);
    setBusyRow(p._id);
    const { errors } = await uploadBills(p._id, files);
    if (errors.length) setErr(new Error(`Not attached – ${errors.join(' · ')}`));
    const attached = files.length - errors.length;
    if (attached) setMsg(`${plural(attached, 'bill')} attached to ${label(p)}.`);
    await reload();
    setBusyRow(null);
  };

  const deleteBill = async (p, bill) => {
    if (!confirm(`Delete the bill "${bill.name}" from ${label(p)}?`)) return;
    try {
      await api.del(`/expenses/${p._id}/bills/${bill.fileId}`);
      if ((p.bills?.length ?? 0) <= 1) setViewer(null);
      await reload();
    } catch (e) { setErr(e); }
  };

  if (error) return <ErrorBanner error={error} />;
  if (loading && !data) return <Loading />;

  const inMonth = purchases.filter((p) => !month || p.date.startsWith(month));
  const q = query.trim().toLowerCase();
  const rows = q
    ? inMonth.filter((p) => [p.description, p.paidBy, p.ref, ...(p.items ?? []).map((i) => i.name)].some((s) => s?.toLowerCase().includes(q)))
    : inMonth;
  const spent = inMonth.reduce((s, p) => s + p.amount, 0);
  const itemized = inMonth.filter((p) => p.items?.length).length;
  const diff = filled.length && total !== '' ? round2(Number(total) - itemsSum) : 0;
  const editingPurchase = editing ? byId(editing) : null;
  const viewing = viewer ? byId(viewer.id) : null;
  const useItemsTotal = <button type="button" className="link" onClick={() => setForm((f) => ({ ...f, autoTotal: true }))}>use the items total</button>;

  return (
    <>
      <PageHeader title="Groceries" icon="cart" subtitle="What we bought, when, and what it cost – item by item" />
      <section className="kpis">
        <Kpi label="Spent on groceries" value={spent} color="teal" icon="cart" hint={month ? 'selected month' : 'all time'} />
        <Kpi label="Shopping trips" value={inMonth.length} isMoney={false} color="blue" icon="receipt" hint={`${itemized} with items listed`} />
        <Kpi label="Different items" value={data.items.length} isMoney={false} color="violet" icon="tag" hint="each with its price history" />
      </section>

      <Card title={editing ? 'Edit grocery purchase' : 'Add grocery purchase'} accent="teal">
        <p className="hint" style={{ marginTop: 0, marginBottom: '.9rem' }}>
          Each purchase is saved as a <b>{data.category}</b> expense, so it comes out of the Cash or Digital fund as on the Expenses page – don't enter it twice.
          Type one line per item from the receipt; the bill total adds itself up.
        </p>
        <ErrorBanner error={err} onClose={() => setErr(null)} />
        {msg && <p className="ok">{msg}</p>}
        <form className="form" onSubmit={submit}>
          <Field label="Date *"><input type="date" required value={form.date} onChange={set('date')} /></Field>
          <Field label="Paid from *">
            <select value={form.paidFrom} onChange={set('paidFrom')}><option>Cash</option><option>Digital</option></select>
          </Field>
          <Field label="Bought by"><input value={form.paidBy} onChange={set('paidBy')} list="grocery-buyers" /></Field>
          <Field label="Shop / note"><input value={form.description} onChange={set('description')} placeholder="e.g. Nesto" /></Field>
          <Field label="Bill / ref no."><input value={form.ref} onChange={set('ref')} /></Field>

          <ItemsEditor items={form.items} onChange={(items) => setForm((f) => ({ ...f, items }))}
            units={data.units} baseUnits={data.baseUnits} known={known} products={products} productByKey={productByKey}
            editing={editing} disabled={saving} />

          <div className="total-row">
            <Field label="Bill total (AED) *">
              <input type="number" step="0.01" inputMode="decimal" required value={total}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value, autoTotal: false }))} />
            </Field>
            <p className="total-note">
              {!filled.length && 'No items listed yet – you can save just the total and add the items later.'}
              {unpriced.length > 0 && <span className="warn">Enter the price for {unpriced.map((it) => it.name.trim() || 'the item').join(', ')}.</span>}
              {!unpriced.length && filled.length > 0 && diff === 0 && <><Icon name="check" size={15} /> Matches the {plural(filled.length, 'item')} above.</>}
              {!unpriced.length && diff > 0 && <>{money(diff)} of the bill isn't in the item list (bags, VAT, things not listed) – or {useItemsTotal}.</>}
              {!unpriced.length && diff < 0 && <>The items add up to {money(-diff)} more than the bill total (a discount?) – or {useItemsTotal}.</>}
            </p>
          </div>

          <div className="field bills-field">
            <span>Receipt (photo or PDF)</span>
            {editingPurchase && (
              <SavedBills bills={editingPurchase.bills} disabled={saving}
                onOpen={(i) => setViewer({ id: editingPurchase._id, index: i })}
                onDelete={(b) => deleteBill(editingPurchase, b)} />
            )}
            <BillDropzone files={pending} onChange={setPending} onError={setErr} disabled={saving} />
          </div>
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {editing ? 'Save changes' : 'Add purchase'}{pending.length ? ` + ${plural(pending.length, 'bill')}` : ''}
            </button>
            {editing && <button type="button" className="ghost" disabled={saving} onClick={resetForm}>Cancel</button>}
            {status && <span className="upload-status"><span className="spinner" /> {status}</span>}
          </div>
        </form>
        <datalist id="grocery-buyers">{buyers.map((b) => <option key={b} value={b} />)}</datalist>
      </Card>

      <Card title="Purchases" accent="primary" actions={<>
          <SearchBox value={query} onChange={setQuery} placeholder="Search item, shop or person" />
          <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Filter by month">
            <option value="">All months</option>
            {months.map((m) => <option key={m} value={m}>{date(`${m}-01`).slice(3)}</option>)}
          </select>
        </>}>
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>Date</th><th className="t">Shop / note</th><th className="t">Items</th><th>Paid from</th><th className="t">Bought by</th><th>Total</th><th className="t">Bills</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={8} className="empty">{purchases.length ? 'No purchases match.' : `No ${data.category} expenses yet – add the first purchase above.`}</td></tr>
              )}
              {rows.map((p) => (
                <tr key={p._id} className={editing === p._id ? 'current' : ''}>
                  <td>{date(p.date)}</td>
                  <td className="wrap">{p.description}{p.ref && <div className="muted small">Ref {p.ref}</div>}</td>
                  <td className="t wrap"><ItemChips items={p.items} onAdd={() => startEdit(p)} /></td>
                  <td><ModeBadge mode={p.paidFrom} /></td>
                  <td className="t">{p.paidBy}</td>
                  <td><Money value={p.amount} bold /></td>
                  <td className="t">
                    <div className="bills-cell">
                      <BillThumbs bills={p.bills} onOpen={(i) => setViewer({ id: p._id, index: i })} />
                      <AttachButton busy={busyRow === p._id} onFiles={(files) => attach(p, files)} onError={setErr}
                        label={`Attach receipt photos or PDFs to ${label(p)}`} />
                    </div>
                  </td>
                  <td className="nowrap">
                    <button type="button" className="link" onClick={() => startEdit(p)}>edit</button>
                    <button type="button" className="link danger" onClick={() => remove(p)}>delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ItemsTable items={data.items} onOpenPurchase={(id) => startEdit(byId(id))} />

      {viewing?.bills?.length > 0 && (
        <BillViewer bills={viewing.bills} index={viewer.index} title={label(viewing)}
          onClose={() => setViewer(null)} onDelete={(b) => deleteBill(viewing, b)} />
      )}
    </>
  );
}

function ItemsEditor({ items, onChange, units, baseUnits, known, products, productByKey, editing, disabled }) {
  const update = (id, patch) => onChange(withBlankRow(items.map((it) => (it.id === id ? { ...it, ...patch } : it))));
  const remove = (id) => onChange(withBlankRow(items.filter((it) => it.id !== id)));
  const setName = (it, name) => {
    const patch = { name };
    // a typed name that matches a product (or an item bought before) starts in its usual unit, until a price is typed
    const unit = productByKey.get(itemKey(name))?.unit ?? known.get(itemKey(name))?.last.unit;
    if (unit && it.unit === 'pcs' && it.price === '') patch.unit = unit;
    update(it.id, patch);
  };
  // picking from the list is a clear choice: take the product's name and usual unit
  const pick = (it, product) => update(it.id, { name: product.name, unit: product.unit });
  const lastId = items.at(-1)?.id;

  return (
    <div className="items-field">
      <div className="items-title">
        <span>Items bought</span>
        <span className="muted">search the <Link to="/products">product list</Link> · price = what you paid for that line, e.g. 2 kg onion → 6.00</span>
      </div>
      <div className="items-head" aria-hidden="true"><span>Item</span><span>Qty</span><span>Unit</span><span>Price (AED)</span><span /></div>
      {items.map((it, i) => {
        const trailing = it.id === lastId && isBlank(it);
        return (
          <div className="item-row" key={it.id}>
            <ProductPicker value={it.name} products={products} stats={known} disabled={disabled}
              placeholder={i === 0 ? 'Search products, e.g. Onion' : 'Next item'} ariaLabel={`Item ${i + 1}`}
              onChange={(name) => setName(it, name)} onPick={(p) => pick(it, p)} />
            <input type="number" inputMode="decimal" step="any" min="0" value={it.qty} disabled={disabled}
              aria-label={`Quantity of item ${i + 1}`} onChange={(e) => update(it.id, { qty: e.target.value })} />
            <select value={it.unit} disabled={disabled} aria-label={`Unit of item ${i + 1}`} onChange={(e) => update(it.id, { unit: e.target.value })}>
              {units.map((u) => <option key={u}>{u}</option>)}
            </select>
            <input type="number" inputMode="decimal" step="0.01" min="0" value={it.price} placeholder="0.00" disabled={disabled}
              aria-label={`Price of item ${i + 1}`} onChange={(e) => update(it.id, { price: e.target.value })} />
            {trailing ? <span /> : (
              <button type="button" className="ghost danger icon-btn" disabled={disabled} title="Remove this line"
                aria-label={`Remove ${it.name || `item ${i + 1}`}`} onClick={() => remove(it.id)}>
                <Icon name="x" size={15} />
              </button>
            )}
            <PriceHint it={it} item={known.get(itemKey(it.name))} isNew={!productByKey.has(itemKey(it.name))} baseUnits={baseUnits} editing={editing} />
          </div>
        );
      })}
    </div>
  );
}

/** Under an item being typed: what it cost last time, whether today's price is higher or lower, and if it's a new product. */
function PriceHint({ it, item, isNew, baseUnits, editing }) {
  const before = item?.history.find((h) => h.expenseId !== editing); // not the purchase being edited
  const newNote = isNew && it.name.trim() && <span className="new-product">New product – added to Products when you save.</span>;
  if (!before) return newNote ? <p className="item-hint">{newNote}</p> : null;
  const qty = Number(it.qty);
  const [baseUnit, factor] = baseUnits[it.unit] ?? [it.unit, 1];
  const now = it.price !== '' && qty > 0 && baseUnit === before.baseUnit ? Number(it.price) / (qty * factor) : null;
  return (
    <p className="item-hint">
      Last bought {shortDate(before.date)}{before.shop ? ` (${before.shop})` : ''}: {qtyText(before.qty, before.unit)} for {money0(before.price)} = {perUnit(before.unitPrice, before.baseUnit)}
      {now != null && <> · now {perUnit(now, baseUnit)} <Trend change={before.unitPrice > 0 ? (now - before.unitPrice) / before.unitPrice : null} /></>}
      {newNote && <> · {newNote}</>}
    </p>
  );
}

const CHIP_LIMIT = 6;
function ItemChips({ items = [], onAdd }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return <button type="button" className="link add-items" onClick={onAdd}><Icon name="plus" size={13} /> add items</button>;
  const shown = open ? items : items.slice(0, CHIP_LIMIT);
  return (
    <div className="item-chips">
      {shown.map((it, i) => <span key={i} className="item-chip">{it.name} <small>{qtyText(it.qty, it.unit)} · {money0(it.price)}</small></span>)}
      {items.length > CHIP_LIMIT && (
        <button type="button" className="link small" onClick={() => setOpen(!open)}>{open ? 'show less' : `+${items.length - CHIP_LIMIT} more`}</button>
      )}
    </div>
  );
}

const SORTS = {
  recent: ['Recently bought', (a, b) => b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name)],
  spent: ['Most spent', (a, b) => b.totalSpent - a.totalSpent || a.name.localeCompare(b.name)],
  often: ['Bought most often', (a, b) => b.timesBought - a.timesBought || b.lastDate.localeCompare(a.lastDate)],
  name: ['Name A–Z', (a, b) => a.name.localeCompare(b.name)],
};

function ItemsTable({ items, onOpenPurchase }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [open, setOpen] = useState(null);
  const q = itemKey(query);
  const rows = items.filter((it) => it.key.includes(q)).sort(SORTS[sort][1]);

  return (
    <Card title={`Items & prices (${items.length})`} accent="teal" actions={<>
        <SearchBox value={query} onChange={setQuery} placeholder="Find an item" />
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort items">
          {Object.entries(SORTS).map(([k, [text]]) => <option key={k} value={k}>{text}</option>)}
        </select>
      </>}>
      <p className="muted small" style={{ marginTop: 0 }}>
        Everything ever bought, with its latest price. Prices are compared per kg, litre or piece (500 g counts as 0.5 kg, a dozen as 12 pcs);
        ▲ / ▼ is dearer / cheaper than the time before. Click an item to see every time it was bought.
      </p>
      <div className="table-wrap">
        <table className="grid">
          <thead><tr><th>Item</th><th>Bought</th><th>Last bought</th><th>Last purchase</th><th>Latest price</th><th>Lowest</th><th>Highest</th><th>Average</th><th>Total qty</th><th>Total spent</th></tr></thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={10} className="empty">{items.length ? 'No item matches.' : 'No items yet – list them when you add a purchase, or use "add items" on a purchase above.'}</td></tr>
            )}
            {rows.map((it) => {
              const isOpen = open === it.key;
              return (
                <Fragment key={it.key}>
                  <tr className={isOpen ? 'current' : ''}>
                    <td>
                      <button type="button" className="link item-toggle" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : it.key)}>
                        <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={14} /> {it.name}
                      </button>
                    </td>
                    <td className="num">{it.timesBought}×</td>
                    <td>{date(it.lastDate)}</td>
                    <td className="num">{qtyText(it.last.qty, it.last.unit)} · {money0(it.last.price)}</td>
                    <td className="nowrap"><b className="num">{perUnit(it.unitPrice, it.unit)}</b> <Trend change={it.change} /></td>
                    <td className="num">{perUnit(it.minUnitPrice, it.unit)}</td>
                    <td className="num">{perUnit(it.maxUnitPrice, it.unit)}</td>
                    <td className="num">{perUnit(it.avgUnitPrice, it.unit)}</td>
                    <td className="num">{qtyText(it.totalQty, it.unit)}</td>
                    <td><Money value={it.totalSpent} bold /></td>
                  </tr>
                  {isOpen && <tr className="history"><td colSpan={10}><History item={it} onOpenPurchase={onOpenPurchase} /></td></tr>}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function History({ item, onOpenPurchase }) {
  const varies = item.maxUnitPrice > item.minUnitPrice;
  return (
    <div className="history-wrap">
      <table className="grid compact">
        <thead><tr><th>Date</th><th className="t">Shop / note</th><th className="t">Bought by</th><th>Qty</th><th>Price</th><th>Per unit</th><th></th></tr></thead>
        <tbody>
          {item.history.map((h, i) => {
            const comparable = varies && h.baseUnit === item.unit;
            return (
              <tr key={`${h.expenseId}-${i}`}>
                <td>{date(h.date)}</td>
                <td className="wrap">{h.shop}</td>
                <td className="t">{h.paidBy}</td>
                <td className="num">{qtyText(h.qty, h.unit)}</td>
                <td><Money value={h.price} /></td>
                <td className="nowrap">
                  <span className="num">{perUnit(h.unitPrice, h.baseUnit)}</span>
                  {comparable && h.unitPrice === item.minUnitPrice && <> <span className="badge badge-emerald">lowest</span></>}
                  {comparable && h.unitPrice === item.maxUnitPrice && <> <span className="badge badge-rose">highest</span></>}
                </td>
                <td><button type="button" className="link" onClick={() => onOpenPurchase(h.expenseId)}>edit purchase</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
