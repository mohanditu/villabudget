import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useData } from '../api.js';
import { ErrorBanner, Loading, PageHeader, Field, Card, Money } from '../components/ui.jsx';
import { shortCycleLabel } from '../format.js';

export default function Settings() {
  const { data, error, reload } = useData('/settings');
  const [form, setForm] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { if (data) setForm({ ...data, categoriesText: data.categories.join('\n') }); }, [data]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      await api.put('/settings', {
        villaName: form.villaName,
        startMonth: form.startMonth,
        collectionAmount: Number(form.collectionAmount),
        roundDecimals: Number(form.roundDecimals),
        leaveMethod: form.leaveMethod,
        dailyRate: Number(form.dailyRate),
        minLeaveDays: Number(form.minLeaveDays),
        openingCash: Number(form.openingCash),
        openingDigital: Number(form.openingDigital),
        categories: form.categoriesText.split('\n').map((s) => s.trim()).filter(Boolean),
        groceryCategory: form.groceryCategory,
      });
      setMsg('Settings saved – all balances are recalculated.');
      reload();
    } catch (e2) { setErr(e2); }
  };

  const removeChange = async (c) => {
    const what = c.scope === 'once' ? 'this one-off amount' : 'this change (later cycles go back to the amount before it)';
    if (!confirm(`Remove ${what} for ${shortCycleLabel({ key: c.cycle, half: c.cycle.endsWith('-01') ? '1st' : '15th' })}?`)) return;
    setErr(null);
    try { await api.del(`/collections/${c.cycle}/amount`); setMsg('Amount change removed – balances recalculated.'); reload(); } catch (e2) { setErr(e2); }
  };

  if (error) return <ErrorBanner error={error} />;
  if (!form) return <Loading />;

  return (
    <>
      <PageHeader title="Settings" icon="settings" subtitle="Collection amount, rounding, leave rule and opening balances" />
      <Card title="Villa settings" accent="primary">
        <ErrorBanner error={err} onClose={() => setErr(null)} />
        {msg && <p className="ok">{msg}</p>}
        <form className="form" onSubmit={submit}>
          <Field label="Villa name"><input value={form.villaName} onChange={set('villaName')} /></Field>
          <Field label="Start month (1st of a month)"><input type="date" value={form.startMonth} onChange={set('startMonth')} /></Field>
          <Field label="Standard collection per person per cycle (AED)"><input type="number" step="0.01" value={form.collectionAmount} onChange={set('collectionAmount')} /></Field>
          <Field label="Leave / part-cycle rule">
            <select value={form.leaveMethod ?? 'prorata'} onChange={set('leaveMethod')}>
              <option value="dailyRate">Daily rate (as in the Google Sheet)</option>
              <option value="prorata">Pro-rata by days in the cycle</option>
            </select>
          </Field>
          {form.leaveMethod === 'dailyRate' ? (
            <Field label="Daily rate (AED per day)"><input type="number" step="0.01" min="0" value={form.dailyRate} onChange={set('dailyRate')} /></Field>
          ) : (
            <Field label="Decimal places for part-cycle amounts">
              <select value={form.roundDecimals} onChange={set('roundDecimals')}>
                <option value={2}>2 – exact (93.75)</option><option value={0}>0 – whole AED (94)</option>
              </select>
            </Field>
          )}
          <Field label="Minimum days away for leave credit"><input type="number" min="1" value={form.minLeaveDays} onChange={set('minLeaveDays')} /></Field>
          <Field label="Opening Cash balance (AED)"><input type="number" step="0.01" value={form.openingCash} onChange={set('openingCash')} /></Field>
          <Field label="Opening Digital balance (AED)"><input type="number" step="0.01" value={form.openingDigital} onChange={set('openingDigital')} /></Field>
          <Field label="Expense categories (one per line)" wide>
            <textarea rows={7} value={form.categoriesText} onChange={set('categoriesText')} />
          </Field>
          <Field label="Category shown on the Groceries page">
            <select value={form.groceryCategory ?? 'Grocery'} onChange={set('groceryCategory')}>
              {[...new Set([form.groceryCategory ?? 'Grocery', ...form.categoriesText.split('\n').map((s) => s.trim()).filter(Boolean)])]
                .map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <div className="form-actions"><button type="submit">Save settings</button></div>
        </form>
        <p className="hint">Changing the standard collection here changes every cycle, including past ones. To change it for one cycle, or from a cycle onwards, use <b>Change amount</b> on the Collections page. Opening balances are the money already in hand on the start date. The daily rate rule matches the villa's Google Sheet: 6.58 = 100 × 24 ÷ 365. A whole cycle present always costs one collection, a whole cycle away costs nothing, and anything in between is days present × rate, capped at one collection. Changing the rule recalculates every cycle.</p>
      </Card>

      <Card title={`Collection amount changes (${data.amountChanges?.length ?? 0})`} accent="violet">
        {!data.amountChanges?.length ? (
          <p className="muted">None – every cycle uses the standard {data.collectionAmount} AED. Open a cycle on the <Link to="/collections">Collections</Link> page and use <b>Change amount</b>.</p>
        ) : (
          <div className="table-wrap">
            <table className="grid compact">
              <thead><tr><th>Cycle</th><th>Amount per person</th><th className="t">Applies to</th><th className="t">Note</th><th></th></tr></thead>
              <tbody>
                {data.amountChanges.map((c) => (
                  <tr key={c.cycle}>
                    <td><Link to={`/collections/${c.cycle}`}>{shortCycleLabel({ key: c.cycle, half: c.cycle.endsWith('-01') ? '1st' : '15th' })}</Link></td>
                    <td><Money value={c.amount} bold />{c.amount === 0 && <span className="muted"> 0.00 (no collection)</span>}</td>
                    <td className="t"><span className={`badge badge-${c.scope === 'once' ? 'orange' : 'violet'}`}>{c.scope === 'once' ? 'Only this cycle' : 'This and later cycles'}</span></td>
                    <td className="wrap">{c.note}</td>
                    <td className="nowrap">
                      <Link to={`/collections/${c.cycle}`}>edit</Link>{' '}
                      <button type="button" className="link danger" onClick={() => removeChange(c)}>remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
