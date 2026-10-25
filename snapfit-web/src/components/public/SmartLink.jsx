import { Link } from 'react-router-dom';

const EXTERNAL = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

/**
 * One link primitive for content data.
 *   to             route ("/pricing", "/#faq"), same-page anchor ("#faq") or
 *                  external/mailto URL
 *   live           false renders the children as plain text (page not built yet)
 *   className      classes for the link
 *   plainClassName classes for the plain-text span when `live` is false
 * Routes use the router; anchors and external URLs are plain <a>.
 */
function SmartLink({ to, live = true, className = '', plainClassName = '', children, ...rest }) {
  if (!live) return <span className={plainClassName || undefined}>{children}</span>;

  if (EXTERNAL.test(to) || to.startsWith('#')) {
    return (
      <a href={to} className={className} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <Link to={to} className={className} {...rest}>
      {children}
    </Link>
  );
}

export default SmartLink;
