import { AppIcon } from './AppIcon';

interface CancelButtonProps {
  onClick: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function CancelButton({ onClick, t, disabled, id, className }: CancelButtonProps) {
  return (
    <button
      type="button"
      className={'btn btn--with-icon' + (className ? ` ${className}` : '')}
      id={id}
      disabled={disabled}
      data-i18n="cancel"
      onClick={onClick}
    >
      <AppIcon name="close" size={16} />
      {t('cancel')}
    </button>
  );
}
