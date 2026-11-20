import { Link } from 'react-router-dom';
import { useData } from '../api.js';
import { Kpi, Money, ErrorBanner, Loading, PageHeader, StatusChip, Card } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { shortCycleLabel, shortDate, date } from '../format.js';

export default function Dashboard() {
  const { data, error, loading } = useData('/ledger');
  const settings = useData('/settings').data;
  if (error) return <ErrorBanner error={error} />;
  if (loading && !data) return <Loading />;
  const { kpis, cycles, memberSummary, currentKey, today } = data;
  const owing = memberSummary.filter((m) => m.currentBalance > 0.004).sort((a, b) => b.currentBalance - a.currentBalance);
  const advance = memberSummary.filter((m) => m.currentBalance < -0.004);
  const onLeave = memberSummary.filter((m) => m.status === 'On Leave');

  return (
    <>
      <PageHeader title={settings?.villaName ?? 'Villa'} subtitle="Budget dashboard · all figures in AED" icon="dashboard">
        <span className="date-pill"><Icon name="calendar" size={14} /> Today {date(today)}</span>
        {currentKey && <Link className="btn" to={`/collections/${currentKey}`}><Icon name="coins" size={16} /> Current collection</Link>}
      </PageHeader>

      <section className="kpis">
        <Kpi label="Cash in hand" value={kpis.cash} hint="after all entries" color="emerald" icon="cash" />
        <Kpi label="Digital balance" value={kpis.digital} hint="bank / wallet" color="blue" icon="bank" />
        <Kpi label="Total balance" value={kpis.total} hint="cash + digital" color="violet" icon="wallet" />
        <Kpi label="Pending dues" value={kpis.pendingNow} hint="owed by members now" color={kpis.pendingNow > 0 ? 'rose' : 'teal'} icon="alert" />
        <Kpi label="In villa today" value={kpis.inVilla} isMoney={false} hint="active members" color="teal" icon="users" />
        <Kpi label="On leave today" value={kpis.onLeave} isMoney={false} hint="from leave records" color="orange" icon="plane" />
      </section>

      <Card title="Cycle-by-cycle balance" accent="primary"
        actions={<span className="muted small">Opening + Collections − Expenses ± Transfers = Closing</span>}>
        <div className="table-wrap">
          <table className="grid dense">
            <thead>
              <tr>
                <th rowSpan={2}>Cycle</th><th rowSpan={2}>Dates</th><th rowSpan={2}>Per<br />person</th>
                <th colSpan={2}>Opening (b/f)</th>
                <th colSpan={2} className="grp-cash">Collections</th>
                <th colSpan={2} className="grp-exp">Expenses</th>
                <th rowSpan={2}>Transfers<br />to cash</th>
                <th colSpan={3} className="grp-close">Closing (c/f)</th>
                <th rowSpan={2}>Pending</th><th rowSpan={2}>Leave<br />credits</th>
              </tr>
              <tr>
                <th>Cash</th><th>Digital</th>
                <th className="grp-cash">Cash</th><th className="grp-cash">Digital</th>
                <th className="grp-exp">Cash</th><th className="grp-exp">Digital</th>
                <th className="grp-close">Cash</th><th className="grp-close">Digital</th><th className="grp-close">Total</th>
              </tr>
            </thead>
            <tbody>
              {cycles.map((c) => (
                <tr key={c.key} className={c.isCurrent ? 'current' : ''}>
                  <td><Link to={`/collections/${c.key}`}>{shortCycleLabel(c)}</Link></td>
                  <td className="muted">{shortDate(c.startDate)} – {shortDate(c.endDate)}</td>
                  <td className={settings && c.collectionAmount !== settings.collectionAmount ? 'amt-changed' : ''}
                    title={c.amountRule ? `${c.amountRule.scope === 'once' ? 'Only this cycle' : 'Changed from ' + c.amountRule.cycle}${c.amountRule.note ? ' – ' + c.amountRule.note : ''}` : 'Standard amount'}>
                    <Money value={c.collectionAmount} /></td>
                  <td><Money value={c.fund.openingCash} /></td>
                  <td><Money value={c.fund.openingDigital} /></td>
                  <td><Money value={c.fund.collectionsCash} /></td>
                  <td><Money value={c.fund.collectionsDigital} /></td>
                  <td><Money value={c.fund.expensesCash} /></td>
                  <td><Money value={c.fund.expensesDigital} /></td>
                  <td><Money value={c.fund.transfersToCash} /></td>
                  <td className="hl"><Money value={c.fund.closingCash} bold /></td>
                  <td className="hl"><Money value={c.fund.closingDigital} bold /></td>
                  <td className="hl"><Money value={c.fund.closingTotal} bold /></td>
                  <td><Money value={c.isFuture ? null : c.summary.pending} signed /></td>
                  <td className={c.summary.leaveCredits ? 'leave' : ''}><Money value={c.summary.leaveCredits} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <section className="two-col">
        <Card title={`Who owes the villa (${owing.length})`} accent="rose">
          {owing.length === 0 ? <p className="muted">Nobody – all collections are up to date. 🎉</p> : (
            <table className="grid compact">
              <thead><tr><th>Member</th><th>Status</th><th>Owes</th></tr></thead>
              <tbody>
                {owing.map((m) => (
                  <tr key={m.member}>
                    <td><Link to={`/members/${m.member}`}>{m.name}</Link></td>
                    <td><StatusChip status={m.status} /></td>
                    <td><Money value={m.currentBalance} signed bold /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <div>
          <Card title={`On leave today (${onLeave.length})`} accent="orange">
            {onLeave.length === 0 ? <p className="muted">Everyone is in the villa today.</p> : (
              <ul className="plain">{onLeave.map((m) => <li key={m.member}><Link to={`/members/${m.member}`}>{m.name}</Link></li>)}</ul>
            )}
          </Card>
          <Card title={`Paid in advance (${advance.length})`} accent="emerald">
            {advance.length === 0 ? <p className="muted">No advances held.</p> : (
              <table className="grid compact">
                <tbody>
                  {advance.map((m) => (
                    <tr key={m.member}><td><Link to={`/members/${m.member}`}>{m.name}</Link></td><td><Money value={m.currentBalance} signed bold /></td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </section>
    </>
  );
}
