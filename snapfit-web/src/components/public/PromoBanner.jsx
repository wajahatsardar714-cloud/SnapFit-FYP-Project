// The banner artwork is 699x335; the image is shown at most at that size so it
// is never upscaled, and the width/height attributes reserve its space before
// it loads (no layout shift).
const WIDTH = 699;
const HEIGHT = 335;

/**
 * A full-artwork promo banner, centred and scaled down on narrow screens.
 *   src  the imported image
 *   alt  what the banner says, for screen readers and search engines
 */
function PromoBanner({ src, alt }) {
  return (
    <figure className="mx-auto w-full max-w-[699px]">
      <img
        src={src}
        alt={alt}
        width={WIDTH}
        height={HEIGHT}
        loading="lazy"
        decoding="async"
        className="block h-auto w-full rounded-xl shadow-card"
      />
    </figure>
  );
}

export default PromoBanner;
