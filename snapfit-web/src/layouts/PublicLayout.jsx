import { Link, Outlet } from 'react-router-dom';

function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="border-b bg-white">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-bold text-gray-800">
            SnapFit
          </Link>
          <div className="flex items-center gap-6 text-sm text-gray-600">
            <Link to="/" className="hover:text-gray-900">
              Home
            </Link>
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
