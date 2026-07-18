import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AppIcon } from '../AppIcon';
import type { AppIconName } from '../../lib/appIcons';

export interface MobileNavItem<T extends string = string> {
  key: T;
  label: string;
  icon: AppIconName;
  badge?: number;
}

interface MobileBottomNavProps<T extends string = string> {
  items: MobileNavItem<T>[];
  active: T;
  onChange: (key: T) => void;
}

export function MobileBottomNav<T extends string = string>({
  items,
  active,
  onChange,
}: MobileBottomNavProps<T>) {
  useEffect(() => {
    document.body.classList.add('mobile-has-nav');
    return () => document.body.classList.remove('mobile-has-nav');
  }, []);

  const nav = (
    <nav className="mobile-nav" aria-label="Sections">
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            type="button"
            className={`mobile-nav__item${isActive ? ' is-active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onChange(item.key)}
          >
            <span className="mobile-nav__icon-wrap">
              <AppIcon name={item.icon} size={20} />
              {!!item.badge && item.badge > 0 && (
                <span className="mobile-nav__badge" aria-hidden="true">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </span>
            <span className="mobile-nav__label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );

  return createPortal(nav, document.body);
}
