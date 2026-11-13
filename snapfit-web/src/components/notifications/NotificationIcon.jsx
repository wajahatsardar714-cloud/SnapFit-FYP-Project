import { notificationStyle } from './notificationMeta';

// A round, tinted icon for a notification's type family.
function NotificationIcon({ type, size = 'md' }) {
  const { Icon, tint } = notificationStyle(type);
  const box = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  return (
    <span className={`flex ${box} shrink-0 items-center justify-center rounded-full ${tint}`} aria-hidden="true">
      <Icon size={size === 'sm' ? 15 : 18} />
    </span>
  );
}

export default NotificationIcon;
