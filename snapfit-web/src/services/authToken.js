// Where the session token lives. "Remember me" keeps it in localStorage, so it
// survives closing the browser; otherwise sessionStorage, so the session ends
// with the browser session. Every read, write and clear goes through here.
const TOKEN_KEY = 'token';

export function readToken() {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
}

export function saveToken(token, { remember = true } = {}) {
  clearToken();
  (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}
