import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getModalPortalRoot } from '../../lib/modalPortalRoot';

interface ModalBackdropProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  id?: string;
  /** When false, clicking outside the dialog does not call onClose. */
  closeOnBackdropClick?: boolean;
  /** When false, Escape does not call onClose. Defaults to true. */
  closeOnEscape?: boolean;
  /** Extra class on the backdrop element (e.g. stacked z-index). */
  backdropClassName?: string;
}

export function ModalBackdrop({
  open,
  onClose,
  children,
  id,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  backdropClassName,
}: ModalBackdropProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && closeOnEscape) onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, closeOnEscape]);

  if (!open) return null;

  return createPortal(
    <div
      id={id}
      className={
        'fu-modal-backdrop fu-modal-backdrop--portal' +
        (backdropClassName ? ` ${backdropClassName}` : '')
      }
      aria-hidden="false"
      onClick={(ev) => {
        if (closeOnBackdropClick && ev.target === ev.currentTarget) onClose();
      }}
    >
      {children}
    </div>,
    getModalPortalRoot(),
  );
}
