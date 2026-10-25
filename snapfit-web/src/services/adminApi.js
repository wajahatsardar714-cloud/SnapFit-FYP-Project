import api from './api';

// Super admin endpoints (/api/admin/*). Same axios instance as the rest of the
// app, so the signed-in admin's bearer token is attached automatically.
const data = (request) => request.then((res) => res.data);
const merchantPath = (id) => `/admin/merchants/${encodeURIComponent(id)}`;

export const getOverview = () => data(api.get('/admin/overview'));

export const listMerchants = (params) => data(api.get('/admin/merchants', { params }));

export const getMerchant = (id) => data(api.get(merchantPath(id)));

export const updateSubscription = (id, body) => data(api.patch(`${merchantPath(id)}/subscription`, body));

export const setMerchantStatus = (id, body) => data(api.patch(`${merchantPath(id)}/status`, body));

export const regenerateApiKey = (id) => data(api.post(`${merchantPath(id)}/api-key`));

export const revokeApiKey = (id) => data(api.delete(`${merchantPath(id)}/api-key`));

export const resetMerchantPassword = (id, password) => data(api.post(`${merchantPath(id)}/reset-password`, { password }));

export const deleteMerchant = (id) => data(api.delete(merchantPath(id)));

export const getAnalytics = (days) => data(api.get('/admin/analytics', { params: { days } }));

export const exportAnalyticsCsv = () => data(api.get('/admin/analytics/export', { responseType: 'blob' }));

export const getAuditLog = (params) => data(api.get('/admin/audit-log', { params }));

// The demo studio's widget calls this through fetch, not axios; the path is
// relative to the API base URL.
export const demoRecommendPath = (merchantId) => `/admin/demo/recommend?merchantId=${encodeURIComponent(merchantId)}`;
