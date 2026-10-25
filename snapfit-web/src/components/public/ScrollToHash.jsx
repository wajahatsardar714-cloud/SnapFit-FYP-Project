import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Router-driven scrolling for the public site: a link to "/#faq" scrolls to
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
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView?.();
    } else if (pathChanged) {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash, key]);

  return null;
}

export default ScrollToHash;
