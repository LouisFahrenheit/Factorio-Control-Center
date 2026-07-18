import { useEffect, useRef, type RefObject } from 'react';
import { webEffectsReduced } from './webEffects';

interface SnowProfile {
  count: number;
  rMin: number;
  rMax: number;
  vyMin: number;
  vyMax: number;
  vxSpread: number;
  oMin: number;
  oMax: number;
}

interface Flake {
  x: number;
  y: number;
  r: number;
  vy: number;
  vx: number;
  o: number;
}

interface StuckFlake {
  x: number;
  y: number;
  r: number;
  o: number;
  appear: number;
  appearRate: number;
  meltBase?: number;
  meltR0?: number;
  meltO0?: number;
}

interface BrandRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const PROFILE: SnowProfile = {
  count: 320,
  rMin: 1.0,
  rMax: 5.4,
  vyMin: 0.32,
  vyMax: 1.35,
  vxSpread: 0.38,
  oMin: 0.26,
  oMax: 0.82,
};

const BRAND_SNOW_FILL = '#dce8f4';
const FALL_SNOW_FILL = '#eef4fa';
const MELT_MS = 1200;
const MAX_STUCK = 1400;

function makeFlake(profile: SnowProfile): Flake {
  return {
    x: Math.random(),
    y: Math.random(),
    r: profile.rMin + Math.random() * (profile.rMax - profile.rMin),
    vy: profile.vyMin + Math.random() * (profile.vyMax - profile.vyMin),
    vx: -profile.vxSpread * 0.5 + Math.random() * profile.vxSpread,
    o: profile.oMin + Math.random() * (profile.oMax - profile.oMin),
  };
}

function drawFlake(ctx: CanvasRenderingContext2D, f: Flake, w: number, h: number): void {
  ctx.globalAlpha = f.o;
  ctx.beginPath();
  ctx.arc(f.x * w, f.y * h, f.r, 0, Math.PI * 2);
  ctx.fill();
}

function getBrandRect(screen: HTMLElement, brand: HTMLElement): BrandRect | null {
  const sr = screen.getBoundingClientRect();
  const br = brand.getBoundingClientRect();
  if (!sr.width || !sr.height || !br.width || !br.height) return null;
  return {
    x0: br.left - sr.left,
    y0: br.top - sr.top,
    x1: br.right - sr.left,
    y1: br.bottom - sr.top,
  };
}

function hitsBrand(px: number, py: number, r: number, brandRect: BrandRect): boolean {
  const pad = 3;
  return (
    px + r >= brandRect.x0 + pad &&
    px - r <= brandRect.x1 - pad &&
    py + r >= brandRect.y0 + pad &&
    py - r <= brandRect.y1 - pad
  );
}

function clampLocal(x: number, y: number, r: number, bw: number, bh: number) {
  return {
    x: bw ? Math.max(r, Math.min(bw - r, x)) : x,
    y: bh ? Math.max(r, Math.min(bh - r, y)) : y,
  };
}

function respawnFlake(f: Flake, profile: SnowProfile, screenW: number, brandRect: BrandRect | null): void {
  const fresh = makeFlake(profile);
  f.y = -0.02 - Math.random() * 0.08;
  f.r = fresh.r;
  f.vy = fresh.vy;
  f.vx = fresh.vx;
  f.o = fresh.o;
  if (brandRect && screenW > 0 && Math.random() < 0.52) {
    const cx = ((brandRect.x0 + brandRect.x1) * 0.5) / screenW;
    const span = ((brandRect.x1 - brandRect.x0) / screenW) * 0.72;
    f.x = cx - span * 0.5 + Math.random() * span;
  } else {
    f.x = fresh.x;
  }
}

function addStuckCluster(
  stuck: StuckFlake[],
  localX: number,
  localY: number,
  baseR: number,
  baseO: number,
  bw: number,
  bh: number,
): void {
  if (stuck.length >= MAX_STUCK) return;
  const pos = clampLocal(localX, localY, baseR, bw, bh);
  stuck.push({
    x: pos.x,
    y: pos.y,
    r: baseR,
    o: Math.min(0.82, baseO),
    appear: 0,
    appearRate: 0.02 + Math.random() * 0.04,
  });
  if (Math.random() < 0.34 && stuck.length < MAX_STUCK) {
    const ang = Math.random() * Math.PI * 2;
    const dist = baseR * (0.28 + Math.random() * 0.52);
    const pos2 = clampLocal(
      localX + Math.cos(ang) * dist,
      localY + Math.sin(ang) * dist,
      baseR * 0.7,
      bw,
      bh,
    );
    stuck.push({
      x: pos2.x,
      y: pos2.y,
      r: baseR * (0.52 + Math.random() * 0.36),
      o: baseO * (0.68 + Math.random() * 0.22),
      appear: 0,
      appearRate: 0.02 + Math.random() * 0.04,
    });
  }
}

function tryStickOnBrand(
  f: Flake,
  px: number,
  py: number,
  brandRect: BrandRect,
  stuck: StuckFlake[],
  bw: number,
  bh: number,
): boolean {
  if (!hitsBrand(px, py, f.r, brandRect)) return false;
  if (stuck.length >= MAX_STUCK) return true;
  const localX = px - brandRect.x0 + (-f.r * 0.15 + Math.random() * f.r * 0.3);
  const localY = py - brandRect.y0 + (-f.r * 0.15 + Math.random() * f.r * 0.3);
  addStuckCluster(stuck, localX, localY, f.r * (0.92 + Math.random() * 0.68), f.o * (0.74 + Math.random() * 0.22), bw, bh);
  return true;
}

function meltProgress(startMs: number): number {
  const t = Math.min(1, Math.max(0, (Date.now() - startMs) / MELT_MS));
  return t * t * (3 - 2 * t);
}

function processFallingFlake(
  f: Flake,
  w: number,
  h: number,
  brandRect: BrandRect | null,
  stuck: StuckFlake[],
  brandW: number,
  brandH: number,
  allowStick: boolean,
  speedMul: number,
): void {
  f.y += (f.vy * speedMul) / h;
  f.x += f.vx / w;
  const px = f.x * w;
  const py = f.y * h;
  if (allowStick && brandRect && tryStickOnBrand(f, px, py, brandRect, stuck, brandW, brandH)) {
    respawnFlake(f, PROFILE, w, brandRect);
    return;
  }
  if (f.y > 1.04) {
    f.y = -0.04;
    f.x = Math.random();
  }
  if (f.x < -0.04) f.x = 1.04;
  if (f.x > 1.04) f.x = -0.04;
}

function drawStuckPile(
  ctx: CanvasRenderingContext2D,
  stuck: StuckFlake[],
  melting: boolean,
  meltStartMs: number,
): void {
  const bw = ctx.canvas.width;
  const bh = ctx.canvas.height;
  if (!bw || !bh) return;

  if (melting) {
    const melt = meltProgress(meltStartMs);
    for (let i = stuck.length - 1; i >= 0; i -= 1) {
      const s = stuck[i];
      if (s.meltBase === undefined) {
        s.meltBase = s.appear;
        s.meltR0 = s.r;
        s.meltO0 = s.o;
      }
      const keep = 1 - melt;
      s.appear = Math.max(0, (s.meltBase ?? 0) * keep);
      s.r = Math.max(0.12, (s.meltR0 ?? s.r) * (0.08 + keep * 0.92));
      s.o = Math.max(0, (s.meltO0 ?? s.o) * (0.06 + keep * 0.94));
      if (melt >= 0.98 || s.appear < 0.02 || s.r < 0.18) stuck.splice(i, 1);
    }
  }

  ctx.clearRect(0, 0, bw, bh);
  ctx.fillStyle = BRAND_SNOW_FILL;
  const melt = melting ? meltProgress(meltStartMs) : 0;
  const meltFade = melting ? 1 - melt * 0.4 : 1;
  const meltShrink = melting ? Math.max(0, 1 - melt * 0.95) : 1;

  for (const s of stuck) {
    if (!melting && s.appear < 1) {
      s.appear = Math.min(1, s.appear + s.appearRate);
    }
    const fade = s.appear * s.appear * (3 - 2 * s.appear);
    const alpha = s.o * fade * meltFade;
    if (alpha < 0.02) continue;
    const drawR = s.r * (0.18 + 0.82 * fade) * meltShrink;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(s.x, s.y, drawR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function CryoLoginSnow({
  active,
  screenRef,
  brandRef,
  melting,
}: {
  active: boolean;
  screenRef: RefObject<HTMLElement | null>;
  brandRef: RefObject<HTMLElement | null>;
  melting: boolean;
}) {
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const meltingRef = useRef(melting);
  meltingRef.current = melting;

  useEffect(() => {
    if (!active || webEffectsReduced()) return;

    let cancelled = false;
    let animId = 0;
    let brandCanvas: HTMLCanvasElement | null = null;
    let teardown: (() => void) | null = null;

    const stop = () => {
      if (teardown) {
        teardown();
        teardown = null;
      }
    };

    const boot = () => {
      if (cancelled) return;
      stop();

      const screen = screenRef.current;
      const brand = brandRef.current;
      const mainCanvas = mainCanvasRef.current;
      if (!screen || !brand || !mainCanvas) {
        requestAnimationFrame(boot);
        return;
      }

      brandCanvas = document.createElement('canvas');
      brandCanvas.className = 'cryo-brand-snow-canvas';
      brandCanvas.setAttribute('aria-hidden', 'true');
      brand.insertBefore(brandCanvas, brand.firstChild);

      const mainCtx = mainCanvas.getContext('2d');
      const brandCtx = brandCanvas.getContext('2d');
      if (!mainCtx || !brandCtx) {
        brandCanvas.remove();
        brandCanvas = null;
        return;
      }

      const screenEl = screen;
      const brandEl = brand;
      const mainCanvasEl = mainCanvas;
      const brandCanvasEl = brandCanvas;
      const mainCtxEl = mainCtx;
      const brandCtxEl = brandCtx;

      const flakes = Array.from({ length: PROFILE.count }, () => makeFlake(PROFILE));
      const stuck: StuckFlake[] = [];
      let meltStartMs = 0;
      let wasMelting = false;

      function resizeBrand() {
        const br = brandEl.getBoundingClientRect();
        brandCanvasEl.width = Math.max(1, Math.round(br.width));
        brandCanvasEl.height = Math.max(1, Math.round(br.height));
      }

      function resize() {
        const rect = screenEl.getBoundingClientRect();
        mainCanvasEl.width = Math.max(1, Math.round(rect.width));
        mainCanvasEl.height = Math.max(1, Math.round(rect.height));
        resizeBrand();
      }

      function tick() {
        if (cancelled) return;

        const meltingNow = meltingRef.current;
        if (meltingNow && !wasMelting) {
          wasMelting = true;
          meltStartMs = Date.now();
          brandEl.classList.add('cryo-brand-heating');
        }

        const w = mainCanvasEl.width;
        const h = mainCanvasEl.height;
        if (w && h) {
          const allowStick = !meltingNow;
          const speedMul = meltingNow ? 1.22 : 1;
          mainCtxEl.clearRect(0, 0, w, h);
          mainCtxEl.fillStyle = FALL_SNOW_FILL;
          const brandRect = allowStick ? getBrandRect(screenEl, brandEl) : null;
          for (const f of flakes) {
            processFallingFlake(
              f,
              w,
              h,
              brandRect,
              stuck,
              brandCanvasEl.width,
              brandCanvasEl.height,
              allowStick,
              speedMul,
            );
            drawFlake(mainCtxEl, f, w, h);
          }
        }

        drawStuckPile(brandCtxEl, stuck, meltingNow, meltStartMs);
        animId = requestAnimationFrame(tick);
      }

      resize();
      window.addEventListener('resize', resize);
      tick();

      teardown = () => {
        cancelAnimationFrame(animId);
        window.removeEventListener('resize', resize);
        brandEl.classList.remove('cryo-brand-heating');
        brandCanvasEl.remove();
        brandCanvas = null;
      };
    };

    boot();
    window.addEventListener('fcc-theme-applied', boot);

    return () => {
      cancelled = true;
      window.removeEventListener('fcc-theme-applied', boot);
      stop();
    };
  }, [active, screenRef, brandRef]);

  if (!active || webEffectsReduced()) return null;

  return <canvas ref={mainCanvasRef} className="cryo-snow-canvas" aria-hidden />;
}
