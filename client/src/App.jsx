import { NavLink, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Collections from './pages/Collections.jsx';
import Members from './pages/Members.jsx';
import MemberStatement from './pages/MemberStatement.jsx';
import Leaves from './pages/Leaves.jsx';
import Expenses from './pages/Expenses.jsx';
import Groceries from './pages/Groceries.jsx';
import Products from './pages/Products.jsx';
import Transfers from './pages/Transfers.jsx';
import Settings from './pages/Settings.jsx';
import { Icon } from './components/icons.jsx';

const NAV = [
  ['/', 'Dashboard', 'dashboard'],
  ['/collections', 'Collections', 'coins'],
  ['/members', 'Members', 'users'],
  ['/leaves', 'Leaves', 'plane'],
  ['/expenses', 'Expenses', 'receipt'],
  ['/groceries', 'Groceries', 'cart'],
  ['/products', 'Products', 'package'],
  ['/transfers', 'Transfers', 'transfer'],
  ['/settings', 'Settings', 'settings'],
];

export default function App() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo"><Icon name="home" size={20} /></span>
          <div>
            <div className="brand-name">Villa Budget</div>
            <div className="brand-sub">Shared expenses</div>
          </div>
        </div>
        <nav>
          {NAV.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <Icon name={icon} size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="foot-title">How it works</div>
          100 AED on the 1st &amp; 15th. Everyone pays only for the days they are in the villa.
        </div>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/collections" element={<Collections />} />
          <Route path="/collections/:key" element={<Collections />} />
          <Route path="/members" element={<Members />} />
          <Route path="/members/:id" element={<MemberStatement />} />
          <Route path="/leaves" element={<Leaves />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/groceries" element={<Groceries />} />
          <Route path="/products" element={<Products />} />
          <Route path="/transfers" element={<Transfers />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
    </div>
  );
}
