import { beforeEach, describe, expect, it } from 'vitest';
import { clearToken, readToken, saveToken } from './authToken';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('authToken', () => {
  it('keeps a remembered token in localStorage', () => {
    saveToken('jwt');
    expect(localStorage.getItem('token')).toBe('jwt');
    expect(sessionStorage.getItem('token')).toBeNull();
    expect(readToken()).toBe('jwt');
  });

  it('keeps a session-only token in sessionStorage, replacing a remembered one', () => {
    saveToken('old');
    saveToken('jwt', { remember: false });
    expect(sessionStorage.getItem('token')).toBe('jwt');
    expect(localStorage.getItem('token')).toBeNull();
    expect(readToken()).toBe('jwt');
  });

  it('clears the token wherever it lives', () => {
    localStorage.setItem('token', 'a');
    sessionStorage.setItem('token', 'b');
    clearToken();
    expect(readToken()).toBeNull();
  });
});
