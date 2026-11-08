import { useEffect, useRef, useState, type FormEvent } from 'react';
import { IconFolderPlus } from '@tabler/icons-react';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import { CancelButton } from '../CancelButton';

export interface CommandCategoryModalProps {
  open: boolean;
  existingKeys: string[];
  onClose: () => void;
  onSubmit: (key: string, name: string) => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function CommandCategoryModal({
  open,
  existingKeys,
  onClose,
  onSubmit,
  t,
}: CommandCategoryModalProps) {
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const keyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setKey('');
      setName('');
      setError('');
      const id = window.setTimeout(() => {
        keyInputRef.current?.focus();
      }, 50);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  if (!open) return null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cleanKey = key.trim();
    if (!cleanKey) {
      setError(t('category_key'));
      return;
    }
    if (existingKeys.includes(cleanKey)) {
      setError(t('error_category_exists'));
      return;
    }
    const cleanName = name.trim() || cleanKey;
    onSubmit(cleanKey, cleanName);
    onClose();
  }

  return (
    <ModalBackdrop open id="commandCategoryModalBackdrop" onClose={onClose}>
      <div
        className="fu-modal command-category-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="commandCategoryHeading"
      >
        <div
          className="fu-modal__header fu-modal__header--with-icon"
          id="commandCategoryHeading"
        >
          <IconFolderPlus size={20} />
          <span>{t('add_category')}</span>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="fu-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
            <label className="command-editor-dialog__field" htmlFor="categoryKeyInput" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="command-editor-dialog__field-label" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                {t('category_key')}
              </span>
              <input
                ref={keyInputRef}
                id="categoryKeyInput"
                type="text"
                className="input"
                autoComplete="off"
                placeholder="game, player, system..."
                value={key}
                onChange={(e) => {
                  setKey(e.target.value);
                  setError('');
                }}
              />
            </label>

            <label className="command-editor-dialog__field" htmlFor="categoryNameInput" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="command-editor-dialog__field-label" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                {t('display_name')}
              </span>
              <input
                id="categoryNameInput"
                type="text"
                className="input"
                autoComplete="off"
                placeholder={key.trim() || 'Game, Player...'}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            {error && (
              <p style={{ margin: 0, color: 'var(--error, #e03131)', fontSize: '0.84rem' }}>
                {error}
              </p>
            )}
          </div>

          <div className="fu-modal__footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 16px' }}>
            <CancelButton t={t} onClick={onClose} />
            <button
              type="submit"
              className="btn btn--primary btn--with-icon"
              id="btnCommandCategoryConfirm"
            >
              <IconFolderPlus size={16} />
              {t('add_category')}
            </button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  );
}

