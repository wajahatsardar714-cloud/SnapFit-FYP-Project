// Deep links into the signed-in areas: a signed-out visitor who opens one is
// sent to the login with the page in ?next=, and comes back to it after
// logging in. In the URL (not router state) so it survives a reload of the
// login page and can be shared.
export const NEXT_PARAM = 'next';

/** The login page's path that returns to `location` ({ pathname, search, hash }) after login. */
export function signInPathFor({ pathname, search = '', hash = '' }) {
  return `/signin?${NEXT_PARAM}=${encodeURIComponent(`${pathname}${search}${hash}`)}`;
}

/**
 * The page to return to from a login page's query string, or null. Only a path
 * on this site: one leading "/", never "//host" or "/\host" (which browsers
 * read as another site), so a crafted link can't send a user elsewhere.
 */
export function returnPathFrom(search) {
  const next = new URLSearchParams(search).get(NEXT_PARAM);
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  return next;
}
