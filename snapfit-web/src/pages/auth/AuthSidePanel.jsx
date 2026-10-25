import { ICONS } from '../../components/public/icons';
import { panel } from '../../content/auth';

// Navy panel beside the auth form on large screens; hidden below lg, where
// the form gets the full width.
function AuthSidePanel() {
  return (
    <aside className="hidden rounded-2xl bg-navy p-10 lg:block">
      <p className="type-h3 text-inverse">{panel.title}</p>
      <ul className="mt-8 space-y-6">
        {panel.points.map(({ icon, text }) => {
          const Icon = ICONS[icon];
          return (
            <li key={text} className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-raised text-inverse-accent">
                <Icon aria-hidden="true" size={18} />
              </span>
              <span className="pt-1.5 text-[0.9375rem] leading-relaxed text-inverse-muted">{text}</span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

export default AuthSidePanel;
