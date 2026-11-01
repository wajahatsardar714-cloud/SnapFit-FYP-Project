import { useEffect, useRef, useState } from 'react';

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Content starts hidden only when it can be revealed: a browser with
// IntersectionObserver and no reduced-motion preference.
function canReveal() {
  return typeof window !== 'undefined' && 'IntersectionObserver' in window && !prefersReducedMotion();
}

/**
 * Fades and lifts its content in the first time it scrolls into view. The
 * content is in the page (and the layout) from the start -- only its opacity
 * and offset change -- so search engines, anchors and screen readers see it.
 *   className  extra classes on the wrapper
 */
function Reveal({ className = '', children }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(() => !canReveal());

  useEffect(() => {
    if (shown) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [shown]);

  return (
    <div
      ref={ref}
      className={`transition duration-700 ease-out motion-reduce:transition-none ${
        shown ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
      } ${className}`}
    >
      {children}
    </div>
  );
}

export default Reveal;
