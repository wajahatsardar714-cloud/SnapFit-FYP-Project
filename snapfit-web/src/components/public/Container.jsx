const SIZE_CLASSES = {
  default: 'max-w-6xl',
  narrow: 'max-w-3xl',
  reading: 'max-w-reading',
};

/**
 * Centred page column with the site's side gutters (16px on phones).
 *   size       'default' (72rem) | 'narrow' (48rem) | 'reading' (70ch)
 *   as         element to render (default 'div')
 *   className  extra classes
 */
function Container({ size = 'default', as: Tag = 'div', className = '', children, ...rest }) {
  return (
    <Tag className={`mx-auto w-full min-w-0 px-4 sm:px-6 lg:px-8 ${SIZE_CLASSES[size]} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export default Container;
