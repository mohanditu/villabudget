import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useData } from '../api.js';
import { Money, ErrorBanner, Loading, PageHeader, Field, Card, CategoryBadge, ModeBadge, Kpi } from '../components/ui.jsx';
import { BillDropzone, SavedBills, BillThumbs, AttachButton, BillViewer } from '../components/bills.jsx';
import { date, money, todayISO } from '../format.js';
import { uploadBills } from '../upload.js';

const empty = () => ({ date: todayISO(), category: '', description: '', paidFrom: 'Cash', amount: '', paidBy: '', ref: '' });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function Expenses() {
  const { data, error, loading, reload } = useData('/expenses');
  const settings = useData('/settings').data;
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [pending, setPending] = useState([]);      // files chosen in the form, uploaded on save
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);      // "Uploading bill 1 of 2…"
  const [busyRow, setBusyRow] = useState(null);    // expense id getting bills from the list
  const [viewer, setViewer] = useState(null);      // { id, index }
  const [month, setMonth] = useState('');
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const byId = (id) => data?.find((x) => x._id === id);
  const label = (x) => `${x.category} ${money(x.amount)} on ${date(x.date)}`;

  const resetForm = () => { setForm(empty()); setEditing(null); setPending([]); };

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setSaving(true);
    try {
      const body = { ...form, amount: Number(form.amount) };
      const saved = editing ? await api.put(`/expenses/${editing}`, body) : await api.post('/expenses', body);
      let note = editing ? 'Expense updated.' : 'Expense added.';
      if (pending.length) {
        const { errors } = await uploadBills(saved._id, pending, (n, total) => setStatus(`Uploading bill ${n} of ${total}…`));
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

  const remove = async (x) => {
    const bills = x.bills?.length ? ` This also deletes its ${plural(x.bills.length, 'bill')}.` : '';
    if (!confirm(`Delete ${label(x)}?${bills}`)) return;
    try { await api.del(`/expenses/${x._id}`); if (editing === x._id) resetForm(); reload(); } catch (e) { setErr(e); }
  };

  const attach = async (x, files) => {
    setErr(null);
    setMsg(null);
    setBusyRow(x._id);
    const { errors } = await uploadBills(x._id, files);
    if (errors.length) setErr(new Error(`Not attached – ${errors.join(' · ')}`));
    const attached = files.length - errors.length;
    if (attached) setMsg(`${plural(attached, 'bill')} attached to ${label(x)}.`);
    await reload();
    setBusyRow(null);
  };

  const deleteBill = async (x, bill) => {
    if (!confirm(`Delete the bill "${bill.name}" from ${label(x)}?`)) return;
    try {
      await api.del(`/expenses/${x._id}/bills/${bill.fileId}`);
      if ((x.bills?.length ?? 0) <= 1) setViewer(null);
      await reload();
    } catch (e) { setErr(e); }
  };

  const months = useMemo(() => [...new Set((data ?? []).map((x) => x.date.slice(0, 7)))].sort().reverse(), [data]);
  const rows = (data ?? []).filter((x) => !month || x.date.startsWith(month));
  const totals = rows.reduce((t, x) => ({ ...t, [x.paidFrom]: (t[x.paidFrom] || 0) + x.amount, all: t.all + x.amount }), { all: 0 });
  const byCat = rows.reduce((t, x) => ({ ...t, [x.category]: (t[x.category] || 0) + x.amount }), {});
  const withBills = rows.filter((x) => x.bills?.length).length;

  if (error) return <ErrorBanner error={error} />;
  if (loading && !data) return <Loading />;

  const editingExpense = editing ? byId(editing) : null;
  const viewing = viewer ? byId(viewer.id) : null;

  return (
    <>
      <PageHeader title="Expenses" icon="receipt" subtitle="Water, grocery, gas, cleaning and everything else – paid from Cash or Digital" />
      <section className="kpis">
        <Kpi label="Paid from cash" value={totals.Cash || 0} color="emerald" icon="cash" hint={month ? 'selected month' : 'all time'} />
        <Kpi label="Paid digitally" value={totals.Digital || 0} color="blue" icon="bank" hint={month ? 'selected month' : 'all time'} />
        <Kpi label="Total spent" value={totals.all} color="violet" icon="receipt" hint={`${plural(rows.length, 'expense')} · ${withBills} with bills`} />
      </section>
      <Card title={editing ? 'Edit expense' : 'Add expense'} accent="violet">
        <ErrorBanner error={err} onClose={() => setErr(null)} />
        {msg && <p className="ok">{msg}</p>}
        <form className="form" onSubmit={submit}>
          <Field label="Date *"><input type="date" required value={form.date} onChange={set('date')} /></Field>
          <Field label="Category *">
            <select required value={form.category} onChange={set('category')}>
              <option value="">— choose —</option>
              {(settings?.categories ?? []).map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Paid from *">
            <select value={form.paidFrom} onChange={set('paidFrom')}><option>Cash</option><option>Digital</option></select>
          </Field>
          <Field label="Amount (AED) *"><input type="number" step="0.01" required value={form.amount} onChange={set('amount')} /></Field>
          <Field label="Description" wide><input value={form.description} onChange={set('description')} placeholder="e.g. 10 × water bottles" /></Field>
          <Field label="Paid / bought by"><input value={form.paidBy} onChange={set('paidBy')} /></Field>
          <Field label="Bill / ref no."><input value={form.ref} onChange={set('ref')} /></Field>
          <div className="field bills-field">
            <span>Bills (photo or PDF)</span>
            {editingExpense && (
              <SavedBills bills={editingExpense.bills} disabled={saving}
                onOpen={(i) => setViewer({ id: editingExpense._id, index: i })}
                onDelete={(b) => deleteBill(editingExpense, b)} />
            )}
            <BillDropzone files={pending} onChange={setPending} onError={setErr} disabled={saving} />
          </div>
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {editing ? 'Save changes' : 'Add expense'}{pending.length ? ` + ${plural(pending.length, 'bill')}` : ''}
            </button>
            {editing && <button type="button" className="ghost" disabled={saving} onClick={resetForm}>Cancel</button>}
            {status && <span className="upload-status"><span className="spinner" /> {status}</span>}
          </div>
        </form>
      </Card>

      <Card title="Expense list" accent="primary" actions={
          <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Filter by month">
            <option value="">All months</option>
            {months.map((m) => <option key={m} value={m}>{date(`${m}-01`).slice(3)}</option>)}
          </select>}>
        <p className="muted small">
          {Object.entries(byCat).map(([c, v]) => <span key={c} style={{ marginRight: '.6rem' }}><CategoryBadge name={c} categories={settings?.categories} /> {money(v)}</span>)}
        </p>
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>Date</th><th>Category</th><th className="t">Description</th><th>Paid from</th><th>Amount</th><th className="t">Paid by</th><th className="t">Ref</th><th className="t">Bills</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={9} className="empty">No expenses.</td></tr>}
              {rows.map((x) => (
                <tr key={x._id}>
                  <td>{date(x.date)}</td><td><CategoryBadge name={x.category} categories={settings?.categories} /></td>
                  <td className="wrap">
                    {x.description}
                    {x.items?.length > 0 && <> <Link to="/groceries" className="small" title={x.items.map((i) => i.name).join(', ')}>{plural(x.items.length, 'item')}</Link></>}
                  </td>
                  <td><ModeBadge mode={x.paidFrom} /></td>
                  <td><Money value={x.amount} bold /></td><td className="t">{x.paidBy}</td><td className="t">{x.ref}</td>
                  <td className="t">
                    <div className="bills-cell">
                      <BillThumbs bills={x.bills} onOpen={(i) => setViewer({ id: x._id, index: i })} />
                      <AttachButton busy={busyRow === x._id} onFiles={(files) => attach(x, files)} onError={setErr}
                        label={`Attach bill photos or PDFs to ${label(x)}`} />
                    </div>
                  </td>
                  <td className="nowrap">
                    <button type="button" className="link" onClick={() => { setEditing(x._id); setPending([]); setForm({ ...empty(), ...x, amount: String(x.amount) }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>edit</button>
                    <button type="button" className="link danger" onClick={() => remove(x)}>delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {viewing?.bills?.length > 0 && (
        <BillViewer bills={viewing.bills} index={viewer.index} title={label(viewing)}
          onClose={() => setViewer(null)} onDelete={(b) => deleteBill(viewing, b)} />
      )}
    </>
  );
}
