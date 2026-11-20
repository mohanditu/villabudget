import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, useData } from '../api.js';
import { Money, ErrorBanner, Loading, PageHeader, StatusChip, Card, ModeBadge, Kpi } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { cycleLabel, shortCycleLabel, date, money, money0, todayISO } from '../format.js';

function PayCell({ row, cycleKey, onSaved, onError }) {
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('Cash');
  const [busy, setBusy] = useState(false);
  const save = async (value) => {
    const amt = Number(value ?? amount);
    if (!amt) return;
    setBusy(true);
    try {
      await api.post('/payments', { member: row.member, cycle: cycleKey, mode, amount: amt, date: todayISO() });
      setAmount('');
      onSaved();
    } catch (e) { onError(e); } finally { setBusy(false); }
  };
  return (
    <div className="pay">
      <input type="number" step="0.01" placeholder="amount" value={amount} onChange={(e) => setAmount(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()} aria-label={`Amount paid by ${row.name}`} />
      <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Paid from">
        <option>Cash</option><option>Digital</option>
      </select>
      <button type="button" disabled={busy || !amount} onClick={() => save()}>Save</button>
      {row.balance > 0.004 && (
        <button type="button" className="success" disabled={busy} title={`Record ${money(row.balance)} – the full balance`} onClick={() => save(row.balance)}>
          <Icon name="check" size={14} /> Full
        </button>
      )}
    </div>
  );
}

const halfOf = (key) => (key.endsWith('-01') ? '1st' : '15th');

/** Collection per person for the selected cycle, with "only this cycle" / "this and later cycles" changes. */
function CycleAmount({ data, onSaved, onError }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ amount: '', scope: 'once', note: '' });
  const [busy, setBusy] = useState(false);
  const r = data.amountRule;
  const standard = data.rule?.collectionAmount ?? 100;
  const source = !r ? 'Standard amount'
    : r.scope === 'once' ? 'Only this cycle'
      : r.cycle === data.key ? 'From this cycle onwards' : `Since ${shortCycleLabel({ key: r.cycle, half: halfOf(r.cycle) })}`;
  const tone = !r ? '' : r.scope === 'once' ? 'once' : 'changed';

  const open = () => {
    setForm({ amount: String(data.collectionAmount), scope: data.hasOwnAmount ? r.scope : 'once', note: data.hasOwnAmount ? r.note : '' });
    setEditing(true);
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put(`/collections/${data.key}/amount`, { amount: Number(form.amount), scope: form.scope, note: form.note });
      setEditing(false);
      onSaved();
    } catch (e2) { onError(e2); } finally { setBusy(false); }
  };
  const reset = async () => {
    if (!confirm(`Remove the change for ${cycleLabel(data)}? This cycle goes back to ${money(data.amountFallback)} AED${r?.scope === 'onward' ? ', and so do the later cycles that followed it' : ''}.`)) return;
    setBusy(true);
    try { await api.del(`/collections/${data.key}/amount`); onSaved(); } catch (e) { onError(e); } finally { setBusy(false); }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <section className={`amount-bar ${tone}`}>
      <div className="amount-main">
        <span className="amount-icon"><Icon name="coins" size={20} /></span>
        <div>
          <div className="amount-label">Collection per person · this cycle</div>
          <div className="amount-value">
            {money0(data.collectionAmount)} <small>AED</small>
            <span className={`badge badge-${!r ? 'slate' : r.scope === 'once' ? 'orange' : 'violet'}`}>{source}</span>
          </div>
          <div className="muted small">
            {r?.note && <>{r.note} · </>}
            {r && r.cycle !== data.key && <>set on <Link to={`/collections/${r.cycle}`}>{shortCycleLabel({ key: r.cycle, half: halfOf(r.cycle) })}</Link> · </>}
            standard {money(standard)}{data.dailyRate != null && <> · part cycle {money(data.dailyRate)} AED a day</>}
          </div>
        </div>
      </div>
      {!editing && (
        <div className="amount-actions">
          {data.hasOwnAmount && <button type="button" className="link danger" disabled={busy} onClick={reset}>Reset to {money0(data.amountFallback)}</button>}
          <button type="button" className="ghost" onClick={open}><Icon name="pencil" size={15} /> Change amount</button>
        </div>
      )}
      {editing && (
        <form className="amount-form" onSubmit={save}>
          <label className="field">
            <span>New amount per person (AED)</span>
            <input type="number" step="0.01" min="0" required autoFocus value={form.amount} onChange={set('amount')} />
          </label>
          <fieldset className="scope">
            <legend>Applies to</legend>
            <label className="radio-card">
              <input type="radio" name="scope" value="once" checked={form.scope === 'once'} onChange={set('scope')} />
              <span><b>Only this cycle</b><small>{cycleLabel(data)} – the cycles after it stay as they are</small></span>
            </label>
            <label className="radio-card">
              <input type="radio" name="scope" value="onward" checked={form.scope === 'onward'} onChange={set('scope')} />
              <span><b>This and all later cycles</b><small>From {cycleLabel(data)} until the next change</small></span>
            </label>
          </fieldset>
          <label className="field note">
            <span>Note (optional)</span>
            <input value={form.note} maxLength={200} onChange={set('note')} placeholder="e.g. extra for the new gas cylinder" />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={busy}>Save amount</button>
            <button type="button" className="ghost" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
            <span className="muted small">Dues and balances from this cycle on are recalculated; payments already recorded stay.</span>
          </div>
        </form>
      )}
    </section>
  );
}

export default function Collections() {
  const { key } = useParams();
  const navigate = useNavigate();
  const ledger = useData(key ? null : '/ledger');
  const cycleKey = key || ledger.data?.currentKey;
  const { data, error, loading, reload } = useData(cycleKey ? `/collections/${cycleKey}` : null);
  const [showAll, setShowAll] = useState(false);
  const [actionError, setActionError] = useState(null);

  if (error || ledger.error) return <ErrorBanner error={error || ledger.error} />;
  if (!data) return <Loading />;

  const visible = data.rows.filter((r) => showAll || r.memberDays > 0 || Math.abs(r.broughtForward) > 0.004 || r.paidCash || r.paidDigital);
  const removePayment = async (id) => {
    if (!confirm('Delete this payment?')) return;
    try { await api.del(`/payments/${id}`); reload(); } catch (e) { setActionError(e); }
  };
  const nameOf = (id) => data.rows.find((r) => r.member === String(id))?.name ?? '?';
  const f = data.fund;
  const s = data.summary;
  const progress = s.dueAfterCredits > 0 ? Math.min(100, Math.round((s.collected / (s.collected + s.pending || 1)) * 100)) : 0;

  return (
    <>
      <PageHeader title="Collections" icon="coins"
        subtitle={`${date(data.startDate)} – ${date(data.endDate)} · ${data.days} days · ${data.dailyRate != null
          ? `whole cycle ${money0(data.collectionAmount)}, part cycle = days present × ${money(data.dailyRate)} (max ${money0(data.collectionAmount)})`
          : `each person pays ${money0(data.collectionAmount)} × days present ÷ ${data.days}`}${loading ? ' · updating…' : ''}`}>
        <div className="cycle-nav">
          <button type="button" className="ghost icon-btn" disabled={!data.prevKey} onClick={() => navigate(`/collections/${data.prevKey}`)} aria-label="Previous cycle">
            <Icon name="chevronLeft" size={16} />
          </button>
          <span className="cycle-title">{cycleLabel(data)}</span>
          <button type="button" className="ghost icon-btn" onClick={() => navigate(`/collections/${data.nextKey}`)} aria-label="Next cycle">
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      </PageHeader>
      <ErrorBanner error={actionError} onClose={() => setActionError(null)} />
      <CycleAmount key={data.key} data={data} onSaved={reload} onError={setActionError} />

      <section className="kpis">
        <Kpi label="Due this cycle" value={s.dueAfterCredits} hint={`${s.membersCharged} members charged`} color="violet" icon="receipt" />
        <Kpi label="Collected" value={s.collected} hint={`${progress}% of what is owed`} color="emerald" icon="check" />
        <Kpi label="Still pending" value={s.pending} hint="incl. earlier cycles" color={s.pending > 0 ? 'rose' : 'teal'} icon="alert" />
        <Kpi label="Leave credits" value={s.leaveCredits} hint="days not in the villa" color="orange" icon="plane" />
      </section>

      <section className="two-col">
        <Card title="Villa balance this cycle" accent="blue">
          <table className="grid compact">
            <thead><tr><th></th><th className="grp-cash">Cash</th><th className="grp-digital">Digital</th><th className="grp-close">Total</th></tr></thead>
            <tbody>
              {[['Opening (b/f)', f.openingCash, f.openingDigital],
                ['+ Collections', f.collectionsCash, f.collectionsDigital],
                ['− Expenses', -f.expensesCash, -f.expensesDigital],
                ['± Transfers', f.transfersToCash, -f.transfersToCash],
              ].map(([l, a, b]) => (
                <tr key={l}><td>{l}</td><td><Money value={a} /></td><td><Money value={b} /></td><td><Money value={a + b} /></td></tr>
              ))}
              <tr className="total"><td>Closing (c/f)</td><td><Money value={f.closingCash} bold /></td><td><Money value={f.closingDigital} bold /></td><td><Money value={f.closingTotal} bold /></td></tr>
            </tbody>
          </table>
        </Card>
        <Card title="Collection status" accent="violet">
          <dl className="stats">
            <dt><span className="dot" style={{ background: 'var(--violet)' }} />Due after leave credits</dt><dd>{money(s.dueAfterCredits)}</dd>
            <dt><span className="dot" style={{ background: 'var(--orange)' }} />Leave credits given</dt><dd>{money(s.leaveCredits)}</dd>
            <dt><span className="dot" style={{ background: 'var(--emerald)' }} />Collected (cash + digital)</dt><dd className="advance">{money(s.collected)}</dd>
            <dt><span className="dot" style={{ background: 'var(--rose)' }} />Still pending</dt><dd className={s.pending > 0 ? 'owes' : ''}>{money(s.pending)}</dd>
            <dt><span className="dot" style={{ background: 'var(--teal)' }} />Advance held for members</dt><dd>{money(s.advance)}</dd>
          </dl>
        </Card>
      </section>

      <Card title="Members" accent="primary"
        actions={<label className="check"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> show people not in the villa</label>}>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Member</th><th>Brought<br />forward</th><th>Days in<br />villa</th><th>Leave<br />days</th><th>Due</th>
                <th>Leave<br />credit</th><th className="grp-1st">Net<br />payable</th><th className="grp-cash">Paid<br />cash</th>
                <th className="grp-digital">Paid<br />digital</th><th className="grp-close">Balance</th><th>Record payment</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.member} className={r.memberDays === 0 ? 'inactive' : ''}>
                  <td><Link to={`/members/${r.member}`}>{r.name}</Link> <StatusChip status={r.status === 'Active' ? null : r.status} /></td>
                  <td><Money value={r.broughtForward} signed /></td>
                  <td className="c">{r.memberDays}</td>
                  <td className={`c ${r.leaveDays ? 'leave' : ''}`}>{r.leaveDays || '–'}</td>
                  <td><Money value={r.due} /></td>
                  <td className={r.leaveCredit ? 'leave' : ''}><Money value={r.leaveCredit} /></td>
                  <td><Money value={r.netPayable} signed bold /></td>
                  <td><Money value={r.paidCash} /></td>
                  <td><Money value={r.paidDigital} /></td>
                  <td><Money value={r.balance} signed bold /></td>
                  <td><PayCell row={r} cycleKey={data.key} onSaved={reload} onError={setActionError} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">Red = still owes · Green (minus) = paid in advance – deducted automatically from the next collection. Use a minus amount for a refund.</p>
      </Card>

      <Card title={`Payments recorded for this cycle (${data.payments.length})`} accent="emerald">
        {data.payments.length === 0 ? <p className="muted">No payments yet – use “Record payment” above.</p> : (
          <table className="grid compact">
            <thead><tr><th>Date</th><th>Member</th><th>Mode</th><th>Amount</th><th></th></tr></thead>
            <tbody>
              {data.payments.map((p) => (
                <tr key={p._id}>
                  <td>{date(p.date)}</td><td>{nameOf(p.member)}</td><td><ModeBadge mode={p.mode} /></td><td><Money value={p.amount} bold /></td>
                  <td><button type="button" className="link danger" onClick={() => removePayment(p._id)}>delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
