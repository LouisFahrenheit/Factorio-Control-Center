import type { ReactNode } from 'react';

interface FccCheckProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  labelClassName?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}

export function FccCheck({
  id,
  checked,
  onChange,
  label,
  labelClassName = 'fcc-check__label',
  className,
  disabled,
  title,
}: FccCheckProps) {
  return (
    <label
      className={'fcc-check' + (className ? ` ${className}` : '')}
      htmlFor={id}
      title={title}
    >
      <input
        type="checkbox"
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="fcc-check__box" aria-hidden="true">
        <span className="fcc-check__mark" />
      </span>
      {label != null ? <span className={labelClassName}>{label}</span> : null}
    </label>
  );
}
