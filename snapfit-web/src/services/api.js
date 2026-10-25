import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// The backend answers any call from a suspended account with a 403 whose
// message mentions the suspension. AuthProvider registers how to end the
// session; the login form shows that message itself, so its call is skipped.
let onAccountSuspended = null;

export function setAccountSuspendedHandler(handler) {
  onAccountSuspended = handler;
}

export function isSuspendedError(error) {
  return error.response?.status === 403 && /suspended/i.test(error.response.data?.message || '');
}

// Locked merchant APIs answer an unsubscribed account with a 403 carrying this
// code. AuthProvider registers how to send the merchant to plan selection.
let onSubscriptionRequired = null;

export function setSubscriptionRequiredHandler(handler) {
  onSubscriptionRequired = handler;
}

export function isSubscriptionRequiredError(error) {
  return error.response?.status === 403 && error.response.data?.code === 'SUBSCRIPTION_REQUIRED';
}

api.interceptors.response.use(undefined, (error) => {
  if (isSuspendedError(error) && error.config?.url !== '/auth/login') {
    onAccountSuspended?.(error.response.data.message);
  } else if (isSubscriptionRequiredError(error)) {
    onSubscriptionRequired?.(error.response.data.message);
  }
  return Promise.reject(error);
});

export default api;
