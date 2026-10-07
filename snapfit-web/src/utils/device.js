// A laptop's built-in camera is front-facing and awkward for a full-body shot.
// Combines UA sniffing with a pointer-type check since either alone is an
// unreliable signal (e.g. UA spoofing, some tablets).
export function isLikelyDesktop() {
  if (typeof navigator === 'undefined') return false;
  const isMobileUA = /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent || '');
  const hasCoarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return !isMobileUA && !hasCoarsePointer;
}

// Desktop: the shopper faces their webcam. Phone: the back camera, so someone
// else can frame a full-body shot (the shopper can switch to the front camera).
export function defaultFacingMode() {
  return isLikelyDesktop() ? 'user' : 'environment';
}
