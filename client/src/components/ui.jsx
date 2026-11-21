import { money, money0, balanceClass } from '../format.js';
import { Icon } from './icons.jsx';

export function Money({ value, signed = false, bold = false }) {
  const cls = [signed ? balanceClass(value) : '', bold ? 'b' : ''].join(' ').trim();
  return <span className={`num ${cls}`}>{money(value)}</span>;
}

/** Coloured KPI card. color: emerald | blue | violet | rose | teal | orange | amber | slate */
export function Kpi({ label, value, hint, color = 'slate', icon = 'coins', isMoney = true }) {
  return (
    <div className={`kpi kpi-${color}`}>
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        <span className="kpi-icon"><Icon name={icon} size={18} /></span>
      </div>
      <div className="kpi-value">
        {isMoney ? money0(value) : value}
        {isMoney && <span className="kpi-unit">AED</span>}
      </div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}

export function StatusChip({ status }) {
  if (!status) return null;
  return <span className={`chip chip-${status.replace(/\s/g, '').toLowerCase()}`}>{status}</span>;
}

const CAT_COLORS = ['blue', 'emerald', 'orange', 'violet', 'rose', 'teal', 'amber', 'slate'];
export function CategoryBadge({ name, categories = [] }) {
  const i = Math.max(0, categories.indexOf(name));
  return <span className={`badge badge-${CAT_COLORS[i % CAT_COLORS.length]}`}>{name}</span>;
}

export function ModeBadge({ mode }) {
  return <span className={`badge badge-${mode === 'Cash' ? 'emerald' : 'blue'}`}><Icon name={mode === 'Cash' ? 'cash' : 'bank'} size={12} /> {mode}</span>;
}

export function ErrorBanner({ error, onClose }) {
  if (!error) return null;
  return (
    <div className="error" role="alert">
      <span><Icon name="alert" size={16} /> {error.message || String(error)}</span>
      {onClose && <button type="button" className="link" onClick={onClose}>dismiss</button>}
    </div>
  );
}

export function Loading({ what = 'Loading' }) {
  return <div className="loading"><span className="spinner" /> {what}…</div>;
}

export function Field({ label, children, wide }) {
  return (
    <label className={`field ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function PageHeader({ title, subtitle, icon, children }) {
  return (
    <div className="page-header">
      <div className="page-title">
        {icon && <span className="page-icon"><Icon name={icon} size={22} /></span>}
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="subtitle">{subtitle}</p>}
        </div>
      </div>
      <div className="page-actions">{children}</div>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className="search">
      <Icon name="search" size={15} />
      <input type="search" value={value} placeholder={placeholder} aria-label={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** ▲ 12% (dearer, red) or ▼ 8% (cheaper, green) compared with the purchase before. */
export function Trend({ change }) {
  if (change == null || Math.abs(change) < 0.005) return null;
  const up = change > 0;
  return (
    <span className={`trend ${up ? 'up' : 'down'}`} title={`${up ? 'Dearer' : 'Cheaper'} than the time before`}>
      {up ? '▲' : '▼'} {Math.round(Math.abs(change) * 100)}%
    </span>
  );
}

export function Card({ title, accent, actions, children, className = '' }) {
  return (
    <section className={`card ${accent ? `card-${accent}` : ''} ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
