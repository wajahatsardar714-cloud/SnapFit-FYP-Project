import api from './api';

// Super admin announcements to merchants (/api/admin/announcements).
const data = (request) => request.then((res) => res.data);

// body: { title, body, link?, audience: { type, plans?, merchantIds? }, scheduledAt? }
export const createAnnouncement = (body) => data(api.post('/admin/announcements', body));

export const listAnnouncements = () => data(api.get('/admin/announcements'));

export const cancelAnnouncement = (id) =>
  data(api.post(`/admin/announcements/${encodeURIComponent(id)}/cancel`));
