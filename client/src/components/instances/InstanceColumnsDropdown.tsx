import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { IconColumns, IconX, IconCheck, IconRotateClockwise } from '@tabler/icons-react';
import { FccSwitch } from '../FccSwitch';
import { webEffectsReduced } from '../../theme/webEffects';
import type {
  ServerListColumnKey,
  ServerListColumnVisibility,
} from '../../lib/userPrefs';

const COLUMN_CONFIG: { key: ServerListColumnKey; labelKey: string }[] = [
  { key: 'save', labelKey: 'instances_col_save' },
  { key: 'access', labelKey: 'instances_col_access' },
  { key: 'port', labelKey: 'instances_col_server_port' },
  { key: 'rconPort', labelKey: 'instances_col_rcon_port' },
  { key: 'version', labelKey: 'instances_col_version' },
  { key: 'mods', labelKey: 'mods_btn' },
  { key: 'online', labelKey: 'instances_col_online' },
  { key: 'uptime', labelKey: 'server_uptime' },
  { key: 'status', labelKey: 'instances_col_status' },
];

interface InstanceColumnsDropdownProps {
  columns: ServerListColumnVisibility;
  onToggleColumn: (key: ServerListColumnKey, visible: boolean) => void;
  onReset: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function InstanceColumnsDropdown({
  columns,
  onToggleColumn,
  onReset,
  t,
}: InstanceColumnsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const reduced = webEffectsReduced();

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const hiddenCount = COLUMN_CONFIG.filter((col) => !columns[col.key]).length;

  return (
    <div className="instance-columns-dropdown-wrap" ref={containerRef}>
      <button
        type="button"
        id="btnInstanceColumnsToggle"
        className={`btn btn--toolbar-icon instance-servers-bar__columns-btn ${
          hiddenCount > 0 ? 'instance-servers-bar__columns-btn--customized' : ''
        }`}
        title={t('instances_customize_columns') || 'Настройка колонок'}
        aria-label={t('instances_customize_columns') || 'Настройка колонок'}
        aria-expanded={isOpen}
        aria-haspopup="true"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <IconColumns size={18} />
        {hiddenCount > 0 && (
          <span
            className="instance-columns-badge"
            title={`${t('instances_customize_columns')}: -${hiddenCount}`}
          />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="instanceColumnsMenu"
            className="instance-columns-dropdown"
            role="menu"
            aria-label={t('instances_customize_columns') || 'Настройка колонок'}
            initial={reduced ? false : { opacity: 0, y: -6, scale: 0.96 }}
            animate={reduced ? undefined : { opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0, y: -4, scale: 0.97 }}
            transition={reduced ? { duration: 0 } : { duration: 0.16 }}
          >
            {/* Header */}
            <div className="instance-columns-dropdown__header">
              <div className="instance-columns-dropdown__title">
                <IconColumns size={14} />
                <span>
                  {t('instances_customize_columns') || 'Настройка колонок'}
                </span>
              </div>
              <button
                type="button"
                className="instance-columns-dropdown__close"
                onClick={() => setIsOpen(false)}
                title={t('close') || 'Закрыть'}
                aria-label={t('close') || 'Закрыть'}
              >
                <IconX size={14} />
              </button>
            </div>

            {/* Column Options List */}
            <div className="instance-columns-dropdown__list">
              {COLUMN_CONFIG.map((col) => {
                const isChecked = columns[col.key] !== false;
                const labelText = t(col.labelKey);

                return (
                  <div
                    key={col.key}
                    className="instance-columns-dropdown__item"
                  >
                    <FccSwitch
                      id={`col_toggle_${col.key}`}
                      checked={isChecked}
                      onChange={(checked) => onToggleColumn(col.key, checked)}
                      label={labelText}
                      labelClassName="instance-columns-dropdown__label"
                    />
                  </div>
                );
              })}
            </div>

            {/* Actions Footer */}
            <div className="instance-columns-dropdown__footer">
              <button
                type="button"
                className="btn btn--compact instance-columns-dropdown__action-btn"
                onClick={onReset}
                title={t('instances_columns_reset')}
              >
                <IconRotateClockwise size={13} />
                <span>{t('instances_columns_reset')}</span>
              </button>
              <button
                type="button"
                className="btn btn--compact instance-columns-dropdown__action-btn"
                onClick={() => setIsOpen(false)}
                title={t('ok')}
              >
                <IconCheck size={14} />
                <span>{t('ok')}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
