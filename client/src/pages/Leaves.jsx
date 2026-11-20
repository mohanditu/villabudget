import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useData } from '../api.js';
import { Money, ErrorBanner, Loading, PageHeader, Field, Card } from '../components/ui.jsx';
import { date, money } from '../format.js';
// Same calculation code as the server, so the preview always matches the real credit.
import { leaveCreditEstimate, leaveDayCount } from '../../../server/src/lib/ledger.js';

const EMPTY = { member: '', startDate: '', endDate: '', reason: '' };

function preview(start, end, settings) {
  if (!start || !end || end < start || !settings) return null;
  const leave = { startDate: start, endDate: end };
  return { days: leaveDayCount(leave), credit: leaveCreditEstimate(leave, settings) };
}

function ruleText(s) {
  if (s?.leaveMethod === 'dailyRate') {
    return `Each cycle is charged for the days present × ${money(s.dailyRate)} AED a day, never more than ${money(s.collectionAmount)} (a whole cycle away = nothing to pay).`;
  }
  return `Each cycle is charged only for the days present: ${money(s?.collectionAmount ?? 100)} × days present ÷ days in the cycle.`;
}

export default function Leaves() {
  const leaves = useData('/leaves');
  const members = useData('/members');
  const settings = useData('/settings');
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const p = useMemo(() => preview(form.startDate, form.endDate, settings.data), [form.startDate, form.endDate, settings.data]);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      if (editing) await api.put(`/leaves/${editing}`, form); else await api.post('/leaves', form);
      setMsg('Leave saved – the credit is applied to every cycle it touches.');
      setForm(EMPTY);
      setEditing(null);
      leaves.reload();
    } catch (e2) { setErr(e2); }
  };
  const remove = async (l) => {
    if (!confirm(`Delete leave of ${l.member?.name} (${date(l.startDate)} → ${date(l.endDate)})?`)) return;
    try { await api.del(`/leaves/${l._id}`); leaves.reload(); } catch (e) { setErr(e); }
  };

  if (leaves.error || members.error) return <ErrorBanner error={leaves.error || members.error} />;
  if (!leaves.data || !members.data) return <Loading />;
  const current = members.data.filter((m) => m.status !== 'Left');

  return (
    <>
      <PageHeader title="Leaves" icon="plane" subtitle="Mark who is away – they pay only for the days they are in the villa" />
      <Card title={editing ? 'Edit leave' : 'Mark a leave'} accent="orange">
        <p className="hint" style={{ marginTop: 0, marginBottom: '.9rem' }}>Enter the first and last day away (both count as away). {ruleText(settings.data)} If the person already paid, the credit becomes an advance deducted from their next collection.</p>
        <ErrorBanner error={err} onClose={() => setErr(null)} />
        {msg && <p className="ok">{msg}</p>}
        <form className="form" onSubmit={submit}>
          <Field label="Member *">
            <select required value={form.member} onChange={set('member')}>
              <option value="">— choose —</option>
              {current.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
            </select>
          </Field>
          <Field label="First day away *"><input type="date" required value={form.startDate} onChange={set('startDate')} /></Field>
          <Field label="Last day away *"><input type="date" required value={form.endDate} min={form.startDate} onChange={set('endDate')} /></Field>
          <Field label="Reason / notes" wide><input value={form.reason} onChange={set('reason')} /></Field>
          <div className="form-actions">
            {p && <span className="preview">{p.days} day(s) away · credit ≈ <b>{money(p.credit)}</b> AED</span>}
            <button type="submit">{editing ? 'Save changes' : 'Save leave'}</button>
            {editing && <button type="button" className="ghost" onClick={() => { setEditing(null); setForm(EMPTY); }}>Cancel</button>}
          </div>
        </form>
      </Card>

      <Card title={`Leave records (${leaves.data.length})`} accent="primary">
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>Member</th><th>First day</th><th>Last day</th><th>Days</th><th>Credit ≈</th><th className="t">Reason</th><th></th></tr></thead>
            <tbody>
              {leaves.data.length === 0 && <tr><td colSpan={7} className="empty">No leaves recorded.</td></tr>}
              {leaves.data.map((l) => (
                <tr key={l._id}>
                  <td><Link to={`/members/${l.member?._id}`}>{l.member?.name}</Link></td>
                  <td>{date(l.startDate)}</td><td>{date(l.endDate)}</td>
                  <td className="c">{l.days}{!l.eligible && <span className="muted small"> (below minimum)</span>}</td>
                  <td className="leave"><Money value={l.creditEstimate} /></td>
                  <td className="wrap">{l.reason}</td>
                  <td className="nowrap">
                    <button type="button" className="link" onClick={() => { setEditing(l._id); setForm({ member: l.member?._id, startDate: l.startDate, endDate: l.endDate, reason: l.reason }); }}>edit</button>
                    <button type="button" className="link danger" onClick={() => remove(l)}>delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
