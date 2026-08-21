import { Link, NavLink, Outlet } from 'react-router-dom';

function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="border-b bg-white">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/login" className="text-lg font-bold text-gray-800">
            SnapFit
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <NavLink
              to="/login"
              className={({ isActive }) => (isActive ? 'font-medium text-gray-900' : 'text-gray-600 hover:text-gray-900')}
            >
              Sign in
            </NavLink>
            <NavLink
              to="/register"
              className={({ isActive }) => (isActive ? 'font-medium text-gray-900' : 'text-gray-600 hover:text-gray-900')}
            >
              Register
            </NavLink>
          </div>
        </nav>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

export default PublicLayout;
