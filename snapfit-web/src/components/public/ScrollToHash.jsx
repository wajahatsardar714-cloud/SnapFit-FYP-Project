import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Router-driven scrolling for the public site: a deep link like "/#faq" scrolls to
 * that section, and moving to another page starts at its top. Render it next
 * to the page content inside the same Suspense boundary, so it runs once the
 * (lazy) page is in the DOM.
 */
function ScrollToHash() {
  const { pathname, hash, key } = useLocation();
  const previousPath = useRef(pathname);

  useEffect(() => {
    const pathChanged = previousPath.current !== pathname;
    previousPath.current = pathname;

    if (hash) {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      // A deep link to an FAQ question (or into one) opens it.
      const disclosure = target?.closest('details');
      if (disclosure) disclosure.open = true;
      target?.scrollIntoView?.();
    } else if (pathChanged) {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash, key]);

  return null;
}

export default ScrollToHash;
