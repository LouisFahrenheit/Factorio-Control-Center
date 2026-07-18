/**
 * Brand asset generator for Factorio Control Center.
 *
 * Produces vector logo / favicon SVGs from a single source of truth so the
 * gear geometry stays mathematically precise, then (optionally) rasterizes
 * them to PNG + ICO if `sharp` and `png-to-ico` are available.
 *
 * Usage:
 *   node scripts/gen-brand.mjs            # write SVGs only
 *   node scripts/gen-brand.mjs --raster   # also write PNG/ICO
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'client', 'public', 'brand');
mkdirSync(outDir, { recursive: true });

// --- Brand palette (mirrors fcc_classic theme) --------------------------------
const C = {
  bgTop: '#33312d',
  bgBottom: '#211f1d',
  border: '#5a4a2c',
  gearLight: '#f1be64',
  gearMid: '#e09a2a',
  gearDark: '#b96a0e',
  core: '#211f1d',
  coreEdge: '#3d3a35',
  glyph: '#f6e3c0',
  // Fallback accent (fcc_classic). The live SVGs use var(--accent) so the gear
  // takes the current theme's accent in-app; rasterized PNG/ICO use this value.
  accent: '#da8216',
};

// Themeable accent fill: resolves to the theme accent when the SVG is inlined
// into the app DOM, and falls back to the classic orange everywhere else
// (browser tab favicon, PWA icons, rasterized PNGs).
const ACCENT = `var(--accent, ${C.accent})`;

/**
 * Build a gear (cog) outline path centered at (cx, cy).
 * Teeth are trapezoidal with rounded transitions, produced by sampling angle.
 */
function gearPath({ cx, cy, teeth, rOuter, rRoot, toothWidth = 0.5, round = 0.18 }) {
  // Each tooth spans one period; within a period we have:
  // tip (flat at rOuter) -> falling flank -> valley (flat at rRoot) -> rising flank
  const period = (Math.PI * 2) / teeth;
  const tipHalf = (period * toothWidth) / 2;
  const flank = period * round;
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const c = i * period; // center angle of this tooth
    const a1 = c - tipHalf; // tip start
    const a2 = c + tipHalf; // tip end
    const a3 = c + period / 2 - flank; // valley start
    const a4 = c + period / 2 + flank; // valley end (== next tip start - tipHalf adj)
    pts.push([a1, rOuter]);
    pts.push([a2, rOuter]);
    pts.push([a3, rRoot]);
    pts.push([a4, rRoot]);
  }
  let d = '';
  pts.forEach(([a, r], idx) => {
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    d += idx === 0 ? `M${x.toFixed(2)} ${y.toFixed(2)}` : `L${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  d += 'Z';
  return d;
}

const S = 512;
const cx = S / 2;
const cy = S / 2;

const gearOuter = gearPath({ cx, cy, teeth: 9, rOuter: 196, rRoot: 158, toothWidth: 0.46, round: 0.12 });
const holeR = 96; // center bore -> reads as a classic cog at any size

function defs() {
  return `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.bgTop}"/>
      <stop offset="1" stop-color="${C.bgBottom}"/>
    </linearGradient>
    <radialGradient id="core" cx="0.5" cy="0.42" r="0.62">
      <stop offset="0" stop-color="${C.coreEdge}"/>
      <stop offset="1" stop-color="${C.core}"/>
    </radialGradient>
    <!-- Hue-independent shading so the gear looks dimensional for any accent. -->
    <linearGradient id="shade" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.24"/>
    </linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000" flood-opacity="0.35"/>
    </filter>
  </defs>`;
}

// Icon with rounded-square background (for favicon / app icon).
function iconSvg({ withBg = true } = {}) {
  const bg = withBg
    ? `<rect x="14" y="14" width="${S - 28}" height="${S - 28}" rx="104" fill="url(#bg)" stroke="${C.border}" stroke-width="6"/>`
    : '';
  const holeFill = withBg ? 'url(#bg)' : C.bgBottom;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" role="img" aria-label="Factorio Control Center">
${defs()}
  ${bg}
  <g filter="url(#soft)">
    <path d="${gearOuter}" fill="${ACCENT}"/>
    <path d="${gearOuter}" fill="url(#shade)"/>
  </g>
  <circle cx="${cx}" cy="${cy}" r="${holeR}" fill="${holeFill}"/>
  <circle cx="${cx}" cy="${cy}" r="${holeR}" fill="none" stroke="#000000" stroke-opacity="0.28" stroke-width="6"/>
</svg>`;
}

// Horizontal lockup: icon + wordmark.
function logoSvg() {
  const W = 1040;
  const H = 320;
  const icon = 248;
  const iy = (H - icon) / 2;
  const inner = iconSvg().replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Factorio Control Center">
  <g transform="translate(28 ${iy}) scale(${(icon / S).toFixed(4)})">
    ${inner}
  </g>
  <g font-family="'Segoe UI', 'Inter', system-ui, sans-serif">
    <text x="320" y="150" font-size="92" font-weight="800" letter-spacing="-1" fill="${C.glyph}">Factorio</text>
    <text x="322" y="246" font-size="60" font-weight="600" letter-spacing="6" fill="${ACCENT}">CONTROL CENTER</text>
  </g>
</svg>`;
}

// Maskable icon (extra padding so it survives Android circle/squircle masks).
function maskableSvg() {
  const pad = 56;
  const inner = iconSvg({ withBg: false }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  <rect width="${S}" height="${S}" fill="${C.bgBottom}"/>
  <g transform="translate(${pad} ${pad}) scale(${((S - pad * 2) / S).toFixed(4)})">
    ${inner}
  </g>
</svg>`;
}

const files = {
  'favicon.svg': iconSvg(),
  'logo.svg': logoSvg(),
  'icon-maskable.svg': maskableSvg(),
};

for (const [name, content] of Object.entries(files)) {
  writeFileSync(join(outDir, name), content.trim() + '\n', 'utf8');
  console.log('wrote', join('client', 'public', 'brand', name));
}

if (process.argv.includes('--raster')) {
  const sharp = (await import('sharp')).default;
  const pngToIco = (await import('png-to-ico')).default;
  const svg = Buffer.from(files['favicon.svg']);
  const sizes = [16, 32, 48, 180, 192, 512];
  const pngPaths = {};
  for (const size of sizes) {
    const out = join(outDir, `favicon-${size}.png`);
    await sharp(svg, { density: 384 }).resize(size, size).png().toFile(out);
    pngPaths[size] = out;
    console.log('wrote', join('client', 'public', 'brand', `favicon-${size}.png`));
  }
  // Friendly aliases for HTML/manifest.
  await sharp(pngPaths[180]).toFile(join(outDir, 'apple-touch-icon.png'));
  await sharp(Buffer.from(files['icon-maskable.svg']), { density: 384 })
    .resize(512, 512)
    .png()
    .toFile(join(outDir, 'icon-maskable-512.png'));
  const ico = await pngToIco([pngPaths[16], pngPaths[32], pngPaths[48]]);
  writeFileSync(join(root, 'client', 'public', 'favicon.ico'), ico);
  console.log('wrote', join('client', 'public', 'favicon.ico'));
}
