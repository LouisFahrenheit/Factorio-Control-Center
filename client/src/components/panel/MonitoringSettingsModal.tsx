import { motion } from 'motion/react';
import {
  IconAdjustmentsHorizontal,
  IconChevronUp,
  IconChevronDown,
  IconRotate2,
  IconCheck,
  IconActivity,
  IconBug,
  IconCloudFog,
} from '@tabler/icons-react';
import { AppIcon } from '../AppIcon';
import { FccSwitch } from '../FccSwitch';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import {
  isGameMetric,
  DEFAULT_MONITORING_METRICS_CONFIG,
  type MonitoringMetricConfigItem,
  type MonitoringMetricId,
} from '../../lib/monitoringConfig';

interface MonitoringSettingsModalProps {
  open: boolean;
  config: MonitoringMetricConfigItem[];
  onChange: (newConfig: MonitoringMetricConfigItem[]) => void;
  onClose: () => void;
  hasGameMetrics: boolean;
  isModDisabled?: boolean;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function MonitoringSettingsModal({
  open,
  config,
  onChange,
  onClose,
  hasGameMetrics,
  isModDisabled,
  t,
}: MonitoringSettingsModalProps) {
  if (!open) return null;

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= config.length) return;

    const next = [...config];
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;
    onChange(next);
  };

  const handleToggle = (id: MonitoringMetricId, enabled: boolean) => {
    const next = config.map((item) =>
      item.id === id ? { ...item, enabled } : item,
    );
    onChange(next);
  };

  const handleReset = () => {
    onChange([...DEFAULT_MONITORING_METRICS_CONFIG]);
  };

  const getMetricMeta = (id: MonitoringMetricId) => {
    switch (id) {
      case 'cpu':
        return {
          title: t('metric_cpu_usage') || 'Использование CPU',
          icon: (
            <AppIcon
              name="cpu"
              size={18}
              style={{ color: 'var(--mantine-color-blue-filled)' }}
            />
          ),
          accentColor: 'var(--mantine-color-blue-filled)',
        };
      case 'memory':
        return {
          title: t('metric_memory_usage') || 'Оперативная память',
          icon: (
            <AppIcon
              name="memory"
              size={18}
              style={{ color: 'var(--mantine-color-orange-filled)' }}
            />
          ),
          accentColor: 'var(--mantine-color-orange-filled)',
        };
      case 'ups':
        return {
          title: t('metric_ups') || 'UPS',
          icon: (
            <IconActivity
              size={18}
              color="var(--mantine-color-yellow-filled)"
            />
          ),
          accentColor: 'var(--mantine-color-yellow-filled)',
        };
      case 'spm':
        return {
          title: t('metric_spm_espm') || 'SPM / ESPM',
          icon: (
            <AppIcon
              name="science"
              size={18}
              style={{ color: 'var(--mantine-color-cyan-filled)' }}
            />
          ),
          accentColor: 'var(--mantine-color-cyan-filled)',
        };
      case 'players':
        return {
          title: t('metric_players_online') || 'Онлайн игроков',
          icon: (
            <AppIcon
              name="users"
              size={18}
              style={{ color: 'var(--mantine-color-green-filled)' }}
            />
          ),
          accentColor: 'var(--mantine-color-green-filled)',
        };
      case 'saveSize':
        return {
          title: t('metric_save_size') || 'Размер файла сохранения',
          icon: (
            <AppIcon
              name="save"
              size={18}
              style={{ color: 'var(--mantine-color-pink-filled)' }}
            />
          ),
          accentColor: 'var(--mantine-color-pink-filled)',
        };
      case 'evolution':
        return {
          title: t('metric_evolution') || 'Эволюция',
          icon: (
            <IconBug size={18} color="var(--mantine-color-red-filled)" />
          ),
          accentColor: 'var(--mantine-color-red-filled)',
        };
      case 'pollution':
        return {
          title: t('metric_pollution') || 'Загрязнение',
          icon: (
            <IconCloudFog size={18} color="var(--mantine-color-teal-filled)" />
          ),
          accentColor: 'var(--mantine-color-teal-filled)',
        };
    }
  };

  return (
    <ModalBackdrop open id="monitoringSettingsBackdrop" onClose={onClose}>
      <div
        className="fu-modal monitoring-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="monitoringSettingsHeading"
        style={{
          maxWidth: '520px',
          width: '100%',
        }}
      >
        <div
          className="fu-modal__header"
          id="monitoringSettingsHeading"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontWeight: 700,
            fontSize: '1.05rem',
          }}
        >
          <IconAdjustmentsHorizontal
            size={20}
            style={{ color: 'var(--mantine-color-blue-filled)' }}
          />
          <span>{t('monitoring_settings_title') || 'Настройка графиков'}</span>
        </div>

        <div
          className="fu-modal__body"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '16px 20px',
          }}
        >
          <p
            style={{
              margin: '0 0 4px 0',
              fontSize: '0.85rem',
              color: 'var(--mantine-color-dimmed)',
              lineHeight: 1.45,
            }}
          >
            {t('monitoring_settings_desc') ||
              'Управляйте видимостью и порядком отображения графиков на вкладке мониторинга.'}
          </p>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {config.map((item, index) => {
              const meta = getMetricMeta(item.id);
              const isMod = isGameMetric(item.id);
              const isFirst = index === 0;
              const isLast = index === config.length - 1;

              return (
                <motion.div
                  key={item.id}
                  layout
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: item.enabled
                      ? 'rgba(255, 255, 255, 0.03)'
                      : 'rgba(255, 255, 255, 0.01)',
                    border: `1px solid ${
                      item.enabled
                        ? 'rgba(255, 255, 255, 0.08)'
                        : 'rgba(255, 255, 255, 0.03)'
                    }`,
                    opacity: item.enabled ? 1 : 0.55,
                    transition: 'border-color 0.15s, opacity 0.15s',
                  }}
                >
                  {/* Left: Reorder controls + Icon + Title + Mod badge */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    {/* Reorder Buttons */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        flexShrink: 0,
                      }}
                    >
                      <button
                        type="button"
                        aria-label={`${t('monitoring_settings_move_up') || 'Выше'}: ${meta.title}`}
                        disabled={isFirst}
                        onClick={() => handleMove(index, 'up')}
                        style={{
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: 'none',
                          borderRadius: '3px',
                          color: isFirst
                            ? 'rgba(255, 255, 255, 0.15)'
                            : 'var(--mantine-color-text)',
                          width: '24px',
                          height: '16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: isFirst ? 'not-allowed' : 'pointer',
                          padding: 0,
                          transition: 'background 0.15s',
                        }}
                      >
                        <IconChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label={`${t('monitoring_settings_move_down') || 'Ниже'}: ${meta.title}`}
                        disabled={isLast}
                        onClick={() => handleMove(index, 'down')}
                        style={{
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: 'none',
                          borderRadius: '3px',
                          color: isLast
                            ? 'rgba(255, 255, 255, 0.15)'
                            : 'var(--mantine-color-text)',
                          width: '24px',
                          height: '16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: isLast ? 'not-allowed' : 'pointer',
                          padding: 0,
                          transition: 'background 0.15s',
                        }}
                      >
                        <IconChevronDown size={14} />
                      </button>
                    </div>

                    {/* Metric Icon */}
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {meta.icon}
                    </div>

                    {/* Title & Badge */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        minWidth: 0,
                        gap: '2px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '0.88rem',
                            fontWeight: 600,
                            color: 'var(--mantine-color-text)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {meta.title}
                        </span>
                        {isMod && (
                          <span
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 600,
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: 'rgba(255, 255, 255, 0.08)',
                              color: 'var(--mantine-color-dimmed)',
                              letterSpacing: '0.04em',
                              textTransform: 'uppercase',
                              flexShrink: 0,
                            }}
                          >
                            {t('metrics_mod_promo_badge') || 'Мод'}
                          </span>
                        )}
                      </div>
                      {isMod && !hasGameMetrics && (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            color: 'var(--mantine-color-dimmed)',
                          }}
                        >
                          {isModDisabled
                            ? t('monitoring_settings_mod_disabled') ||
                              'мод отключен'
                            : t('monitoring_settings_mod_needed') ||
                              'требуется мод'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Toggle Switch */}
                  <div style={{ flexShrink: 0, marginLeft: '12px' }}>
                    <FccSwitch
                      id={`switch-metric-${item.id}`}
                      checked={item.enabled}
                      onChange={(checked) => handleToggle(item.id, checked)}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        <div
          className="fu-modal__footer"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <button
            type="button"
            className="btn btn--secondary"
            onClick={handleReset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.85rem',
            }}
          >
            <IconRotate2 size={16} />
            <span>{t('monitoring_settings_reset') || 'Сбросить'}</span>
          </button>

          <button
            type="button"
            className="btn btn--primary"
            onClick={onClose}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.85rem',
            }}
          >
            <IconCheck size={16} />
            <span>{t('monitoring_settings_close') || 'Готово'}</span>
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
