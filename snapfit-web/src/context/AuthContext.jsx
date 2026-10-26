import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { setAccountSuspendedHandler, setSubscriptionRequiredHandler } from '../services/api';
import { clearToken, readToken, saveToken } from '../services/authToken';
import { roleOf } from '../utils/roles';
import { PLAN_SELECTION_PATH } from '../utils/subscriptionAccess';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [merchant, setMerchant] = useState(null);
  const [token, setToken] = useState(readToken);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!readToken()) {
      setLoading(false);
      return;
    }

    api
      .get('/auth/me')
      .then((res) => setMerchant(res.data.merchant))
      .catch(() => {
        clearToken();
        setToken(null);
        setMerchant(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // `remember: false` keeps the session only until the browser closes.
  const login = useCallback(async (email, password, { remember = true } = {}) => {
    const res = await api.post('/auth/login', { email, password });
    saveToken(res.data.token, { remember });
    setToken(res.data.token);
    setMerchant(res.data.merchant);
    return res.data.merchant;
  }, []);

  const register = useCallback(async (formData) => {
    const res = await api.post('/auth/register', formData);
    saveToken(res.data.token);
    setToken(res.data.token);
    setMerchant(res.data.merchant);
    return res.data.merchant;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setToken(null);
    setMerchant(null);
    navigate('/signin');
  }, [navigate]);

  // A suspension can land on any request (e.g. an admin suspends the account
  // mid-session): end the session and say why. One toast id, so parallel
  // failing requests don't stack copies.
  useEffect(() => {
    setAccountSuspendedHandler((message) => {
      toast.error(message, { id: 'account-suspended' });
      logout();
    });
    return () => setAccountSuspendedHandler(null);
  }, [logout]);

  // Re-reads the account, e.g. after a plan change, so the subscription gate
  // opens (or closes) without a reload.
  const refreshMerchant = useCallback(async () => {
    const res = await api.get('/auth/me');
    setMerchant(res.data.merchant);
    return res.data.merchant;
  }, []);

  // The server says the subscription is no longer active (it may have expired
  // mid-session): sync the account so the gate locks, and go choose a plan.
  useEffect(() => {
    setSubscriptionRequiredHandler((message) => {
      toast.error(message, { id: 'subscription-required' });
      refreshMerchant().catch(() => {}); // best effort: the redirect below happens either way
      navigate(PLAN_SELECTION_PATH, { replace: true });
    });
    return () => setSubscriptionRequiredHandler(null);
  }, [navigate, refreshMerchant]);

  const updateMerchant = useCallback((patch) => {
    setMerchant((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const value = {
    merchant,
    token,
    loading,
    isAuthenticated: Boolean(merchant),
    role: merchant ? roleOf(merchant) : null,
    login,
    register,
    logout,
    refreshMerchant,
    updateMerchant,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
