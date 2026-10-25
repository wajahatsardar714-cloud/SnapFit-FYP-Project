import { isSubscribed } from './plans';
import { ROLES, roleOf } from './roles';

export const PLAN_SELECTION_PATH = '/dashboard/subscription/plans';

// The dashboard areas a merchant can use before subscribing (logout lives in
// the header menu, so it is always reachable).
const UNLOCKED_PATHS = ['/dashboard/subscription', '/dashboard/settings'];

export function isPathUnlocked(pathname) {
  return UNLOCKED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

// The super admin is never gated; a merchant is until subscribed.
export function needsSubscription(account) {
  return roleOf(account) !== ROLES.SUPER_ADMIN && !isSubscribed(account);
}

export function isPathLockedFor(account, pathname) {
  return needsSubscription(account) && !isPathUnlocked(pathname);
}
