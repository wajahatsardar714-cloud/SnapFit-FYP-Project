import logo from '../../assets/snapfit-logo.webp';

// The badge is a 190x161 oval; the height sets its size and the width follows.
// It is shown larger than the old wordmark so the "SnapFit" inside stays readable.
const SIZE_CLASSES = { md: 'h-12', lg: 'h-20', xl: 'h-28 md:h-32' };

/**
 * The SnapFit logo: an oval navy badge (shirt, tape measure and white wordmark)
 * with a transparent surround, so it sits straight on light, dark and navy
 * backgrounds without a chip. Wrap it in a link where it should go home.
 *   name  the brand name, for the image's alt text
 *   size  'md' (header, footer) | 'lg' (the sign-in and sign-up forms) |
 *         'xl' (the homepage hero)
 */
function Logo({ name, size = 'md' }) {
  return (
    <span className="inline-flex items-center">
      <img src={logo} alt={name} width={190} height={161} className={`block w-auto ${SIZE_CLASSES[size]}`} />
    </span>
  );
}

export default Logo;
