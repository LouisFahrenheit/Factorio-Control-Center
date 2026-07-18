export function webEffectsReduced(): boolean {
  if (document.documentElement.getAttribute('data-web-disable-effects') === '1') return true;
  if (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return true;
  }
  return false;
}
