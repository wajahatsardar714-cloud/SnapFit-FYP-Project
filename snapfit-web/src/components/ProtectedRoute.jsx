import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { homePathFor } from '../utils/roles';
import { signInPathFor } from '../utils/returnPath';

// `role` (optional) limits the area to one account role; the other role is
// sent to its own home instead (a merchant hitting /admin lands on /dashboard).
// A signed-out visitor goes to the login, which brings them back here after.
function ProtectedRoute({ role, children }) {
  const { isAuthenticated, loading, merchant, role: currentRole } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="animate-spin text-muted" size={28} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={signInPathFor(location)} replace />;
  }

  if (role && currentRole !== role) {
    return <Navigate to={homePathFor(merchant)} replace />;
  }

  return children;
}

export default ProtectedRoute;
