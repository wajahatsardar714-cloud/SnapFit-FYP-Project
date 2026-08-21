import { Link, Outlet } from 'react-router-dom';
import { LayoutDashboard, Package, BarChart3, Settings } from 'lucide-react';

const navItems = [
  { label: 'Overview', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Size Charts', to: '/dashboard/size-charts', icon: Package },
  { label: 'Analytics', to: '/dashboard/analytics', icon: BarChart3 },
  { label: 'Settings', to: '/dashboard/settings', icon: Settings },
];

function DashboardLayout() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-60 shrink-0 border-r bg-white">
        <div className="px-4 py-4 text-lg font-bold text-gray-800">SnapFit</div>
        <nav className="flex flex-col gap-1 px-2">
          {navItems.map(({ label, to, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-white px-6 py-3">
          <span className="text-sm font-medium text-gray-700">Dashboard</span>
        </header>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
