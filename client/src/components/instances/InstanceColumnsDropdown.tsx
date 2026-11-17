import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  IconColumns,
  IconX,
  IconCheck,
  IconRotateClockwise,
  IconChevronUp,
  IconChevronDown,
} from '@tabler/icons-react';
import { FccSwitch } from '../FccSwitch';
import { webEffectsReduced } from '../../theme/webEffects';

export interface ColumnConfigItem<K extends string = string> {
  key: K;
  labelKey: string;
  /** When set, the row shows a mode select instead of an on/off switch. */
  modes?: readonly { value: string; labelKey: string }[];
}

interface InstanceColumnsDropdownProps<K extends string> {
  config: readonly ColumnConfigItem<K>[];
  columns: Record<K, boolean>;
  order: readonly K[];
  /** Distinguishes DOM ids when several tabs render this dropdown. */
  idPrefix?: string;
  onToggleColumn: (key: K, visible: boolean) => void;
  /** Current value per column that declares `modes`. */
  modeValues?: Partial<Record<K, string>>;
  onChangeMode?: (key: K, value: string) => void;
  onMoveColumn: (key: K, direction: 'up' | 'down') => void;
  onReset: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function InstanceColumnsDropdown<K extends string>({
  config,
  columns,
  idPrefix = 'Instance',
  modeValues,
  onChangeMode,
  order,
  onToggleColumn,
  onMoveColumn,
  onReset,
  t,
}: InstanceColumnsDropdownProps<K>) {
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

  const orderedColumns = order
    .map((key) => config.find((col) => col.key === key))
    .filter((col): col is ColumnConfigItem<K> => col !== undefined);

  return (
    <div className="instance-columns-dropdown-wrap" ref={containerRef}>
      <button
        type="button"
        id={`btn${idPrefix}ColumnsToggle`}
        className="btn btn--toolbar-icon instance-servers-bar__columns-btn"
        title={t('instances_customize_columns') || 'Настройка колонок'}
        aria-label={t('instances_customize_columns') || 'Настройка колонок'}
        aria-expanded={isOpen}
        aria-haspopup="true"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <IconColumns size={18} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            id={`${idPrefix.toLowerCase()}ColumnsMenu`}
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
              {orderedColumns.map((col, index) => {
                const isChecked = columns[col.key] !== false;
                const labelText = t(col.labelKey);

                return (
                  <motion.div
                    key={col.key}
                    layout={!reduced}
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    className="instance-columns-dropdown__item"
                  >
                    <div className="instance-columns-dropdown__reorder">
                      <button
                        type="button"
                        className="monitoring-settings-reorder-btn"
                        aria-label={`${t('monitoring_settings_move_up') || 'Выше'}: ${labelText}`}
                        disabled={index === 0}
                        onClick={() => onMoveColumn(col.key, 'up')}
                      >
                        <IconChevronUp size={12} />
                      </button>
                      <button
                        type="button"
                        className="monitoring-settings-reorder-btn"
                        aria-label={`${t('monitoring_settings_move_down') || 'Ниже'}: ${labelText}`}
                        disabled={index === orderedColumns.length - 1}
                        onClick={() => onMoveColumn(col.key, 'down')}
                      >
                        <IconChevronDown size={12} />
                      </button>
                    </div>
                    {col.modes && onChangeMode ? (
                      <div className="instance-columns-dropdown__mode-row">
                        <span className="instance-columns-dropdown__label">
                          {labelText}
                        </span>
                        <select
                          className="input instance-columns-dropdown__mode-select"
                          aria-label={labelText}
                          value={modeValues?.[col.key] ?? col.modes[0].value}
                          onChange={(e) => onChangeMode(col.key, e.target.value)}
                        >
                          {col.modes.map((m) => (
                            <option key={m.value} value={m.value}>
                              {t(m.labelKey)}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <FccSwitch
                        id={`col_toggle_${idPrefix === 'Instance' ? '' : `${idPrefix.toLowerCase()}_`}${col.key}`}
                        checked={isChecked}
                        onChange={(checked) => onToggleColumn(col.key, checked)}
                        label={labelText}
                        labelClassName="instance-columns-dropdown__label"
                      />
                    )}
                  </motion.div>
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
