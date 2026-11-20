import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useData } from '../api.js';
import { Money, ErrorBanner, Loading, PageHeader, StatusChip, Field, Card } from '../components/ui.jsx';
import { date } from '../format.js';

const EMPTY = { name: '', room: '', phone: '', joinDate: '', exitDate: '', openingBalance: 0, notes: '' };

export default function Members() {
  const { data, error, loading, reload } = useData('/members');
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      const body = { ...form, openingBalance: Number(form.openingBalance || 0) };
      if (editing) await api.put(`/members/${editing}`, body); else await api.post('/members', body);
      setMsg(editing ? `Saved ${form.name}.` : `Added ${form.name}.`);
      setForm(EMPTY);
      setEditing(null);
      reload();
    } catch (e2) { setErr(e2); }
  };
  const edit = (m) => {
    setEditing(m._id);
    setForm({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, m[k] ?? EMPTY[k]])) });
    setMsg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const remove = async (m) => {
    if (!confirm(`Delete ${m.name}? (Only possible if they have no payments or leaves – otherwise set an Exit Date.)`)) return;
    try { await api.del(`/members/${m._id}`); reload(); } catch (e) { setErr(e); }
  };

  if (error) return <ErrorBanner error={error} />;
  if (loading && !data) return <Loading />;
  const active = data.filter((m) => m.status !== 'Left').length;

  return (
    <>
      <PageHeader title="Members" icon="users" subtitle={`${active} current · ${data.length} total · people can join and leave at any time`} />
      <Card title={editing ? `Edit ${form.name}` : 'Add member'} accent="violet">
        <ErrorBanner error={err} onClose={() => setErr(null)} />
        {msg && <p className="ok">{msg}</p>}
        <form className="form" onSubmit={submit}>
          <Field label="Name *"><input required value={form.name} onChange={set('name')} /></Field>
          <Field label="Room / bed"><input value={form.room} onChange={set('room')} /></Field>
          <Field label="Phone"><input value={form.phone} onChange={set('phone')} /></Field>
          <Field label="Join date (first day)"><input type="date" value={form.joinDate || ''} onChange={set('joinDate')} /></Field>
          <Field label="Exit date (last day)"><input type="date" value={form.exitDate || ''} onChange={set('exitDate')} /></Field>
          <Field label="Opening balance (+ owes / − advance)"><input type="number" step="0.01" value={form.openingBalance} onChange={set('openingBalance')} /></Field>
          <Field label="Notes" wide><input value={form.notes} onChange={set('notes')} /></Field>
          <div className="form-actions">
            <button type="submit">{editing ? 'Save changes' : 'Add member'}</button>
            {editing && <button type="button" className="ghost" onClick={() => { setEditing(null); setForm(EMPTY); }}>Cancel</button>}
          </div>
        </form>
        <p className="hint">Leave Join Date empty for people already living in the villa. A person joining or leaving mid-cycle pays only for their days. Never delete someone who has paid – set the Exit Date instead.</p>
      </Card>

      <Card title="All members" accent="primary">
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr><th>#</th><th>Name</th><th>Status</th><th>Room</th><th>Phone</th><th>Joined</th><th>Exit</th>
                <th>Opening</th><th>Total paid</th><th>Leave days</th><th>Leave credits</th><th>Current balance</th><th></th></tr>
            </thead>
            <tbody>
              {data.map((m, i) => (
                <tr key={m._id} className={m.status === 'Left' ? 'inactive' : ''}>
                  <td className="c">{i + 1}</td>
                  <td><Link to={`/members/${m._id}`}>{m.name}</Link></td>
                  <td><StatusChip status={m.status} /></td>
                  <td>{m.room}</td><td>{m.phone}</td>
                  <td>{date(m.joinDate)}</td><td>{date(m.exitDate)}</td>
                  <td><Money value={m.openingBalance} signed /></td>
                  <td><Money value={m.paid} /></td>
                  <td className="c">{m.leaveDays || '–'}</td>
                  <td><Money value={m.leaveCredit} /></td>
                  <td><Money value={m.currentBalance} signed bold /></td>
                  <td className="nowrap">
                    <button type="button" className="link" onClick={() => edit(m)}>edit</button>
                    <button type="button" className="link danger" onClick={() => remove(m)}>delete</button>
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
