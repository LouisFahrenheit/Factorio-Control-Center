import type { CSSProperties } from 'react';

/** Factorio icon sheet: 64 + 32 + 16 px variants in one 120×64 row (top-aligned). */
export const FACTORIO_ICON_SHEET = {
  width: 120,
  height: 64,
  large: { x: 0, y: 0, size: 64 },
  medium: { x: 64, y: 0, size: 32 },
  small: { x: 96, y: 0, size: 16 },
} as const;

export type FactorioIconTier = 'large' | 'medium' | 'small';

/** CSS background sprite for one tier scaled to `displayPx`. */
export function factorioIconSpriteStyle(
  url: string,
  tier: FactorioIconTier,
  displayPx: number,
): CSSProperties {
  const sheet = FACTORIO_ICON_SHEET;
  const rect = sheet[tier];
  const scale = displayPx / rect.size;
  return {
    width: displayPx,
    height: displayPx,
    backgroundImage: `url(${url})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${sheet.width * scale}px ${sheet.height * scale}px`,
    backgroundPosition: `${-rect.x * scale}px ${-rect.y * scale}px`,
    imageRendering: 'pixelated',
  };
}
