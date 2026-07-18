import type { CSSProperties } from 'react';
import { APP_ICON_URLS, type AppIconName } from '../lib/appIcons';

interface AppIconProps {
  name: AppIconName;
  size?: number;
  className?: string;
  title?: string;
}

/** Monochrome UI icon from `/assets/icons/` (mask; follows `color` of parent). */
export function AppIcon({ name, size = 18, className, title }: AppIconProps) {
  const url = APP_ICON_URLS[name];
  const style: CSSProperties = {
    width: size,
    height: size,
    WebkitMaskImage: `url(${url})`,
    maskImage: `url(${url})`,
  };

  return (
    <span
      className={'app-icon' + (className ? ` ${className}` : '')}
      style={style}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      title={title}
    />
  );
}
