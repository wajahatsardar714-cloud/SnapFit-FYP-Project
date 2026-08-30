import { BarChart3, Camera, Ruler } from 'lucide-react';

// Real product capabilities, not invented marketing copy -- size
// recommendation, guided desktop/phone capture, and analytics are all
// features that actually ship in this app today.
const VALUE_PROPS = [
  { icon: Ruler, text: 'AI-powered size recommendations from a single photo' },
  { icon: Camera, text: 'Guided capture works on desktop or phone — no app needed' },
  { icon: BarChart3, text: 'Track fit accuracy and cut returns with built-in analytics' },
];

// Solid flat fill only -- no gradient/illustration, per the theme's design
// constraints. Hidden below sm: a 42/58 split has no sensible mobile layout.
function AuthSidePanel() {
  return (
    <div className="hidden bg-primary-600 sm:flex sm:w-[42%] sm:flex-col sm:justify-center sm:px-12 lg:px-16">
      <div className="max-w-sm">
        <p className="text-lg font-semibold text-white">Built for merchants who hate returns.</p>
        <ul className="mt-8 space-y-6">
          {VALUE_PROPS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3">
              <Icon size={20} className="mt-0.5 shrink-0 text-primary-100" />
              <span className="text-sm text-primary-50">{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default AuthSidePanel;
