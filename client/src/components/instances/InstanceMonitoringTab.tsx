import { useState, useMemo, useRef, useCallback } from 'react';
import { useQueries, keepPreviousData } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { IconActivity, IconBug, IconCloudFog } from '@tabler/icons-react';
import { api } from '../../api/client';
import { AppIcon } from '../AppIcon';
import { TabLoadingPlaceholder } from '../TabLoadingPlaceholder';
import type { InstanceItem } from '../../types/instance';

interface MetricPoint {
  timestamp: string;
  cpu: number;
  memory: number;
  players: number;
  ups: number;
  saveSize: number;
  spm: number;
  espm?: number;
  evolution?: number;
  evolutionGleba?: number;
  pollution?: number;
  pollutionAbsorbed?: number;
  pollutionGleba?: number;
  pollutionGlebaAbsorbed?: number;
}

interface InstanceMonitoringTabProps {
  instances: InstanceItem[];
  t: (key: string, ...args: (string | number)[]) => string;
}

type RangeOption = '1h' | '6h' | '24h' | '7d' | '30d' | '90d' | '180d' | '365d';
type MetricKey =
  | 'cpu'
  | 'memory'
  | 'ups'
  | 'spm'
  | 'espm'
  | 'players'
  | 'saveSize'
  | 'evolution'
  | 'evolutionGleba'
  | 'pollution'
  | 'pollutionAbsorbed'
  | 'pollutionGleba'
  | 'pollutionGlebaAbsorbed';

const COLORS = [
  'var(--mantine-color-blue-filled)',
  'var(--mantine-color-teal-filled)',
  'var(--mantine-color-orange-filled)',
  'var(--mantine-color-pink-filled)',
  'var(--mantine-color-cyan-filled)',
  'var(--mantine-color-grape-filled)',
  'var(--mantine-color-yellow-filled)',
  'var(--mantine-color-red-filled)',
  'var(--mantine-color-indigo-filled)',
  'var(--mantine-color-lime-filled)',
];

export function InstanceMonitoringTab({
  instances,
  t,
}: InstanceMonitoringTabProps) {
  const [range, setRange] = useState<RangeOption>('24h');
  const [metricKey, setMetricKey] = useState<MetricKey>('cpu');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hoveredLegendId, setHoveredLegendId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleLegendClick = (instId: string, ev: React.MouseEvent) => {
    const idStr = String(instId);
    const isMeta = ev.ctrlKey || ev.metaKey || ev.shiftKey;

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isMeta) {
        if (next.has(idStr)) {
          next.delete(idStr);
        } else {
          next.add(idStr);
        }
      } else {
        if (next.size === 1 && next.has(idStr)) {
          next.clear(); // Toggle off solo
        } else {
          next.clear();
          next.add(idStr);
        }
      }
      return next;
    });
    setHoverIndex(null);
  };

  // Parallel fetch metrics for all instances using React Query
  const queries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: ['metrics', inst.id, range],
      queryFn: () =>
        api<MetricPoint[]>(`/api/metrics/${inst.id}?range=${range}`),
      enabled: !!inst.id,
      refetchInterval: (range === '1h' || range === '6h' || range === '24h'
        ? 30000
        : false) as number | false,
      placeholderData: keepPreviousData,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);

  const rangeOptions: { key: RangeOption; label: string }[] = useMemo(
    () => [
      { key: '1h', label: t('range_1h') || '1 час' },
      { key: '6h', label: t('range_6h') || '6 часов' },
      { key: '24h', label: t('range_24h') || '24 часа' },
      { key: '7d', label: t('range_7d') || '7 дней' },
      { key: '30d', label: t('range_30d') || '30 дней' },
      { key: '90d', label: t('range_90d') || '90 дней' },
      { key: '180d', label: t('range_180d') || '180 дней' },
      { key: '365d', label: t('range_365d') || '1 год' },
    ],
    [t],
  );

  const metricOptions: {
    key: MetricKey;
    label: string;
    icon: React.ReactNode;
  }[] = useMemo(
    () => [
      {
        key: 'cpu',
        label: t('metric_cpu_usage') || 'Использование CPU',
        icon: <AppIcon name="cpu" size={14} />,
      },
      {
        key: 'memory',
        label: t('metric_memory_usage') || 'Использование памяти',
        icon: <AppIcon name="memory" size={14} />,
      },
      {
        key: 'ups',
        label: t('metric_ups') || 'UPS',
        icon: <IconActivity size={14} />,
      },
      {
        key: 'spm',
        label: t('metric_spm') || 'SPM',
        icon: <AppIcon name="science" size={14} />,
      },
      {
        key: 'espm',
        label: t('metric_espm') || 'ESPM',
        icon: <AppIcon name="science" size={14} />,
      },
      {
        key: 'players',
        label: t('metric_players_online') || 'Онлайн игроков',
        icon: <AppIcon name="users" size={14} />,
      },
      {
        key: 'saveSize',
        label: t('metric_save_size') || 'Размер файла сохранения',
        icon: <AppIcon name="save" size={14} />,
      },
      {
        key: 'evolution',
        label: `${t('metric_evolution') || 'Эволюция кусак (%)'} (${t('metric_evolution_nauvis') || 'Наувис'})`,
        icon: <IconBug size={14} />,
      },
      {
        key: 'evolutionGleba',
        label: `${t('metric_evolution') || 'Эволюция кусак (%)'} (${t('metric_evolution_gleba') || 'Глеба'})`,
        icon: <IconBug size={14} />,
      },
      {
        key: 'pollution',
        label: `${t('metric_pollution_production') || t('metric_pollution') || 'Загрязнение'} (${t('metric_evolution_nauvis') || 'Наувис'})`,
        icon: <IconCloudFog size={14} />,
      },
      {
        key: 'pollutionAbsorbed',
        label: `${t('metric_pollution_absorption') || 'Поглощение'} (${t('metric_evolution_nauvis') || 'Наувис'})`,
        icon: <IconCloudFog size={14} />,
      },
      {
        key: 'pollutionGleba',
        label: `${t('metric_pollution_production') || t('metric_pollution') || 'Загрязнение'} (${t('metric_evolution_gleba') || 'Глеба'})`,
        icon: <IconCloudFog size={14} />,
      },
      {
        key: 'pollutionGlebaAbsorbed',
        label: `${t('metric_pollution_absorption') || 'Поглощение'} (${t('metric_evolution_gleba') || 'Глеба'})`,
        icon: <IconCloudFog size={14} />,
      },
    ],
    [t],
  );

  // Map each server ID to a distinct color
  const instanceColors = useMemo(() => {
    const map: Record<string, string> = {};
    instances.forEach((inst, idx) => {
      map[String(inst.id)] = COLORS[idx % COLORS.length];
    });
    return map;
  }, [instances]);

  // Find the latest timestamp across all metrics to align the right edge of the chart
  const timeWindow = useMemo(() => {
    let maxTime = 0;
    queries.forEach((q) => {
      const data = q.data || [];
      if (data.length > 0) {
        const tVal = new Date(data[data.length - 1].timestamp).getTime();
        if (tVal > maxTime) maxTime = tVal;
      }
    });
    const right = maxTime > 0 ? new Date(maxTime) : new Date();

    let leftMs = 24 * 60 * 60 * 1000;
    switch (range) {
      case '1h':
        leftMs = 1 * 60 * 60 * 1000;
        break;
      case '6h':
        leftMs = 6 * 60 * 60 * 1000;
        break;
      case '24h':
        leftMs = 24 * 60 * 60 * 1000;
        break;
      case '7d':
        leftMs = 7 * 24 * 60 * 60 * 1000;
        break;
      case '30d':
        leftMs = 30 * 24 * 60 * 60 * 1000;
        break;
      case '90d':
        leftMs = 90 * 24 * 60 * 60 * 1000;
        break;
      case '180d':
        leftMs = 180 * 24 * 60 * 60 * 1000;
        break;
      case '365d':
        leftMs = 365 * 24 * 60 * 60 * 1000;
        break;
    }
    const left = new Date(right.getTime() - leftMs);
    return { left, right, duration: leftMs };
  }, [range, queries]);

  const valueFormatter = useCallback(
    (val: number) => {
      if (
        metricKey === 'cpu' ||
        metricKey === 'evolution' ||
        metricKey === 'evolutionGleba'
      ) {
        return `${val.toFixed(1)}%`;
      }
      if (
        metricKey === 'pollution' ||
        metricKey === 'pollutionGleba' ||
        metricKey === 'pollutionAbsorbed' ||
        metricKey === 'pollutionGlebaAbsorbed'
      ) {
        return `${Math.round(val).toLocaleString()} /мин`;
      }
      if (metricKey === 'memory' || metricKey === 'saveSize')
        return formatBytes(val);
      if (metricKey === 'players') return `${Math.round(val)}`;
      if (metricKey === 'ups') return `${val.toFixed(1)}`;
      if (metricKey === 'spm' || metricKey === 'espm')
        return `${Math.round(val)}`;
      return `${val}`;
    },
    [metricKey],
  );

  // Resample all server datasets to exactly 120 points to support smooth morphing coordinates
  const targetPointsCount = 120;
  const resampledQueriesData = useMemo(() => {
    return queries.map((q, qIdx) => {
      const inst = instances[qIdx];
      const data = q.data || [];
      if (data.length === 0) return { instance: inst, points: [] };

      let resampled: MetricPoint[] = [];
      if (data.length === 1) {
        resampled = Array.from({ length: targetPointsCount }, () => ({
          ...data[0],
        }));
      } else {
        for (let i = 0; i < targetPointsCount; i++) {
          const progress = i / (targetPointsCount - 1);
          const rawIndex = progress * (data.length - 1);
          const indexLow = Math.floor(rawIndex);
          const indexHigh = Math.ceil(rawIndex);
          const weight = rawIndex - indexLow;

          const pLow = data[indexLow];
          const pHigh = data[indexHigh];

          const cpu = pLow.cpu + (pHigh.cpu - pLow.cpu) * weight;
          const memory = pLow.memory + (pHigh.memory - pLow.memory) * weight;
          const players =
            pLow.players + (pHigh.players - pLow.players) * weight;
          const ups = pLow.ups + (pHigh.ups - pLow.ups) * weight;
          const saveSize =
            pLow.saveSize + (pHigh.saveSize - pLow.saveSize) * weight;
          const spm = pLow.spm + (pHigh.spm - pLow.spm) * weight;
          const espm =
            (pLow.espm ?? 0) + ((pHigh.espm ?? 0) - (pLow.espm ?? 0)) * weight;
          const evolution =
            (pLow.evolution ?? 0) +
            ((pHigh.evolution ?? 0) - (pLow.evolution ?? 0)) * weight;
          const evolutionGleba =
            (pLow.evolutionGleba ?? 0) +
            ((pHigh.evolutionGleba ?? 0) - (pLow.evolutionGleba ?? 0)) * weight;
          const pollution =
            (pLow.pollution ?? 0) +
            ((pHigh.pollution ?? 0) - (pLow.pollution ?? 0)) * weight;
          const pollutionAbsorbed =
            (pLow.pollutionAbsorbed ?? 0) +
            ((pHigh.pollutionAbsorbed ?? 0) - (pLow.pollutionAbsorbed ?? 0)) *
              weight;
          const pollutionGleba =
            (pLow.pollutionGleba ?? 0) +
            ((pHigh.pollutionGleba ?? 0) - (pLow.pollutionGleba ?? 0)) * weight;
          const pollutionGlebaAbsorbed =
            (pLow.pollutionGlebaAbsorbed ?? 0) +
            ((pHigh.pollutionGlebaAbsorbed ?? 0) -
              (pLow.pollutionGlebaAbsorbed ?? 0)) *
              weight;

          const timestamp = weight < 0.5 ? pLow.timestamp : pHigh.timestamp;

          resampled.push({
            timestamp,
            cpu,
            memory,
            players,
            ups,
            saveSize,
            spm,
            espm,
            evolution,
            evolutionGleba,
            pollution,
            pollutionAbsorbed,
            pollutionGleba,
            pollutionGlebaAbsorbed,
          });
        }
      }
      return { instance: inst, points: resampled };
    });
  }, [queries, instances]);

  const hasData = useMemo(() => {
    return resampledQueriesData.some((rqd) => rqd.points.length > 0);
  }, [resampledQueriesData]);

  // Chart coordinates
  const width = 1000;
  const height = 300;
  const paddingLeft = 110;
  const paddingRight = 45;
  const paddingTop = 20;
  const paddingBottom = 35;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Global Y scale scaling (only consider selected/visible instances)
  const maxVal = useMemo(() => {
    let max = 0.1;
    resampledQueriesData.forEach((rqd) => {
      if (selectedIds.size > 0 && !selectedIds.has(String(rqd.instance.id))) {
        return;
      }
      rqd.points.forEach((p) => {
        const val = p[metricKey] || 0;
        if (val > max) max = val;
      });
    });
    return max;
  }, [resampledQueriesData, metricKey, selectedIds]);

  const yMaxDefault = useMemo(() => {
    if (
      metricKey === 'cpu' ||
      metricKey === 'evolution' ||
      metricKey === 'evolutionGleba'
    )
      return 100;
    if (metricKey === 'pollution' || metricKey === 'pollutionGleba') return 500;
    if (metricKey === 'memory') return 1024 * 1024 * 1024;
    if (metricKey === 'ups') return 60;
    if (metricKey === 'spm' || metricKey === 'espm') return 100;
    if (metricKey === 'saveSize') return 1024 * 1024;
    return 5;
  }, [metricKey]);

  const yMax = useMemo(() => {
    if (metricKey === 'evolution' || metricKey === 'evolutionGleba') return 100;
    if (metricKey === 'ups') {
      if (maxVal <= 61) return 60;
      return Math.ceil(maxVal / 60) * 60;
    }
    return Math.max(yMaxDefault, maxVal) * 1.15;
  }, [metricKey, yMaxDefault, maxVal]);

  const svgPathsData = useMemo(() => {
    const { left, duration } = timeWindow;
    return resampledQueriesData.map((rqd) => {
      const points = rqd.points.map((m) => {
        const itemTime = new Date(m.timestamp).getTime();
        const relativeTime = itemTime - left.getTime();
        const ratio =
          duration > 0 ? Math.max(0, Math.min(1, relativeTime / duration)) : 0;

        const x = paddingLeft + ratio * chartWidth;
        const y =
          height - paddingBottom - ((m[metricKey] || 0) / yMax) * chartHeight;
        return { x, y, raw: m };
      });

      const pathStr =
        points.length === 0
          ? ''
          : points
              .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
              .join(' ');

      const first = points[0];
      const last = points[points.length - 1];
      const areaPath =
        pathStr && first && last
          ? `${pathStr} L ${last.x} ${height - paddingBottom} L ${first.x} ${height - paddingBottom} Z`
          : '';

      return {
        instance: rqd.instance,
        points,
        pathStr,
        areaPath,
      };
    });
  }, [
    resampledQueriesData,
    timeWindow,
    metricKey,
    yMax,
    chartWidth,
    chartHeight,
    height,
    paddingBottom,
  ]);

  // SVG paths filtered by visibility
  const visiblePathsData = useMemo(() => {
    return svgPathsData.filter((d) => {
      if (selectedIds.size === 0) return true;
      return selectedIds.has(String(d.instance.id));
    });
  }, [svgPathsData, selectedIds]);

  function handleMouseMove(ev: React.MouseEvent<SVGSVGElement, MouseEvent>) {
    if (!hasData) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const mouseX = ((ev.clientX - rect.left) / rect.width) * width;

    const ratio = Math.max(0, Math.min(1, (mouseX - paddingLeft) / chartWidth));
    const idx = Math.round(ratio * (targetPointsCount - 1));

    setHoverIndex(idx);

    const containerRect = containerRef.current?.getBoundingClientRect();
    if (containerRect) {
      const isRightHalf =
        ev.clientX - containerRect.left > containerRect.width / 2;
      const tooltipX = isRightHalf
        ? ev.clientX - containerRect.left - 245
        : ev.clientX - containerRect.left + 15;
      const tooltipY = ev.clientY - containerRect.top - 120;
      setTooltipPos({ x: tooltipX, y: tooltipY });
    }
  }

  const gridTicks = 5;
  const timeLabels = useMemo(() => {
    const { left, duration } = timeWindow;
    const labels = [];
    for (let i = 0; i < gridTicks; i++) {
      const ratio = i / (gridTicks - 1);
      const tickTime = new Date(left.getTime() + ratio * duration);

      let text = '';
      if (range === '1h' || range === '6h' || range === '24h') {
        text = tickTime.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
      } else if (
        range === '7d' ||
        range === '30d' ||
        range === '90d' ||
        range === '180d'
      ) {
        text = tickTime.toLocaleDateString([], {
          day: '2-digit',
          month: '2-digit',
        });
      } else {
        text = tickTime.toLocaleDateString([], {
          month: 'short',
          year: '2-digit',
        });
      }

      const x = paddingLeft + ratio * chartWidth;
      labels.push({ x, text });
    }
    return labels;
  }, [timeWindow, range, chartWidth]);

  // Construct active points lists sorted by value for tooltip presentation
  const tooltipRows = useMemo(() => {
    if (hoverIndex === null) return [];
    return visiblePathsData
      .map((d) => {
        const pt = d.points[hoverIndex];
        const val = Number(pt?.raw[metricKey] ?? 0);
        return {
          instance: d.instance,
          value: val,
          color:
            instanceColors[String(d.instance.id)] ||
            'var(--mantine-color-blue-filled)',
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [hoverIndex, visiblePathsData, metricKey, instanceColors]);

  const activeTimestamp = useMemo(() => {
    if (hoverIndex === null) return null;
    for (const d of visiblePathsData) {
      const pt = d.points[hoverIndex];
      if (pt) return pt.raw.timestamp;
    }
    return null;
  }, [hoverIndex, visiblePathsData]);

  const activeMetricOption = useMemo(() => {
    return (
      metricOptions.find((opt) => opt.key === metricKey) || metricOptions[0]
    );
  }, [metricOptions, metricKey]);

  return (
    <div
      ref={containerRef}
      className="monitoring-tab animate-show"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {metricOptions.map((opt) => {
            const isActive = metricKey === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                className="btn btn--compact"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: isActive
                    ? 'color-mix(in srgb, var(--accent) 16%, var(--mantine-color-dark-6))'
                    : 'var(--mantine-color-dark-6)',
                  color: isActive
                    ? 'var(--accent-selected, #f1be64)'
                    : 'var(--mantine-color-text)',
                  border: isActive
                    ? '1px solid color-mix(in srgb, var(--accent) 45%, transparent)'
                    : '1px solid var(--mantine-color-dark-4)',
                  boxShadow: isActive
                    ? '0 0 10px color-mix(in srgb, var(--accent) 18%, transparent)'
                    : 'none',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '0.82rem',
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onClick={() => {
                  setMetricKey(opt.key);
                  setHoverIndex(null);
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    color: isActive ? 'var(--accent)' : 'var(--mantine-color-dimmed)',
                  }}
                >
                  {opt.icon}
                </span>
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        <div
          className="btn-group"
          style={{
            display: 'flex',
            background: 'var(--mantine-color-dark-6)',
            borderRadius: '6px',
            padding: '4px',
          }}
        >
          {rangeOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className="btn btn--compact"
              style={{
                position: 'relative',
                background: 'transparent',
                color:
                  range === opt.key
                    ? 'var(--accent-selected, #f1be64)'
                    : 'var(--mantine-color-text)',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 12px',
                fontSize: '0.82rem',
                cursor: 'pointer',
                fontWeight: range === opt.key ? 600 : 500,
                transition: 'color 0.2s ease',
              }}
              onClick={() => {
                setRange(opt.key);
                setHoverIndex(null);
              }}
            >
              {range === opt.key && (
                <motion.div
                  layoutId="instanceActiveRangeHighlight"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background:
                      'color-mix(in srgb, var(--accent) 20%, var(--mantine-color-dark-5))',
                    border:
                      '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
                    borderRadius: '4px',
                    zIndex: 1,
                  }}
                  transition={{
                    type: 'spring',
                    stiffness: 380,
                    damping: 30,
                  }}
                />
              )}
              <span style={{ position: 'relative', zIndex: 2 }}>
                {opt.label}
              </span>
            </button>
          ))}
        </div>
      </header>

      {isLoading ? (
        <TabLoadingPlaceholder
          variant="dashboard"
          label={t('tab_data_loading') || 'Загрузка данных...'}
        />
      ) : !hasData ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '300px',
            background: 'var(--mantine-color-dark-7)',
            borderRadius: '8px',
            border: '1px dashed var(--mantine-color-dark-4)',
            padding: '24px',
            color: 'var(--mantine-color-dimmed)',
          }}
        >
          <span style={{ fontSize: '1.1rem', marginBottom: '8px' }}>
            {t('no_metrics_title') || 'Нет данных'}
          </span>
          <span
            style={{
              fontSize: '0.85rem',
              textAlign: 'center',
              maxWidth: '400px',
            }}
          >
            {t('no_active_servers_metrics') ||
              'Нет доступных серверов с историей метрик для отображения.'}
          </span>
        </div>
      ) : (
        <div
          style={{
            position: 'relative',
            width: '100%',
            background: 'var(--mantine-color-dark-7)',
            border: '1px solid var(--mantine-color-dark-4)',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          <header
            style={{
              marginBottom: '14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  color: 'var(--accent)',
                  flexShrink: 0,
                }}
              >
                {activeMetricOption.icon}
              </span>
              <h3
                style={{
                  margin: 0,
                  fontSize: '1rem',
                  fontWeight: 600,
                  color: 'var(--mantine-color-text)',
                }}
              >
                {activeMetricOption.label}
              </h3>
            </div>
            <div
              style={{
                fontSize: '0.82rem',
                color: 'var(--mantine-color-dimmed)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent)',
                }}
              />
              <span>
                {selectedIds.size > 0
                  ? `${selectedIds.size} / ${instances.length} ${t('servers_selected_count') || 'выбрано'}`
                  : `${instances.length} ${t('all_servers_label') || 'все серверы'}`}
              </span>
            </div>
          </header>

          <div
            style={{ position: 'relative', width: '100%', overflowX: 'auto' }}
          >
            <svg
              viewBox={`0 0 ${width} ${height}`}
              style={{
                width: '100%',
                height: 'auto',
                minWidth: '700px',
                display: 'block',
                overflow: 'visible',
              }}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoverIndex(null)}
            >
              <defs>
                {visiblePathsData.map((d) => {
                  const color =
                    instanceColors[String(d.instance.id)] ||
                    'var(--mantine-color-blue-filled)';
                  const isSolo = visiblePathsData.length === 1;
                  const isHovered = hoveredLegendId === String(d.instance.id);
                  const topOpacity = isHovered
                    ? 0.35
                    : isSolo
                      ? 0.3
                      : 0.18;
                  return (
                    <linearGradient
                      key={`grad-${d.instance.id}`}
                      id={`grad-inst-${d.instance.id}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor={color}
                        stopOpacity={topOpacity}
                      />
                      <stop offset="100%" stopColor={color} stopOpacity="0.0" />
                    </linearGradient>
                  );
                })}
              </defs>

              {/* Grid lines (horizontal) */}
              {[0, 0.25, 0.5, 0.75, 1].map((val, idx) => {
                const y = paddingTop + val * chartHeight;
                const gridVal = yMax * (1 - val);
                return (
                  <g key={idx}>
                    <line
                      x1={paddingLeft}
                      y1={y}
                      x2={width - paddingRight}
                      y2={y}
                      stroke="var(--mantine-color-dark-4)"
                      strokeWidth="1"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={paddingLeft - 8}
                      y={y + 4}
                      fill="var(--mantine-color-dimmed)"
                      fontSize="11"
                      textAnchor="end"
                    >
                      {valueFormatter(gridVal)}
                    </text>
                  </g>
                );
              })}

              {/* X axis line */}
              <line
                x1={paddingLeft}
                y1={height - paddingBottom}
                x2={width - paddingRight}
                y2={height - paddingBottom}
                stroke="var(--mantine-color-dark-4)"
                strokeWidth="1.5"
              />

              {/* X axis labels */}
              {timeLabels.map((lbl, idx) => (
                <text
                  key={idx}
                  x={lbl.x}
                  y={height - 15}
                  fill="var(--mantine-color-dimmed)"
                  fontSize="12"
                  textAnchor="middle"
                >
                  {lbl.text}
                </text>
              ))}

              {/* Area fills under curves ("тень от линий вниз") */}
              {visiblePathsData.map((d) => {
                if (!d.areaPath) return null;
                const isHovered = hoveredLegendId === String(d.instance.id);
                const opacity = hoveredLegendId ? (isHovered ? 1 : 0.25) : 1;
                return (
                  <motion.path
                    key={`area-${d.instance.id}`}
                    d={d.areaPath}
                    fill={`url(#grad-inst-${d.instance.id})`}
                    opacity={opacity}
                    animate={{ d: d.areaPath }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  />
                );
              })}

              {/* Server Stroke Lines */}
              {visiblePathsData.map((d) => {
                if (!d.pathStr) return null;
                const color =
                  instanceColors[String(d.instance.id)] ||
                  'var(--mantine-color-blue-filled)';
                const isHovered = hoveredLegendId === String(d.instance.id);
                const strokeWidth = isHovered ? 3.5 : 2.5;
                const opacity = hoveredLegendId ? (isHovered ? 1 : 0.35) : 1;
                return (
                  <motion.path
                    key={`stroke-${d.instance.id}`}
                    d={d.pathStr}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={opacity}
                    animate={{ d: d.pathStr }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  />
                );
              })}

              {/* Hover guide elements */}
              {hoverIndex !== null && activeTimestamp && (
                <g>
                  {/* Vertical line indicator */}
                  <line
                    x1={
                      paddingLeft +
                      (hoverIndex / (targetPointsCount - 1)) * chartWidth
                    }
                    y1={paddingTop}
                    x2={
                      paddingLeft +
                      (hoverIndex / (targetPointsCount - 1)) * chartWidth
                    }
                    y2={height - paddingBottom}
                    stroke="var(--mantine-color-dark-3)"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />

                  {/* Dots for each server */}
                  {visiblePathsData.map((d) => {
                    const pt = d.points[hoverIndex];
                    if (!pt) return null;
                    const color =
                      instanceColors[String(d.instance.id)] ||
                      'var(--mantine-color-blue-filled)';
                    const isHovered = hoveredLegendId === String(d.instance.id);
                    return (
                      <circle
                        key={String(d.instance.id)}
                        cx={pt.x}
                        cy={pt.y}
                        r={isHovered ? 7 : 6}
                        fill="var(--mantine-color-dark-9)"
                        stroke={color}
                        strokeWidth={isHovered ? 3 : 2.5}
                      />
                    );
                  })}
                </g>
              )}
            </svg>
          </div>

          {/* Interactive Multi-Server Tooltip */}
          {hoverIndex !== null && activeTimestamp && tooltipRows.length > 0 && (
            <div
              style={{
                position: 'absolute',
                left: tooltipPos.x,
                top: tooltipPos.y,
                backgroundColor: 'rgba(26, 27, 30, 0.95)',
                backdropFilter: 'blur(8px)',
                border: '1px solid var(--mantine-color-dark-4)',
                borderRadius: '6px',
                padding: '10px 14px',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
                pointerEvents: 'none',
                zIndex: 100,
                minWidth: '220px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                fontSize: '0.82rem',
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  color: 'var(--mantine-color-white)',
                  borderBottom: '1px solid var(--mantine-color-dark-4)',
                  paddingBottom: '4px',
                  marginBottom: '2px',
                }}
              >
                {new Date(activeTimestamp).toLocaleString([], {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                }}
              >
                {tooltipRows.map((row) => (
                  <div
                    key={String(row.instance.id)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-block',
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: row.color,
                        }}
                      />
                      <span
                        style={{
                          color: 'var(--mantine-color-text)',
                          maxWidth: '120px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.instance.name}
                      </span>
                    </div>
                    <span
                      style={{
                        fontWeight: 700,
                        color: 'var(--mantine-color-white)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {valueFormatter(row.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Legend Block below chart */}
      {hasData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <footer
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              padding: '12px 16px',
              background: 'var(--mantine-color-dark-7)',
              borderRadius: '8px',
              border: '1px solid var(--mantine-color-dark-4)',
            }}
          >
            {instances.map((inst) => {
              const hasHistory = resampledQueriesData.some(
                (rqd) =>
                  String(rqd.instance.id) === String(inst.id) &&
                  rqd.points.length > 0,
              );
              if (!hasHistory) return null;
              const isSelected =
                selectedIds.size === 0 || selectedIds.has(String(inst.id));
              const isHovered = hoveredLegendId === String(inst.id);
              const color =
                instanceColors[String(inst.id)] ||
                'var(--mantine-color-blue-filled)';
              return (
                <div
                  key={String(inst.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    background: isHovered
                      ? 'var(--mantine-color-dark-5)'
                      : isSelected && selectedIds.size > 0
                        ? 'rgba(255, 255, 255, 0.05)'
                        : 'transparent',
                    border: isHovered
                      ? '1px solid var(--mantine-color-dark-3)'
                      : '1px solid transparent',
                    opacity: isSelected ? 1 : 0.35,
                    transition: 'all 0.15s ease',
                    userSelect: 'none',
                  }}
                  onMouseEnter={() => setHoveredLegendId(String(inst.id))}
                  onMouseLeave={() => setHoveredLegendId(null)}
                  onClick={(ev) => handleLegendClick(String(inst.id), ev)}
                  title={
                    t('legend_help') || 'Клик — соло, Ctrl+Клик — мультивыбор'
                  }
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: isSelected
                        ? color
                        : 'var(--mantine-color-dark-4)',
                      transition: 'background-color 0.2s ease',
                      boxShadow: isSelected ? `0 0 6px ${color}` : 'none',
                    }}
                  />
                  <span
                    style={{
                      color: isSelected
                        ? 'var(--mantine-color-text)'
                        : 'var(--mantine-color-dimmed)',
                      fontWeight: isSelected ? 600 : 500,
                    }}
                  >
                    {inst.name}
                  </span>
                </div>
              );
            })}
          </footer>
          <div
            style={{
              fontSize: '0.78rem',
              color: 'var(--mantine-color-dimmed)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              paddingLeft: '4px',
            }}
          >
            <AppIcon name="help" size={14} />
            <span>
              {t('legend_help') ||
                'Клик по серверу в легенде — показать только его. Ctrl + Клик — выбрать несколько.'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
