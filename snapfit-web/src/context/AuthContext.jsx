import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [merchant, setMerchant] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      setLoading(false);
      return;
    }

    api
      .get('/auth/me')
      .then((res) => setMerchant(res.data.merchant))
      .catch(() => {
        localStorage.removeItem('token');
        setToken(null);
        setMerchant(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', res.data.token);
    setToken(res.data.token);
    setMerchant(res.data.merchant);
    return res.data.merchant;
  }, []);

  const register = useCallback(async (formData) => {
    const res = await api.post('/auth/register', formData);
    localStorage.setItem('token', res.data.token);
    setToken(res.data.token);
    setMerchant(res.data.merchant);
    return res.data.merchant;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setMerchant(null);
    navigate('/login');
  }, [navigate]);

  const updateMerchant = useCallback((patch) => {
    setMerchant((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const value = {
    merchant,
    token,
    loading,
    isAuthenticated: Boolean(merchant),
    login,
    register,
    logout,
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
