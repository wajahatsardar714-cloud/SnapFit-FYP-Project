/**
 * SnapFit mark and wordmark. Wrap it in a link where it should go home.
 *   name  wordmark text
 *   tone  'default' (navy wordmark, light backgrounds) | 'inverse' (white, navy backgrounds)
 */
function Logo({ name, tone = 'default' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${tone === 'inverse' ? 'text-inverse' : 'text-navy'}`}>
      <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="h-8 w-8 shrink-0">
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <g className="stroke-inverse" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M9 12V9h3M20 9h3v3M23 20v3h-3M12 23H9v-3" />
          <path d="M12.5 21.5c.8-2.4 2-3.5 3.5-3.5s2.7 1.1 3.5 3.5" />
        </g>
        <circle cx="16" cy="13.5" r="2.5" className="fill-inverse" />
      </svg>
      <span className="text-xl font-bold tracking-tight">{name}</span>
    </span>
  );
}

export default Logo;
