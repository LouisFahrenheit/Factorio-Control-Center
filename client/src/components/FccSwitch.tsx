import type { ReactNode } from 'react';

interface FccSwitchProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  labelClassName?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}

export function FccSwitch({
  id,
  checked,
  onChange,
  label,
  labelClassName = 'program-settings-field__label',
  className,
  disabled,
  title,
}: FccSwitchProps) {
  return (
    <label
      className={'fcc-switch' + (className ? ` ${className}` : '')}
      htmlFor={id}
      title={title}
    >
      <input
        type="checkbox"
        id={id}
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="fcc-switch__track" aria-hidden="true">
        <span className="fcc-switch__thumb" />
      </span>
      {label != null ? <span className={labelClassName}>{label}</span> : null}
    </label>
  );
}
