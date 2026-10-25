import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  ScrollText,
  Settings,
  ShieldCheck,
  Store,
  Sun,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const navItems = [
  { label: 'Overview', to: '/admin', icon: LayoutDashboard, end: true },
  { label: 'Merchants', to: '/admin/merchants', icon: Store },
  { label: 'Analytics', to: '/admin/analytics', icon: BarChart3 },
  { label: 'Demo Studio', to: '/admin/demo', icon: FlaskConical },
  { label: 'Audit Log', to: '/admin/audit-log', icon: ScrollText },
  { label: 'Settings', to: '/admin/settings', icon: Settings },
];

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin/40 focus-visible:ring-offset-2';

// Longest prefix first, so /admin/merchants/:id reads "Merchants" rather than
// falling through to the exact-match Overview item.
function getPageTitle(pathname) {
  const match = [...navItems]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to)));
  return match?.label || 'Overview';
}

export function SuperAdminBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-admin/30 bg-admin-soft px-2 py-0.5 text-xs font-semibold text-admin">
      <ShieldCheck size={13} aria-hidden="true" />
      Super Admin
    </span>
  );
}

function Sidebar({ email, onLogout }) {
  return (
    <div className="flex h-full flex-col border-r border-admin/20 bg-admin-soft">
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-admin text-admin-foreground">
          <ShieldCheck size={20} aria-hidden="true" />
        </span>
        <div className="leading-tight">
          <p className="text-base font-bold text-foreground">SnapFit</p>
          <p className="text-xs font-medium uppercase tracking-wide text-admin">Admin Console</p>
        </div>
      </div>

      <nav aria-label="Admin" className="flex flex-1 flex-col gap-1 px-3">
        {navItems.map(({ label, to, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${FOCUS_RING} ${
                isActive ? 'bg-admin font-medium text-admin-foreground' : 'text-foreground hover:bg-admin/10'
              }`
            }
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-admin/20 p-3">
        <p className="truncate px-3 text-xs text-muted-foreground" title={email}>
          {email}
        </p>
        <button
          type="button"
          onClick={onLogout}
          className={`mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-danger transition-colors duration-150 hover:bg-danger-soft ${FOCUS_RING}`}
        >
          <LogOut size={18} aria-hidden="true" />
          Log out
        </button>
      </div>
    </div>
  );
}

function AdminLayout() {
  const { merchant, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // The layout persists across /admin/* navigations; close the mobile drawer
  // whenever the page changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const closeOnEscape = (e) => e.key === 'Escape' && setDrawerOpen(false);
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [drawerOpen]);

  const sidebar = <Sidebar email={merchant?.email} onLogout={logout} />;

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden w-60 shrink-0 overflow-y-auto md:block">{sidebar}</aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-overlay/50" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <aside className="relative h-full w-64 bg-background">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className={`absolute right-3 top-5 rounded-lg p-1.5 text-muted-foreground hover:bg-admin/10 ${FOCUS_RING}`}
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border border-t-2 border-t-admin bg-background px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className={`rounded-lg p-2 text-muted-foreground hover:bg-surface-2 md:hidden ${FOCUS_RING}`}
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
            <h1 className="truncate text-base font-semibold text-foreground">{getPageTitle(location.pathname)}</h1>
            <SuperAdminBadge />
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            className={`rounded-lg p-2 text-muted-foreground transition-colors duration-150 hover:bg-surface-2 ${FOCUS_RING}`}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto bg-background">
          <div className="mx-auto max-w-7xl p-4 md:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;
