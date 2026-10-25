// Account roles returned by the backend on merchant.role. Anything other than
// the super admin (including an older account without the field) is a merchant.
export const ROLES = { MERCHANT: 'merchant', SUPER_ADMIN: 'superadmin' };

const HOME_PATHS = { [ROLES.MERCHANT]: '/dashboard', [ROLES.SUPER_ADMIN]: '/admin' };

export function roleOf(account) {
  return account?.role === ROLES.SUPER_ADMIN ? ROLES.SUPER_ADMIN : ROLES.MERCHANT;
}

export function homePathFor(account) {
  return HOME_PATHS[roleOf(account)];
}
