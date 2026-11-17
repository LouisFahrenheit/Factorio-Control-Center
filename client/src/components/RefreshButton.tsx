import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from 'react';
import { IconRefresh } from '@tabler/icons-react';

export interface RefreshButtonProps {
  id?: string;
  className?: string;
  title?: string;
  'aria-label'?: string;
  disabled?: boolean;
  loading?: boolean;
  size?: number;
  mirrored?: boolean;
  icon?: ReactNode;
  onClick?: () => void | Promise<unknown>;
}

export function RefreshButton({
  id,
  className = 'btn access-users-bar__refresh-btn',
  title,
  'aria-label': ariaLabel,
  disabled,
  loading = false,
  size = 18,
  mirrored = true,
  icon,
  onClick,
}: RefreshButtonProps) {
  const [spinning, setSpinning] = useState(false);
  const [spinKey, setSpinKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleClick = useCallback(() => {
    setSpinKey((k) => k + 1);
    setSpinning(true);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setSpinning(false);
    }, 600);

    onClick?.();
  }, [onClick]);

  const isSpinning = loading || spinning;
  const stateClass = loading ? 'is-loading' : spinning ? 'is-spinning' : '';

  return (
    <button
      type="button"
      id={id}
      className={`${className}${stateClass ? ` ${stateClass}` : ''}`}
      title={title}
      aria-label={ariaLabel || title}
      disabled={disabled || loading}
      onClick={handleClick}
    >
      {icon ?? (
        <IconRefresh
          key={spinKey}
          size={size}
          className={[
            'refresh-icon',
            mirrored ? 'refresh-icon--mirrored' : '',
            isSpinning ? 'refresh-icon--spinning' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        />
      )}
    </button>
  );
}
