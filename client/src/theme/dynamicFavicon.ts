/**
 * Recolors the browser-tab favicon with the active theme accent.
 *
 * A tab favicon is loaded outside the page's CSS scope, so it cannot read
 * `var(--accent)` directly. Instead we render the gear SVG to a data URI with
 * the resolved accent color baked in, and swap it whenever the theme changes
 * (the `fcc-theme-applied` event fired by applyTheme()).
 *
 * The gear geometry is kept in sync with scripts/gen-brand.mjs.
 */

const FALLBACK_ACCENT = '#da8216';

// Precomputed 9-tooth gear outline (see scripts/gen-brand.mjs, 512x512 frame).
const GEAR_PATH =
  'M449.48 224.66L449.48 287.34L408.47 297.43L399.43 322.27L424.36 356.36L384.07 404.37L346.17 385.74L323.27 398.96L320.46 441.10L258.74 451.98L241.68 413.35L215.64 408.76L186.40 439.23L132.12 407.89L143.89 367.33L126.89 347.08L84.91 351.62L63.47 292.73L98.55 269.22L98.55 242.78L63.47 219.27L84.91 160.38L126.89 164.92L143.89 144.67L132.12 104.11L186.40 72.77L215.64 103.24L241.68 98.65L258.74 60.02L320.46 70.90L323.27 113.04L346.17 126.26L384.07 107.63L424.36 155.64L399.43 189.73L408.47 214.57Z';

function buildSvg(accent: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#33312d"/>
      <stop offset="1" stop-color="#211f1d"/>
    </linearGradient>
    <linearGradient id="shade" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.24"/>
    </linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000" flood-opacity="0.35"/>
    </filter>
  </defs>
  <rect x="14" y="14" width="484" height="484" rx="104" fill="url(#bg)" stroke="#5a4a2c" stroke-width="6"/>
  <g filter="url(#soft)">
    <path d="${GEAR_PATH}" fill="${accent}"/>
    <path d="${GEAR_PATH}" fill="url(#shade)"/>
  </g>
  <circle cx="256" cy="256" r="96" fill="url(#bg)"/>
  <circle cx="256" cy="256" r="96" fill="none" stroke="#000000" stroke-opacity="0.28" stroke-width="6"/>
</svg>`;
}

function resolveAccent(): string {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    return value || FALLBACK_ACCENT;
  } catch {
    return FALLBACK_ACCENT;
  }
}

function ensureFaviconLink(): HTMLLinkElement {
  const head = document.head;
  let link = head.querySelector<HTMLLinkElement>('link#fcc-dynamic-favicon');
  if (!link) {
    // Drop the static SVG icon so browsers prefer our dynamic one.
    head
      .querySelectorAll<HTMLLinkElement>('link[rel~="icon"][type="image/svg+xml"]')
      .forEach((el) => el.remove());
    link = document.createElement('link');
    link.id = 'fcc-dynamic-favicon';
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    head.appendChild(link);
  }
  return link;
}

function updateFavicon(): void {
  const link = ensureFaviconLink();
  const svg = buildSvg(resolveAccent());
  link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function initDynamicFavicon(): void {
  updateFavicon();
  window.addEventListener('fcc-theme-applied', updateFavicon);
}
