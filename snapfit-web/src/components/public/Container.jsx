/**
 * Centred page column: the site's one content width (80rem, 1280px) with side
 * gutters (16px on phones). Sections, prose, tables and FAQs all fill it.
 *   as         element to render (default 'div')
 *   className  extra classes
 */
function Container({ as: Tag = 'div', className = '', children, ...rest }) {
  return (
    <Tag className={`mx-auto w-full min-w-0 max-w-7xl px-4 sm:px-6 lg:px-8 ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export default Container;
