import logo from '../../assets/snapfit-logo.png';

const SIZE_CLASSES = { md: 'h-8', lg: 'h-11' };

/**
 * The SnapFit logo (shirt mark and wordmark). Wrap it in a link where it
 * should go home.
 *   name  the brand name, for the image's alt text
 *   tone  'default' (light backgrounds) | 'inverse' (navy backgrounds: the
 *         logo sits on a light chip so its navy wordmark stays readable)
 *   size  'md' (header, footer, sidebar) | 'lg' (the sign-in and sign-up forms)
 */
function Logo({ name, tone = 'default', size = 'md' }) {
  const image = <img src={logo} alt={name} className={`block w-auto ${SIZE_CLASSES[size]}`} />;
  if (tone !== 'inverse') return <span className="inline-flex items-center">{image}</span>;
  return <span className="inline-flex items-center rounded-lg bg-surface px-2.5 py-1.5">{image}</span>;
}

export default Logo;
