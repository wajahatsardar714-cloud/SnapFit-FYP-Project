import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { homePathFor } from '../utils/roles';

// `role` (optional) limits the area to one account role; the other role is
// sent to its own home instead (a merchant hitting /admin lands on /dashboard).
function ProtectedRoute({ role, children }) {
  const { isAuthenticated, loading, merchant, role: currentRole } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="animate-spin text-muted" size={28} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (role && currentRole !== role) {
    return <Navigate to={homePathFor(merchant)} replace />;
  }

  return children;
}

export default ProtectedRoute;
