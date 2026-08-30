import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CreditCard, KeyRound, Package, BarChart3, BookOpen, LogOut, Bell, Settings, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Badge from '../components/ui/Badge';
import { notifyInfo } from '../components/ui/toast';

const navItems = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, end: true },
  { label: 'Subscription', to: '/dashboard/subscription', icon: CreditCard },
  { label: 'API Key', to: '/dashboard/api-key', icon: KeyRound },
  { label: 'Size Charts', to: '/dashboard/size-charts', icon: Package },
  { label: 'Analytics', to: '/dashboard/analytics', icon: BarChart3 },
  { label: 'Docs', to: '/dashboard/docs', icon: BookOpen },
];

const PLAN_BADGE_VARIANT = { free: 'neutral', basic: 'info', pro: 'success', enterprise: 'warning' };

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const initials = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
  return initials.toUpperCase();
}

// Longest-prefix-first so a nested route (e.g. /dashboard/subscription/plans)
// matches "Subscription" rather than falling through to the exact-match-only
// Dashboard item.
function getPageTitle(pathname) {
  if (pathname.startsWith('/dashboard/settings')) return 'Settings';
  const match = [...navItems]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to)));
  return match?.label || 'Dashboard';
}

function DashboardLayout() {
  const { merchant, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const pageTitle = getPageTitle(location.pathname);
  const plan = merchant?.subscription?.plan || 'free';

  // DashboardLayout persists across nested /dashboard/* navigations (only the
  // Outlet content swaps) -- without this, an open account menu survives a
  // route change (e.g. browser back/forward) and its full-viewport overlay
  // silently swallows the next click on the new page.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const isSettingsActive = location.pathname.startsWith('/dashboard/settings');

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-surface-border bg-white">
        <div className="px-5 py-5 text-lg font-bold text-primary-600">SnapFit</div>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {navItems.map(({ label, to, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
                  isActive ? 'bg-primary-50 font-medium text-primary-700' : 'text-ink-700 hover:bg-gray-50'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-surface-border p-3">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-xs font-medium text-ink-500">Plan</span>
            <Badge variant={PLAN_BADGE_VARIANT[plan] || 'neutral'} className="capitalize">
              {plan}
            </Badge>
          </div>
          <button
            type="button"
            onClick={() => navigate('/dashboard/settings')}
            className={`mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
              isSettingsActive ? 'bg-primary-50 font-medium text-primary-700' : 'text-ink-700 hover:bg-gray-50'
            }`}
          >
            <Settings size={18} />
            Settings
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-surface-border bg-white px-6">
          <h1 className="text-base font-semibold text-ink-900">{pageTitle}</h1>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => notifyInfo("You're all caught up — no new notifications.")}
              className="rounded-lg p-2 text-ink-500 transition-colors duration-150 hover:bg-gray-50"
              aria-label="Notifications"
            >
              <Bell size={18} />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-2 transition-colors duration-150 hover:bg-gray-50"
                aria-haspopup="true"
                aria-expanded={menuOpen}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700">
                  {getInitials(merchant?.businessName || merchant?.name)}
                </span>
                <ChevronDown size={14} className="text-ink-500" />
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                  <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-surface-border bg-white p-1 shadow-card">
                    <div className="px-3 py-2">
                      <p className="truncate text-sm font-medium text-ink-900">{merchant?.businessName}</p>
                      <p className="truncate text-xs text-ink-500">{merchant?.email}</p>
                    </div>
                    <div className="my-1 border-t border-surface-border" />
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        navigate('/dashboard/settings');
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-700 transition-colors duration-150 hover:bg-gray-50"
                    >
                      <Settings size={16} />
                      Settings
                    </button>
                    <button
                      type="button"
                      onClick={logout}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger transition-colors duration-150 hover:bg-danger-bg"
                    >
                      <LogOut size={16} />
                      Log out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-surface-page">
          <div className="mx-auto max-w-7xl p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
