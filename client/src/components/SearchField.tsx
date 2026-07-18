import type { InputHTMLAttributes } from 'react';
import { AppIcon } from './AppIcon';

/** Text/search input with a leading search icon. */
export function SearchField({ className, type = 'search', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={'input-with-icon' + (className ? ` ${className}` : '')}>
      <AppIcon name="search" size={18} className="input-with-icon__icon" />
      <input type={type} className="input input-with-icon__input" {...props} />
    </div>
  );
}
