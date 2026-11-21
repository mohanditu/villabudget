import { Fragment, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useData } from '../api.js';
import { Money, ErrorBanner, Loading, PageHeader, Field, Card, Kpi, CategoryBadge, SearchBox, Trend } from '../components/ui.jsx';
import { date } from '../format.js';
import { perUnit, searchProducts } from '../grocery.js';

// The list of things the villa buys. The Groceries page searches this list when items are typed in.

const NO_CATEGORY = 'No category';
const emptyForm = (keep = {}) => ({ name: '', category: keep.category ?? '', unit: keep.unit ?? 'pcs', notes: '' });
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

export default function Products() {
  const { data, error, loading, reload } = useData('/products');
  const [form, setForm] = useState(() => emptyForm());
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const nameRef = useRef(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const products = useMemo(() => data?.products ?? [], [data]);
  const suggested = useMemo(() => data?.categories ?? [], [data]);
  // categories in the suggested order, then any others, then "No category" last
  const catRank = (c) => (c === NO_CATEGORY ? 1e6 : suggested.indexOf(c) >= 0 ? suggested.indexOf(c) : 1e3);
  const catOf = (p) => p.category || NO_CATEGORY;
  const usedCategories = useMemo(
    () => [...new Set(products.map(catOf))].sort((a, b) => catRank(a) - catRank(b) || a.localeCompare(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, suggested],
  );

  const resetForm = (keep) => { setForm(emptyForm(keep)); setEditing(null); };

  const startEdit = (p) => {
    setForm({ name: p.name, category: p.category ?? '', unit: p.unit, notes: p.notes ?? '' });
    setEditing(p._id);
    setErr(null);
    setMsg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const cur = editing && products.find((p) => p._id === editing);
    const renaming = cur && cur.stats && form.name.trim() !== cur.name;
    if (renaming && !confirm(`Rename ${cur.name} to ${form.name.trim()}?\nIt is renamed in its ${plural(cur.stats.timesBought, 'past purchase')} too.`)) return;
    setBusy(true);
    try {
      if (editing) {
        const saved = await api.put(`/products/${editing}`, form);
        setMsg(`${saved.name} saved.${saved.renamedInPurchases ? ` Renamed in ${plural(saved.renamedInPurchases, 'past purchase')} too.` : ''}`);
        resetForm();
      } else {
        const saved = await api.post('/products', form);
        setMsg(`${saved.name} added – it now comes up in the item search on the Groceries page.`);
        resetForm(form); // keep the category and unit: the next product is often similar
        nameRef.current?.focus();
      }
      reload();
    } catch (e2) {
      setErr(e2);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p) => {
    if (!confirm(`Delete ${p.name} from the product list?`)) return;
    setErr(null);
    setMsg(null);
    try { await api.del(`/products/${p._id}`); if (editing === p._id) resetForm(); setMsg(`${p.name} deleted.`); reload(); } catch (e) { setErr(e); }
  };

  const addUnlisted = async () => {
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const { added } = await api.post('/products/from-purchases');
      setMsg(`${plural(added, 'product')} added from past purchases. Give them a category with edit.`);
      reload();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  if (error) return <ErrorBanner error={error} />;
  if (loading && !data) return <Loading />;

  const searching = query.trim() !== '';
  const found = searchProducts(products, query).filter((p) => !category || catOf(p) === category);
  // no search: grouped by category, A–Z inside; searching: one list, best match first
  const groups = searching
    ? [[null, found]]
    : usedCategories.map((c) => [c, found.filter((p) => catOf(p) === c).sort((a, b) => a.name.localeCompare(b.name))]).filter(([, list]) => list.length);
  const neverBought = products.filter((p) => !p.stats).length;
  const COLS = 9;

  return (
    <>
      <PageHeader title="Products" icon="package" subtitle="The list of things we buy – it is searched when you add items on the Groceries page" />
      <section className="kpis">
        <Kpi label="Products" value={products.length} isMoney={false} color="teal" icon="package" hint={`in ${plural(usedCategories.filter((c) => c !== NO_CATEGORY).length, 'category', 'categories')}`} />
        <Kpi label="Bought at least once" value={products.length - neverBought} isMoney={false} color="blue" icon="cart" hint="with price history" />
        <Kpi label="Not bought yet" value={neverBought} isMoney={false} color="slate" icon="tag" hint="no purchase recorded" />
      </section>

      <Card title={editing ? 'Edit product' : 'Add product'} accent="teal">
        <p className="hint" style={{ marginTop: 0, marginBottom: '.9rem' }}>
          Products come up in the item search on the <Link to="/groceries">Groceries</Link> page, with their usual unit filled in.
          An item typed there that isn't a product yet is added here on save (without a category). Renaming a product renames it in past purchases too, so its price history stays together.
        </p>
        {data.unlisted.length > 0 && (
          <div className="preview unlisted">
            <span><b>{plural(data.unlisted.length, 'item')}</b> bought before {data.unlisted.length === 1 ? "isn't" : "aren't"} in the list yet: {data.unlisted.slice(0, 12).join(', ')}{data.unlisted.length > 12 ? '…' : ''}</span>
            <button type="button" className="ghost" disabled={busy} onClick={addUnlisted}>Add {data.unlisted.length === 1 ? 'it' : 'them'}</button>
          </div>
        )}
        <ErrorBanner error={err} onClose={() => setErr(null)} />
        {msg && <p className="ok">{msg}</p>}
        <form className="form" onSubmit={submit}>
          <Field label="Product name *"><input ref={nameRef} required maxLength={80} value={form.name} onChange={set('name')} placeholder="e.g. Basmati rice" /></Field>
          <Field label="Category">
            <input list="product-categories" maxLength={40} value={form.category} onChange={set('category')} placeholder="e.g. Vegetables" />
          </Field>
          <Field label="Usual unit">
            <select value={form.unit} onChange={set('unit')}>{data.units.map((u) => <option key={u}>{u}</option>)}</select>
          </Field>
          <Field label="Notes"><input maxLength={200} value={form.notes} onChange={set('notes')} placeholder="brand, size, where it's cheapest…" /></Field>
          <div className="form-actions">
            <button type="submit" disabled={busy}>{editing ? 'Save changes' : 'Add product'}</button>
            {editing && <button type="button" className="ghost" disabled={busy} onClick={() => resetForm()}>Cancel</button>}
          </div>
        </form>
        <datalist id="product-categories">{suggested.map((c) => <option key={c} value={c} />)}</datalist>
      </Card>

      <Card title={`Product list (${products.length})`} accent="primary" actions={<>
          <SearchBox value={query} onChange={setQuery} placeholder="Search products or categories" />
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {usedCategories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </>}>
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>Product</th><th className="t">Category</th><th className="t">Unit</th><th>Bought</th><th>Last bought</th><th>Latest price</th><th>Lowest</th><th>Total spent</th><th></th></tr></thead>
            <tbody>
              {found.length === 0 && (
                <tr><td colSpan={COLS} className="empty">{products.length ? 'No product matches.' : 'No products yet – add the first one above.'}</td></tr>
              )}
              {groups.map(([cat, list]) => (
                <Fragment key={cat ?? 'all'}>
                  {cat && <tr className="group"><td colSpan={COLS}>{cat} <span className="muted">· {list.length}</span></td></tr>}
                  {list.map((p) => (
                    <tr key={p._id} className={editing === p._id ? 'current' : ''}>
                      <td>
                        <b>{p.name}</b>
                        {p.notes && <div className="muted small">{p.notes}</div>}
                      </td>
                      <td className="t">{p.category ? <CategoryBadge name={p.category} categories={suggested} /> : <span className="muted">–</span>}</td>
                      <td className="t">{p.unit}</td>
                      {p.stats ? (
                        <>
                          <td className="num">{p.stats.timesBought}×</td>
                          <td>{date(p.stats.lastDate)}</td>
                          <td className="nowrap"><b className="num">{perUnit(p.stats.unitPrice, p.stats.unit)}</b> <Trend change={p.stats.change} /></td>
                          <td className="num">{perUnit(p.stats.minUnitPrice, p.stats.unit)}</td>
                          <td><Money value={p.stats.totalSpent} bold /></td>
                        </>
                      ) : (
                        <td colSpan={5} className="muted not-bought">not bought yet</td>
                      )}
                      <td className="nowrap">
                        <button type="button" className="link" onClick={() => startEdit(p)}>edit</button>
                        <button type="button" className="link danger" onClick={() => remove(p)} disabled={!!p.stats}
                          title={p.stats ? `In ${plural(p.stats.timesBought, 'purchase')} – it can be renamed but not deleted` : undefined}>delete</button>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
