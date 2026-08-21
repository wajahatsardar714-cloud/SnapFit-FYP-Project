import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, CreditCard, KeyRound, Package, BarChart3, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, end: true },
  { label: 'Subscription', to: '/dashboard/subscription', icon: CreditCard },
  { label: 'API Key', to: '/dashboard/api-key', icon: KeyRound },
  { label: 'Size Charts', to: '/dashboard/size-charts', icon: Package },
  { label: 'Analytics', to: '/dashboard/analytics', icon: BarChart3 },
];

function DashboardLayout() {
  const { merchant, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="flex w-60 shrink-0 flex-col bg-gray-900">
        <div className="px-4 py-4 text-lg font-bold text-white">SnapFit</div>
        <nav className="flex flex-1 flex-col gap-1 px-2">
          {navItems.map(({ label, to, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                  isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={logout}
          className="mx-2 mb-4 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-400 transition hover:bg-gray-800 hover:text-white"
        >
          <LogOut size={18} />
          Logout
        </button>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-white px-6 py-3">
          <span className="text-sm font-medium text-gray-700">Dashboard</span>
          {merchant && <span className="text-sm text-gray-500">{merchant.businessName}</span>}
        </header>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
