import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Alert from './ui/Alert';
import { PLAN_SELECTION_PATH, isPathLockedFor, needsSubscription } from '../utils/subscriptionAccess';

// Until the merchant subscribes, only the subscription pages and settings
// render; every other dashboard page sends them to plan selection, with a
// banner saying why.
function SubscriptionGate({ children }) {
  const { merchant } = useAuth();
  const { pathname } = useLocation();

  if (!needsSubscription(merchant)) return children;
  if (isPathLockedFor(merchant, pathname)) return <Navigate to={PLAN_SELECTION_PATH} replace />;

  return (
    <>
      <Alert
        variant="warning"
        title="An active subscription is required"
        description="Choose a plan to unlock size charts, products, your API key and analytics."
        className="mb-6"
      />
      {children}
    </>
  );
}

export default SubscriptionGate;
