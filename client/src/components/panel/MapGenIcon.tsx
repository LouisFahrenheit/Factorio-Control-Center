import type { CSSProperties } from 'react';
import {
  factorioIconSpriteStyle,
  type FactorioIconTier,
} from '../../lib/mapGen/factorioIconSprite';

interface MapGenIconProps {
  src: string | undefined;
  alt: string;
  className?: string;
  size?: number;
  /** 120×64 sprite sheet (resources and planets). */
  tier?: FactorioIconTier;
}

/** In-game sprite from a Factorio icon sheet (transparent; no background plate). */
export function MapGenIcon({
  src,
  alt,
  className = '',
  size = 32,
  tier = 'medium',
}: MapGenIconProps) {
  if (!src) return null;

  const style: CSSProperties = factorioIconSpriteStyle(src, tier, size);

  return (
    <span
      className={
        'create-save__map-gen-icon create-save__map-gen-icon--sprite' +
        (className ? ` ${className}` : '')
      }
      style={style}
      role="img"
      aria-label={alt}
    />
  );
}
