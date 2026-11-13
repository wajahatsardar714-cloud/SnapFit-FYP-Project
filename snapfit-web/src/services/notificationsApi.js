import api from './api';

// In-app notifications (/api/notifications/*), for merchants and the super
// admin alike. Same axios instance as the rest of the app, so the bearer token
// is attached automatically.
const data = (request) => request.then((res) => res.data);
const notificationPath = (id) => `/notifications/${encodeURIComponent(id)}`;

// Newest first. `unread: true` lists only the unread ones.
export function listNotifications({ page = 1, limit = 20, unread = false } = {}) {
  const params = { page, limit };
  if (unread) params.unread = true;
  return data(api.get('/notifications', { params }));
}

export const getUnreadCount = () => data(api.get('/notifications/unread-count'));

export const markNotificationRead = (id) => data(api.patch(`${notificationPath(id)}/read`));

export const markAllNotificationsRead = () => data(api.post('/notifications/read-all'));

export const deleteNotification = (id) => data(api.delete(notificationPath(id)));

// { preferences: { [type]: boolean }, types: [{ type, label, group, important }] }
export const getNotificationPreferences = () => data(api.get('/notifications/preferences'));

export const updateNotificationPreferences = (preferences) =>
  data(api.put('/notifications/preferences', { preferences }));

// The bell and the notifications page each keep their own copy of the list;
// whichever changes it tells the other through this window event.
export const NOTIFICATIONS_CHANGED_EVENT = 'snapfit:notifications-changed';

export function emitNotificationsChanged(source) {
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT, { detail: { source } }));
}
