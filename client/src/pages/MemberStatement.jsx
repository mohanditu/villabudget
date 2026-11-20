import { Link, useParams } from 'react-router-dom';
import { useData } from '../api.js';
import { Money, ErrorBanner, Loading, PageHeader, StatusChip, Kpi, Card } from '../components/ui.jsx';
import { cycleLabel, date } from '../format.js';

export default function MemberStatement() {
  const { id } = useParams();
  const { data, error, loading } = useData(`/members/${id}/statement`);
  if (error) return <ErrorBanner error={error} />;
  if (loading && !data) return <Loading />;
  const { member, summary, cycles, leaves } = data;

  return (
    <>
      <PageHeader title={member.name} icon="users" subtitle="Member statement – every cycle, leave and payment">
        <StatusChip status={summary.status} />
        <Link className="btn ghost" to="/members">← All members</Link>
      </PageHeader>
      <section className="kpis">
        <Kpi label="Current balance" value={summary.currentBalance} color={summary.currentBalance > 0 ? 'rose' : 'emerald'} icon="wallet"
          hint={summary.currentBalance > 0 ? 'owes the villa' : summary.currentBalance < 0 ? 'advance / credit' : 'all clear'} />
        <Kpi label="Total paid" value={summary.paid} color="blue" icon="coins" />
        <Kpi label="Leave days" value={summary.leaveDays} isMoney={false} color="orange" icon="plane" />
        <Kpi label="Leave credits" value={summary.leaveCredit} color="amber" icon="receipt" />
      </section>

      <Card title="Statement by cycle" accent="primary">
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr><th>Cycle</th><th>Brought forward</th><th>Days in villa</th><th>Leave days</th><th>Due</th><th>Leave credit</th>
                <th>Net payable</th><th>Paid cash</th><th>Paid digital</th><th>Balance</th></tr>
            </thead>
            <tbody>
              {cycles.map((c) => (
                <tr key={c.key} className={c.isFuture ? 'inactive' : ''}>
                  <td><Link to={`/collections/${c.key}`}>{cycleLabel(c)}</Link></td>
                  <td><Money value={c.broughtForward} signed /></td>
                  <td className="c">{c.memberDays} / {c.days}</td>
                  <td className={`c ${c.leaveDays ? 'leave' : ''}`}>{c.leaveDays || '–'}</td>
                  <td><Money value={c.due} /></td>
                  <td className={c.leaveCredit ? 'leave' : ''}><Money value={c.leaveCredit} /></td>
                  <td><Money value={c.netPayable} signed bold /></td>
                  <td><Money value={c.paidCash} /></td>
                  <td><Money value={c.paidDigital} /></td>
                  <td><Money value={c.balance} signed bold /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Leaves" accent="orange">
        {leaves.length === 0 ? <p className="muted">No leave recorded.</p> : (
          <ul className="plain">
            {leaves.map((l) => <li key={l._id}>{date(l.startDate)} → {date(l.endDate)} {l.reason && <span className="muted">· {l.reason}</span>}</li>)}
          </ul>
        )}
      </Card>
    </>
  );
}
