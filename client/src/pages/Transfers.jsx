import { useState } from 'react';
import { api, useData } from '../api.js';
import { Money, ErrorBanner, Loading, PageHeader, Field, Card } from '../components/ui.jsx';
import { date, money, todayISO } from '../format.js';

const empty = () => ({ date: todayISO(), direction: 'Cash to Digital', amount: '', doneBy: '', notes: '' });

export default function Transfers() {
  const { data, error, loading, reload } = useData('/transfers');
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      await api.post('/transfers', { ...form, amount: Number(form.amount) });
      setForm(empty());
      reload();
    } catch (e2) { setErr(e2); }
  };
  const remove = async (t) => {
    if (!confirm(`Delete transfer of ${money(t.amount)} on ${date(t.date)}?`)) return;
    try { await api.del(`/transfers/${t._id}`); reload(); } catch (e) { setErr(e); }
  };

  if (error) return <ErrorBanner error={error} />;
  if (loading && !data) return <Loading />;

  return (
    <>
      <PageHeader title="Cash ↔ Digital transfers" icon="transfer" subtitle="Move money between cash in hand and the bank / wallet" />
      <Card title="New transfer" accent="teal">
        <p className="hint" style={{ marginTop: 0, marginBottom: '.9rem' }}>Use when cash is deposited into the bank / wallet (Cash to Digital) or digital money is withdrawn as cash (Digital to Cash). The total stays the same – only the split changes.</p>
        <ErrorBanner error={err} onClose={() => setErr(null)} />
        <form className="form" onSubmit={submit}>
          <Field label="Date *"><input type="date" required value={form.date} onChange={set('date')} /></Field>
          <Field label="Direction *">
            <select value={form.direction} onChange={set('direction')}><option>Cash to Digital</option><option>Digital to Cash</option></select>
          </Field>
          <Field label="Amount (AED) *"><input type="number" step="0.01" min="0" required value={form.amount} onChange={set('amount')} /></Field>
          <Field label="Done by"><input value={form.doneBy} onChange={set('doneBy')} /></Field>
          <Field label="Notes" wide><input value={form.notes} onChange={set('notes')} /></Field>
          <div className="form-actions"><button type="submit">Add transfer</button></div>
        </form>
      </Card>
      <Card title={`Transfers (${data.length})`} accent="primary">
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>Date</th><th>Direction</th><th>Amount</th><th className="t">Done by</th><th className="t">Notes</th><th></th></tr></thead>
            <tbody>
              {data.length === 0 && <tr><td colSpan={6} className="empty">No transfers.</td></tr>}
              {data.map((t) => (
                <tr key={t._id}>
                  <td>{date(t.date)}</td><td><span className={`badge badge-${t.direction === 'Cash to Digital' ? 'blue' : 'emerald'}`}>{t.direction}</span></td><td><Money value={t.amount} bold /></td><td className="t">{t.doneBy}</td><td className="wrap">{t.notes}</td>
                  <td><button type="button" className="link danger" onClick={() => remove(t)}>delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
