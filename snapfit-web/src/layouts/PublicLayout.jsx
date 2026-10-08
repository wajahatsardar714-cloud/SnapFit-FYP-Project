import { Link, NavLink, Outlet } from 'react-router-dom';

function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-border bg-white">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/login" className="text-lg font-bold text-primary">
            SnapFit
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <NavLink
              to="/login"
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 transition-colors duration-150 ${
                  isActive ? 'font-medium text-foreground' : 'text-foreground hover:text-foreground'
                }`
              }
            >
              Sign in
            </NavLink>
            <Link
              to="/register"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors duration-150 hover:bg-primary-hover"
            >
              Get Started
            </Link>
          </div>
        </nav>
      </header>

      <main className="flex-1 bg-background">
        <Outlet />
      </main>
    </div>
  );
}

export default PublicLayout;
