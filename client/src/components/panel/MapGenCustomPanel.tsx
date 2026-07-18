import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, type Transition, type Variants } from 'motion/react';
import {
  IconDice,
  IconEraser,
  IconFocus2,
  IconHandMove,
  IconMapPin,
  IconPencil,
  IconTrash,
} from '@tabler/icons-react';
import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { FccSwitch } from '../FccSwitch';
import { TabPanelsTransition } from '../TabPanelsTransition';
import type { CreateSaveApi } from '../../hooks/useCreateSave';
import { MAP_PREVIEW_DOWNLOAD_SIZES } from '../../lib/mapGen/previewSizes';
import {
  MAP_GEN_PLANETS,
  controlLabelKey,
  controlRows,
  planetLabelKey,
  type MapGenTabId,
} from '../../lib/mapGen/catalog';
import { applyMapTypeToUi } from '../../lib/mapGen/buildSettings';
import { MAP_GEN_MAP_TYPES, type MapGenMapType } from '../../lib/mapGen/types';
import {
  EVOLUTION_FIELD_SPECS,
  EXPANSION_FIELD_SPECS,
  POLLUTION_FIELD_SPECS,
  type NumericFieldSpec,
  clampNumeric,
  normalizeSettlerGroupSizes,
  sliderIndexForValue,
  valueForSliderIndex,
} from '../../lib/mapGen/mapSettingsNumeric';
import {
  MAP_GEN_AUTOPLACE_MIN_INDEX,
  MAP_GEN_ASTEROID_MIN_INDEX,
  MAP_GEN_SLIDER_MAX,
  asteroidPercentAt,
  autoplaceFieldPercent,
  clampAutoplaceSliderIndex,
  clampAsteroidSliderIndex,
  BIAS_SLIDER_MAX,
  BIAS_SLIDER_MIN,
  clampBiasSliderIndex,
  formatAutoplaceFieldPercent,
  formatBiasValue,
  invertAutoplaceSliderIndex,
  isTerrainFrequencyInverted,
  percentToAsteroidSliderIndex,
  percentToAutoplaceSliderIndex,
} from '../../lib/mapGen/sliderScale';
import { mapGenPlanetIconUrl, mapGenResourceIconUrl } from '../../lib/mapGen/mapGenIcons';
import type { ControlUi, MapGenUiState } from '../../lib/mapGen/types';
import { MapGenIcon } from './MapGenIcon';
import {
  hasMapPreviewAnnotations,
  MAP_PREVIEW_ANNOTATION_COLORS,
  MAP_PREVIEW_ANNOTATION_DEFAULT_COLOR,
  type MapPreviewAnnotationTool,
} from '../../lib/mapGen/previewAnnotations';
import { userPresetPickerValue, parseUserPresetPickerValue } from '../../lib/mapGen/mapGenUserPresets';
import { MAP_GEN_SEED_HISTORY_SIZE } from '../../lib/mapGen/seedHistory';
import { MapPreviewViewport, type MapPreviewViewportHandle } from './MapPreviewViewport';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import { FCC_EASE_OUT } from '../../lib/motionPresets';
import { webEffectsReduced } from '../../theme/webEffects';

const GEN_TABS: MapGenTabId[] = ['resources', 'terrain', 'enemy', 'advanced'];

const PRESET_MENU_ENTER: Transition = { duration: 0.2, ease: FCC_EASE_OUT };
const PRESET_MENU_EXIT: Transition = { duration: 0.14, ease: [0.4, 0, 0.7, 0.2] };

const PRESET_MENU_LIST: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.035, delayChildren: 0.02 },
  },
  exit: {
    transition: { staggerChildren: 0.025, staggerDirection: -1 },
  },
};

const PRESET_MENU_ITEM: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: -5 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: PRESET_MENU_ENTER,
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: -3,
    transition: PRESET_MENU_EXIT,
  },
};

type GenSliderKind = 'autoplace' | 'asteroid' | 'bias';

function GenSlider({
  label,
  value,
  onChange,
  disabled,
  compact,
  autoplaceField,
  terrainFeature,
  kind = 'autoplace',
  showPercent = true,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  compact?: boolean;
  /** When set with compact mode, % label matches Factorio autoplace columns. */
  autoplaceField?: 'frequency' | 'size';
  terrainFeature?: boolean;
  /** autoplace: 17–600% (index 1–10); asteroid: 10–600%; bias: −0.50…+0.50 (index 0–20). */
  kind?: GenSliderKind;
  /** Compact table cells: show % box beside slider (default true). */
  showPercent?: boolean;
}) {
  const invertFreq = isTerrainFrequencyInverted(terrainFeature, autoplaceField);
  const minIndex =
    kind === 'bias'
      ? BIAS_SLIDER_MIN
      : kind === 'asteroid'
        ? MAP_GEN_ASTEROID_MIN_INDEX
        : MAP_GEN_AUTOPLACE_MIN_INDEX;
  const maxIndex = kind === 'bias' ? BIAS_SLIDER_MAX : MAP_GEN_SLIDER_MAX;
  const clamp =
    kind === 'asteroid'
      ? clampAsteroidSliderIndex
      : kind === 'autoplace'
        ? clampAutoplaceSliderIndex
        : clampBiasSliderIndex;

  const storedValue = clamp(value);
  const safeValue =
    kind === 'autoplace' && invertFreq ? invertAutoplaceSliderIndex(storedValue) : storedValue;

  const pctLabel =
    kind === 'bias'
      ? formatBiasValue(storedValue)
      : kind === 'asteroid'
        ? `${asteroidPercentAt(storedValue)}%`
        : compact && autoplaceField
          ? formatAutoplaceFieldPercent(storedValue, autoplaceField, { terrainFeature })
          : formatAutoplaceFieldPercent(storedValue, 'size');

  const handleChange = (raw: number) => {
    const uiIdx = clamp(raw);
    onChange(kind === 'autoplace' && invertFreq ? invertAutoplaceSliderIndex(uiIdx) : uiIdx);
  };

  if (compact) {
    return (
      <div className="create-save__slider-compact">
        <input
          type="range"
          className="create-save__range create-save__range--compact"
          min={minIndex}
          max={maxIndex}
          step={1}
          value={safeValue}
          disabled={disabled}
          title={`${label}: ${pctLabel}`}
          aria-label={label}
          onChange={(e) => handleChange(Number(e.target.value))}
        />
        {showPercent ? (
          <span
            className={
              'create-save__slider-pct' + (kind === 'bias' ? ' create-save__slider-pct--decimal' : '')
            }
          >
            {pctLabel}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <div className={'create-save__slider' + (disabled ? ' is-disabled' : '')}>
      <span className="create-save__slider-label">{label}</span>
      <input
        type="range"
        className="create-save__range"
        min={minIndex}
        max={maxIndex}
        step={1}
        value={safeValue}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => handleChange(Number(e.target.value))}
      />
      <span className="create-save__slider-val" title={pctLabel}>
        {pctLabel}
      </span>
    </div>
  );
}

/** Discrete MapGenSize / asteroid percent (Factorio 10 steps) — one slider + one % label. */
function GenMapGenPercentSteps({
  label,
  value,
  onChange,
  variant,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (percent: number) => void;
  variant: 'autoplace' | 'asteroid';
  disabled?: boolean;
}) {
  const minIndex =
    variant === 'asteroid' ? MAP_GEN_ASTEROID_MIN_INDEX : MAP_GEN_AUTOPLACE_MIN_INDEX;
  const clamp =
    variant === 'asteroid' ? clampAsteroidSliderIndex : clampAutoplaceSliderIndex;
  const index = clamp(
    variant === 'asteroid' ? percentToAsteroidSliderIndex(value) : percentToAutoplaceSliderIndex(value),
  );
  const pctLabel =
    variant === 'asteroid'
      ? `${asteroidPercentAt(index)}%`
      : formatAutoplaceFieldPercent(index, 'size');

  return (
    <div className={'create-save__slider' + (disabled ? ' is-disabled' : '')}>
      <span className="create-save__slider-label">{label}</span>
      <input
        type="range"
        className="create-save__range"
        min={minIndex}
        max={MAP_GEN_SLIDER_MAX}
        step={1}
        value={index}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => {
          const idx = clamp(Number(e.target.value));
          onChange(
            variant === 'asteroid' ? asteroidPercentAt(idx) : autoplaceFieldPercent(idx, 'size'),
          );
        }}
      />
      <span className="create-save__slider-val" title={pctLabel}>
        {pctLabel}
      </span>
    </div>
  );
}

function GenPercentRow({
  label,
  value,
  onChange,
  spec,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  spec: NumericFieldSpec;
  disabled?: boolean;
}) {
  return (
    <GenNumericRow
      label={label}
      value={value}
      spec={spec}
      unit="%"
      disabled={disabled}
      onChange={onChange}
    />
  );
}

function GenNumericRow({
  label,
  value,
  onChange,
  spec,
  disabled,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  spec: NumericFieldSpec;
  disabled?: boolean;
  unit?: string;
}) {
  const sliderIndex = sliderIndexForValue(value, spec, MAP_GEN_SLIDER_MAX);
  const commit = (raw: number) => onChange(clampNumeric(raw, spec));

  return (
    <div
      className={
        'create-save__numeric-row' +
        (unit ? ' create-save__numeric-row--with-unit' : '') +
        (disabled ? ' is-disabled' : '')
      }
    >
      <span className="create-save__slider-label">{label}</span>
      <input
        type="range"
        className="create-save__range create-save__range--numeric"
        min={0}
        max={MAP_GEN_SLIDER_MAX}
        step={1}
        value={sliderIndex}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => commit(valueForSliderIndex(Number(e.target.value), spec, MAP_GEN_SLIDER_MAX))}
      />
      <div className="create-save__numeric-input-wrap">
        <input
          type="number"
          className="input create-save__numeric-input"
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={value}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) commit(n);
          }}
        />
        {unit ? <span className="create-save__numeric-unit">{unit}</span> : null}
      </div>
    </div>
  );
}

function updateControl(
  ui: MapGenUiState,
  planetId: string,
  controlId: string,
  patch: Partial<ControlUi>,
): MapGenUiState {
  const planets = { ...ui.planets };
  const planet = { ...(planets[planetId] || {}) };
  planet[controlId] = {
    ...(planet[controlId] || { enabled: true, frequency: 5, size: 5, richness: 5 }),
    ...patch,
  };
  planets[planetId] = planet;
  return { ...ui, planets };
}

function defaultControl(): ControlUi {
  return { enabled: true, frequency: 5, size: 5, richness: 5 };
}

function getControl(ui: MapGenUiState, planetId: string, controlId: string): ControlUi {
  return ui.planets[planetId]?.[controlId] || defaultControl();
}

const PREVIEW_ANNOTATION_TOOLS: {
  id: MapPreviewAnnotationTool;
  icon: typeof IconHandMove;
  labelKey: string;
}[] = [
  { id: 'pan', icon: IconHandMove, labelKey: 'map_gen_preview_tool_pan' },
  { id: 'pen', icon: IconPencil, labelKey: 'map_gen_preview_tool_draw' },
  { id: 'marker', icon: IconMapPin, labelKey: 'map_gen_preview_tool_marker' },
  { id: 'eraser', icon: IconEraser, labelKey: 'map_gen_preview_tool_eraser' },
];

function MapGenAnimatedPicker({
  labelledBy,
  value,
  options,
  onChange,
  disabled,
}: {
  labelledBy: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduced = webEffectsReduced();
  const triggerId = useId();

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root || root.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  useEffect(() => {
    if (!disabled) return;
    setOpen(false);
  }, [disabled]);

  return (
    <div ref={rootRef} className={'create-save__gen-preset-picker' + (open ? ' is-open' : '')}>
      <button
        type="button"
        id={triggerId}
        className="input create-save__gen-preset-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${labelledBy} ${triggerId}`}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="create-save__gen-preset-trigger-text">{selectedLabel}</span>
        <span className="create-save__gen-preset-trigger-chevron" aria-hidden="true" />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.ul
            className="create-save__gen-preset-menu"
            role="listbox"
            aria-labelledby={labelledBy}
            variants={reduced ? undefined : PRESET_MENU_LIST}
            initial={reduced ? false : 'hidden'}
            animate={reduced ? undefined : 'show'}
            exit={reduced ? undefined : 'exit'}
          >
            {options.map((option) => {
              const active = option.value === value;
              return (
                <motion.li
                  key={option.value}
                  role="presentation"
                  variants={reduced ? undefined : PRESET_MENU_ITEM}
                  style={reduced ? undefined : { transformOrigin: 'top center' }}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={'create-save__gen-preset-option' + (active ? ' is-active' : '')}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    {option.label}
                  </button>
                </motion.li>
              );
            })}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

interface MapGenCustomPanelProps {
  cs: CreateSaveApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function MapGenCustomPanel({ cs, t }: MapGenCustomPanelProps) {
  const ui = cs.mapGenUi;
  const presetLabelId = useId();
  const previewSizeLabelId = useId();
  const markCenterSwitchId = useId();
  const [genTab, setGenTab] = useState<MapGenTabId>('resources');
  const [previewInteractionLocked, setPreviewInteractionLocked] = useState(false);
  const [showCenterMarker, setShowCenterMarker] = useState(false);
  const [annotationTool, setAnnotationTool] = useState<MapPreviewAnnotationTool>('pan');
  const [annotationColor, setAnnotationColor] = useState(MAP_PREVIEW_ANNOTATION_DEFAULT_COLOR);
  const [markerLabel, setMarkerLabel] = useState('');
  const [previewHasAnnotations, setPreviewHasAnnotations] = useState(false);
  const previewViewportRef = useRef<MapPreviewViewportHandle>(null);
  const presetImportRef = useRef<HTMLInputElement>(null);
  const planets = MAP_GEN_PLANETS.filter((p) => !p.spaceAge || cs.spaceAge);

  const label = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };

  const tabLabel = (id: MapGenTabId) => t(`map_gen_section_${id}`);

  const previewPlanetId = ui.previewPlanet || 'nauvis';
  const previewPlanetDef = planets.find((p) => p.previewId === previewPlanetId);
  const previewPlanetName = label(
    planetLabelKey(previewPlanetDef?.id ?? previewPlanetId),
    previewPlanetId,
  );
  const initialPreviewLocked = cs.initialPreviewPending;
  const selectedUserPresetId = parseUserPresetPickerValue(cs.selectedPresetValue);
  const presetOptions = [
    ...cs.presetIds.map((id) => ({
      value: id,
      label: t(`map_gen_preset_${id.replace(/-/g, '_')}`),
    })),
    ...cs.userPresets.map((preset) => ({
      value: userPresetPickerValue(preset.id),
      label: preset.name,
    })),
  ];

  return (
    <div className="create-save__custom">

      <div className="create-save__layout">
        <div className="create-save__settings map-gen-card">
          <fieldset disabled={initialPreviewLocked} className="create-save__fieldset-lock">
          <div className="create-save__gen-toolbar">
            <div className="create-save__gen-preset">
              <span className="create-save__gen-preset-label" id={presetLabelId}>
                {t('map_gen_preset_label')}
              </span>
              <div className="create-save__gen-preset-row">
                <MapGenAnimatedPicker
                  labelledBy={presetLabelId}
                  value={cs.selectedPresetValue}
                  options={presetOptions}
                  onChange={cs.setPreset}
                />
                <button
                  type="button"
                  className="btn btn--icon create-save__gen-preset-action"
                  title={t('map_gen_reset_btn')}
                  aria-label={t('map_gen_reset_btn')}
                  onClick={cs.resetMapGenSettings}
                >
                  <AppIcon name="reset" size={16} />
                </button>
                <button
                  type="button"
                  className="btn btn--icon create-save__gen-preset-action"
                  title={t('map_gen_user_preset_save_btn')}
                  aria-label={t('map_gen_user_preset_save_btn')}
                  onClick={cs.openSavePresetDialog}
                >
                  <AppIcon name="save" size={16} />
                </button>
                <button
                  type="button"
                  className="btn btn--icon create-save__gen-preset-action"
                  title={t('map_gen_preset_import_btn')}
                  aria-label={t('map_gen_preset_import_btn')}
                  onClick={() => presetImportRef.current?.click()}
                >
                  <AppIcon name="upload" size={16} />
                </button>
                <button
                  type="button"
                  className="btn btn--icon create-save__gen-preset-action"
                  title={t('map_gen_preset_export_btn')}
                  aria-label={t('map_gen_preset_export_btn')}
                  onClick={cs.openPresetExportDialog}
                >
                  <AppIcon name="download" size={16} />
                </button>
                {selectedUserPresetId ? (
                  <button
                    type="button"
                    className="btn btn--icon create-save__gen-preset-action create-save__gen-preset-action--danger"
                    title={t('map_gen_user_preset_delete_btn')}
                    aria-label={t('map_gen_user_preset_delete_btn')}
                    onClick={() => cs.removeUserPreset(selectedUserPresetId)}
                  >
                    <AppIcon name="delete" size={16} />
                  </button>
                ) : null}
                <input
                  ref={presetImportRef}
                  type="file"
                  accept=".fcc,application/json"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void cs.handlePresetImportFile(file);
                  }}
                />
              </div>
            </div>
            <div className="create-save__gen-tabs" role="tablist" aria-label={t('map_gen_mode_custom')}>
              {GEN_TABS.map((id) => {
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    id={`map-gen-tab-${id}`}
                    aria-selected={genTab === id}
                    aria-controls={`map-gen-panel-${id}`}
                    className={'create-save__gen-tab' + (genTab === id ? ' is-active' : '')}
                    onClick={() => setGenTab(id)}
                  >
                    {tabLabel(id)}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className="create-save__gen-panel"
            role="tabpanel"
            id={`map-gen-panel-${genTab}`}
            aria-labelledby={`map-gen-tab-${genTab}`}
          >
            <TabPanelsTransition activeKey={genTab} stageClassName="create-save__gen-panel-stage">
              {genTab === 'resources' && (
                <ResourcesTab cs={cs} t={t} label={label} spaceAge={cs.spaceAge} />
              )}
              {genTab === 'terrain' && (
                <TerrainTab cs={cs} t={t} label={label} spaceAge={cs.spaceAge} />
              )}
              {genTab === 'enemy' && (
                <EnemyTab cs={cs} t={t} label={label} spaceAge={cs.spaceAge} />
              )}
              {genTab === 'advanced' && <AdvancedTab cs={cs} t={t} spaceAge={cs.spaceAge} />}
            </TabPanelsTransition>
          </div>
          </fieldset>
        </div>

        <div className="create-save__preview-panel map-gen-card map-gen-card--preview">
          <div className="map-gen-card__header">
            <span className="map-gen-card__title">{t('map_gen_preview_title')}</span>
          </div>
          <div className="map-gen-card__body map-gen-card__body--preview">
            <div className="create-save__preview-row">
              <aside className="create-save__preview-controls">
                <fieldset disabled={initialPreviewLocked} className="create-save__fieldset-lock">
                <label className="create-save__preview-field">
                  <span className="create-save__preview-field-label">{t('map_gen_seed_label')}</span>
                  <div className="create-save__seed-row">
                    <input
                      type="text"
                      className="input"
                      inputMode="numeric"
                      placeholder={t('map_gen_seed_placeholder')}
                      value={ui.seed}
                      onChange={(e) => cs.setMapGenUi((p) => ({ ...p, seed: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="btn create-save__seed-random"
                      title={t('map_gen_seed_random')}
                      aria-label={t('map_gen_seed_random')}
                      onClick={() => cs.randomizeSeed()}
                    >
                      <IconDice size={18} stroke={1.75} aria-hidden />
                    </button>
                  </div>
                </label>

                <div
                  className={
                    'create-save__seed-history-panel' +
                    (initialPreviewLocked ? ' create-save__seed-history-panel--locked' : '')
                  }
                  aria-label={t('map_gen_seed_history_label')}
                >
                  <span className="create-save__seed-history-label">{t('map_gen_seed_history_label')}</span>
                  <div className="create-save__seed-history-slots">
                    {Array.from({ length: MAP_GEN_SEED_HISTORY_SIZE }, (_, index) => {
                      const seed = cs.seedHistory[index] ?? null;
                      if (!seed) {
                        return (
                          <span
                            key={`seed-slot-empty-${index}`}
                            className="create-save__seed-history-slot create-save__seed-history-slot--empty"
                            aria-hidden
                          />
                        );
                      }
                      const active = seed === ui.seed;
                      return (
                        <button
                          key={seed}
                          type="button"
                          className={
                            'input create-save__seed-history-btn' + (active ? ' is-active' : '')
                          }
                          title={t('map_gen_seed_history_apply', seed)}
                          aria-label={t('map_gen_seed_history_apply', seed)}
                          aria-current={active ? 'true' : undefined}
                          disabled={initialPreviewLocked || active}
                          onClick={() => cs.applySeed(seed)}
                        >
                          {seed}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="create-save__preview-field create-save__preview-download-size">
                  <span className="create-save__preview-field-label" id={previewSizeLabelId}>
                    {t('map_gen_preview_download_size')}
                  </span>
                  <MapGenAnimatedPicker
                    labelledBy={previewSizeLabelId}
                    value={String(cs.downloadPreviewSize)}
                    disabled={cs.downloadPreviewLoading}
                    options={MAP_PREVIEW_DOWNLOAD_SIZES.map((px) => ({
                      value: String(px),
                      label: t('map_gen_preview_size_option', px, px),
                    }))}
                    onChange={(v) =>
                      cs.setDownloadPreviewSize(
                        Number(v) as typeof cs.downloadPreviewSize,
                      )
                    }
                  />
                </div>

                <button
                  type="button"
                  className="btn btn--with-icon create-save__preview-download-btn"
                  disabled={cs.downloadPreviewLoading || cs.previewLoading}
                  onClick={() => void cs.downloadPreview()}
                >
                  <AppIcon name="download" size={16} />
                  {cs.downloadPreviewLoading
                    ? t('map_gen_preview_downloading')
                    : t('map_gen_preview_download')}
                </button>

                <button
                  type="button"
                  className="btn btn--with-icon create-save__preview-download-btn"
                  disabled={
                    !previewHasAnnotations ||
                    cs.downloadAnnotatedLoading ||
                    cs.downloadPreviewLoading ||
                    cs.previewLoading
                  }
                  onClick={() => {
                    const viewport = previewViewportRef.current;
                    void cs.downloadPreviewWithAnnotations(
                      viewport?.getAnnotations() ?? { strokes: [], markers: [] },
                      viewport?.getMarkerExportOptions(cs.downloadPreviewSize) ?? {},
                    );
                  }}
                >
                  <AppIcon name="download" size={16} />
                  {cs.downloadAnnotatedLoading
                    ? t('map_gen_preview_downloading')
                    : t('map_gen_preview_download_marked')}
                </button>

                <div className="create-save__preview-exchange">
                  <button type="button" className="btn btn--with-icon" onClick={cs.openExchangeImport}>
                    <AppIcon name="upload" size={16} />
                    {t('map_gen_exchange_import_btn')}
                  </button>
                  <button
                    type="button"
                    className="btn btn--with-icon"
                    disabled={cs.exchangeDialogBusy}
                    onClick={() => void cs.openExchangeExport()}
                  >
                    <AppIcon name="download" size={16} />
                    {t('map_gen_exchange_export_btn')}
                  </button>
                  <div className="create-save__preview-center-row">
                    <button
                      type="button"
                      className="btn btn--icon create-save__preview-recenter-btn"
                      title={t('map_gen_preview_recenter')}
                      aria-label={t('map_gen_preview_recenter')}
                      disabled={!cs.previewUrl || previewInteractionLocked}
                      onClick={() => previewViewportRef.current?.recenter()}
                    >
                      <IconFocus2 size={18} stroke={1.75} aria-hidden />
                    </button>
                    <FccSwitch
                      id={markCenterSwitchId}
                      className="create-save__preview-center-marker-option"
                      labelClassName="create-save__preview-center-marker-option-label"
                      checked={showCenterMarker}
                      onChange={setShowCenterMarker}
                      label={t('map_gen_preview_mark_center')}
                    />
                  </div>
                </div>

                {cs.previewError && <p className="create-save__preview-error">{cs.previewError}</p>}
                {cs.downloadPreviewError && (
                  <p className="create-save__preview-error">{cs.downloadPreviewError}</p>
                )}
                {cs.downloadAnnotatedError && (
                  <p className="create-save__preview-error">{cs.downloadAnnotatedError}</p>
                )}
                {cs.error ? (
                  <p className="create-save__preview-error modpack-import-dialog__error">{cs.error}</p>
                ) : null}

                <div className="create-save__preview-actions">
                  <button
                    type="button"
                    className="btn btn--primary btn--with-icon"
                    disabled={cs.submitting}
                    onClick={cs.openSaveNameDialog}
                  >
                    <AppIcon name="add" size={16} />
                    {t('create_save_btn')}
                  </button>
                </div>
                </fieldset>
                <div className="create-save__preview-actions">
                  <CancelButton onClick={cs.closeDialog} disabled={cs.submitting} t={t} />
                </div>
              </aside>

              <div className="create-save__preview-slot">
                <fieldset disabled={initialPreviewLocked} className="create-save__fieldset-lock create-save__preview-slot-lock">
                <div className="create-save__preview-toolbar">
                  <div className="create-save__preview-tool-block">
                    <div
                      className="create-save__preview-tools"
                      role="toolbar"
                      aria-label={t('map_gen_preview_tools_label')}
                    >
                      {PREVIEW_ANNOTATION_TOOLS.map(({ id, icon: ToolIcon, labelKey }) => (
                        <button
                          key={id}
                          type="button"
                          className={
                            'btn btn--icon create-save__preview-tool-btn' +
                            (annotationTool === id ? ' is-active' : '')
                          }
                          title={t(labelKey)}
                          aria-label={t(labelKey)}
                          aria-pressed={annotationTool === id}
                          disabled={!cs.previewUrl || previewInteractionLocked}
                          onClick={() => setAnnotationTool(id)}
                        >
                          <ToolIcon size={18} stroke={1.75} aria-hidden />
                        </button>
                      ))}
                      <button
                        type="button"
                        className="btn btn--icon create-save__preview-tool-btn create-save__preview-tool-btn--clear"
                        title={t('map_gen_preview_tool_clear')}
                        aria-label={t('map_gen_preview_tool_clear')}
                        disabled={!cs.previewUrl || previewInteractionLocked}
                        onClick={() => previewViewportRef.current?.clearAnnotations()}
                      >
                        <IconTrash size={18} stroke={1.75} aria-hidden />
                      </button>
                    </div>
                    <div
                      className="create-save__preview-colors"
                      role="group"
                      aria-label={t('map_gen_preview_color_label')}
                    >
                      {MAP_PREVIEW_ANNOTATION_COLORS.map((color) => (
                        <button
                          key={color.id}
                          type="button"
                          className={
                            'create-save__preview-color-btn' +
                            (annotationColor === color.value ? ' is-active' : '')
                          }
                          style={{ backgroundColor: color.value }}
                          title={t(`map_gen_preview_color_${color.id}`)}
                          aria-label={t(`map_gen_preview_color_${color.id}`)}
                          aria-pressed={annotationColor === color.value}
                          disabled={!cs.previewUrl || previewInteractionLocked}
                          onClick={() => setAnnotationColor(color.value)}
                        />
                      ))}
                    </div>
                  </div>
                  {annotationTool === 'marker' ? (
                    <label className="create-save__preview-marker-label-field">
                      <p className="create-save__preview-hint create-save__preview-hint--above-field">
                        {t('map_gen_preview_tool_hint_marker')}
                      </p>
                      <input
                        type="text"
                        className="input"
                        maxLength={48}
                        value={markerLabel}
                        placeholder={t('map_gen_preview_marker_label')}
                        disabled={!cs.previewUrl || previewInteractionLocked}
                        onChange={(e) => setMarkerLabel(e.target.value)}
                      />
                    </label>
                  ) : null}
                  {annotationTool !== 'marker' ? (
                    <p className="create-save__preview-hint">
                      {annotationTool === 'pan'
                        ? t('map_gen_preview_controls_hint')
                        : t(`map_gen_preview_tool_hint_${annotationTool}`)}
                    </p>
                  ) : null}
                </div>
                <div className="create-save__preview-viewport-wrap">
                  <div className="create-save__preview-square">
                    <MapPreviewViewport
                      ref={previewViewportRef}
                      onInteractionLockChange={setPreviewInteractionLocked}
                      onFirstPreviewReady={cs.markInitialPreviewReady}
                      onAnnotationsChange={(annotations) =>
                        setPreviewHasAnnotations(hasMapPreviewAnnotations(annotations))
                      }
                      showCenterMarker={showCenterMarker}
                      annotationTool={annotationTool}
                      annotationColor={annotationColor}
                      markerLabel={markerLabel}
                      previewUrl={cs.previewUrl}
                      previewPlanet={previewPlanetId}
                      planetLabel={previewPlanetName}
                      mapSeed={ui.seed}
                      loading={cs.previewLoading}
                      refining={cs.previewRefining}
                      emptyLabel={t('map_gen_preview_empty')}
                      connectingStages={[
                        t('map_gen_preview_satellite_1'),
                        t('map_gen_preview_satellite_2'),
                        t('map_gen_preview_satellite_3'),
                        t('map_gen_preview_satellite_4'),
                        t('map_gen_preview_satellite_5'),
                      ]}
                      refiningLabel={t('map_gen_preview_refining')}
                      crashSiteLabel={t('map_gen_preview_crash_site')}
                    />
                  </div>
                </div>
                <div
                  className="create-save__planet-picker create-save__planet-picker--preview"
                  role="radiogroup"
                  aria-label={t('map_gen_preview_planet')}
                >
                  {planets.map((p) => {
                    const name = label(planetLabelKey(p.id), p.id);
                    const active = ui.previewPlanet === p.previewId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={'create-save__planet-picker-btn' + (active ? ' is-active' : '')}
                        title={name}
                        onClick={() =>
                          cs.setMapGenUi((prev) => ({ ...prev, previewPlanet: p.previewId }))
                        }
                      >
                        <MapGenIcon
                          src={mapGenPlanetIconUrl(p.id)}
                          alt={name}
                          tier="medium"
                          size={28}
                          className="create-save__planet-picker-icon"
                        />
                      </button>
                    );
                  })}
                </div>
                </fieldset>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ModalBackdrop
        open={cs.savePresetDialogOpen}
        onClose={cs.closeSavePresetDialog}
        id="mapGenSavePresetBackdrop"
      >
        <div
          className="fu-modal create-save__preset-save-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mapGenSavePresetTitle"
        >
          <div className="fu-modal__header" id="mapGenSavePresetTitle">
            {t('map_gen_user_preset_save_title')}
          </div>
          <div className="fu-modal__body">
            <label className="modpack-import-dialog__field">
              <span>{t('map_gen_user_preset_name_label')}</span>
              <input
                type="text"
                className="input"
                maxLength={64}
                value={cs.savePresetName}
                placeholder={t('map_gen_user_preset_name_placeholder')}
                onChange={(e) => cs.setSavePresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') cs.confirmSaveUserPreset();
                }}
              />
            </label>
            {cs.savePresetError ? (
              <p className="create-save__preview-error">{cs.savePresetError}</p>
            ) : null}
          </div>
          <div className="fu-modal__footer">
            <CancelButton onClick={cs.closeSavePresetDialog} t={t} />
            <button type="button" className="btn btn--primary" onClick={cs.confirmSaveUserPreset}>
              {t('map_gen_user_preset_save_confirm')}
            </button>
          </div>
        </div>
      </ModalBackdrop>

      <ModalBackdrop
        open={cs.presetImportOpen}
        onClose={cs.closePresetImportDialog}
        id="mapGenPresetImportBackdrop"
      >
        <div
          className="fu-modal modpack-import-dialog create-save__preset-transfer-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mapGenPresetImportTitle"
        >
          <div className="fu-modal__header" id="mapGenPresetImportTitle">
            {t('map_gen_preset_import_dialog_title')}
          </div>
          <div className="fu-modal__body">
            <p className="modpack-import-dialog__desc">{t('map_gen_preset_import_dialog_hint')}</p>
            <ul className="modpack-import-dialog__mods create-save__preset-transfer-list">
              {cs.presetImportCandidates.map((candidate) => {
                const checked = cs.presetImportSelected.includes(candidate.key);
                return (
                  <li key={candidate.key} className={candidate.exists ? 'is-disabled' : undefined}>
                    <label className="modpack-import-dialog__option">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          cs.togglePresetImportSelection(candidate.key, e.target.checked)
                        }
                      />
                      <span>
                        {candidate.name}
                        {candidate.exists ? (
                          <span className="create-save__preset-transfer-note">
                            {' '}
                            ({t('map_gen_preset_import_exists')})
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {cs.presetImportError ? (
              <p className="create-save__preview-error">{cs.presetImportError}</p>
            ) : null}
          </div>
          <div className="fu-modal__footer">
            <CancelButton onClick={cs.closePresetImportDialog} t={t} disabled={cs.presetImportBusy} />
            <button
              type="button"
              className="btn btn--primary"
              disabled={cs.presetImportBusy}
              onClick={() => void cs.confirmPresetImport()}
            >
              {t('map_gen_preset_import_confirm')}
            </button>
          </div>
        </div>
      </ModalBackdrop>

      <ModalBackdrop
        open={cs.presetExportOpen}
        onClose={cs.closePresetExportDialog}
        id="mapGenPresetExportBackdrop"
      >
        <div
          className="fu-modal modpack-import-dialog create-save__preset-transfer-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mapGenPresetExportTitle"
        >
          <div className="fu-modal__header" id="mapGenPresetExportTitle">
            {t('map_gen_preset_export_dialog_title')}
          </div>
          <div className="fu-modal__body">
            <p className="modpack-import-dialog__desc">{t('map_gen_preset_export_dialog_hint')}</p>
            <ul className="modpack-import-dialog__mods create-save__preset-transfer-list">
              {cs.userPresets.map((preset) => {
                const checked = cs.presetExportSelected.includes(preset.id);
                return (
                  <li key={preset.id}>
                    <label className="modpack-import-dialog__option">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          cs.togglePresetExportSelection(preset.id, e.target.checked)
                        }
                      />
                      <span>{preset.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {cs.presetExportError ? (
              <p className="create-save__preview-error">{cs.presetExportError}</p>
            ) : null}
          </div>
          <div className="fu-modal__footer">
            <CancelButton onClick={cs.closePresetExportDialog} t={t} />
            <button type="button" className="btn btn--primary" onClick={cs.confirmPresetExport}>
              {t('map_gen_preset_export_confirm')}
            </button>
          </div>
        </div>
      </ModalBackdrop>
    </div>
  );
}

function PlanetBadge({
  planetId,
  label,
}: {
  planetId: string;
  label: (key: string, fallback: string) => string;
}) {
  const name = label(planetLabelKey(planetId), planetId);
  const icon = mapGenPlanetIconUrl(planetId);
  return (
    <span
      className={'create-save__planet-badge create-save__planet-badge--' + planetId}
      title={name}
    >
      {icon ? (
        <MapGenIcon
          src={icon}
          alt=""
          tier="medium"
          size={28}
          className="create-save__planet-badge-icon"
        />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

function ResourceLabel({
  controlId,
  name,
}: {
  controlId: string;
  name: string;
}) {
  const icon = mapGenResourceIconUrl(controlId);
  return (
    <>
      {icon ? (
        <MapGenIcon src={icon} alt="" tier="medium" size={32} className="create-save__resource-icon" />
      ) : null}
      <span>{name}</span>
    </>
  );
}

function ResourcesTab({
  cs,
  t,
  label,
  spaceAge,
}: {
  cs: CreateSaveApi;
  t: (key: string) => string;
  label: (key: string, fallback: string) => string;
  spaceAge: boolean;
}) {
  const rows = controlRows(spaceAge, 'resource');
  const ui = cs.mapGenUi;

  return (
    <div className="create-save__table-wrap">
      <table className="create-save__gen-table">
        <thead>
          <tr>
            <th className="create-save__th-resource" scope="col" />
            <th className="create-save__th-planet">{t('map_gen_col_appears_on')}</th>
            <th>{t('map_gen_freq')}</th>
            <th>{t('map_gen_size')}</th>
            <th>{t('map_gen_richness')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ planetId, control }) => {
            const ctrl = getControl(ui, planetId, control.id);
            const name = label(controlLabelKey(control.id), control.id);
            return (
              <tr key={`${planetId}-${control.id}`}>
                <td className="create-save__td-resource">
                  <label className="create-save__resource-name">
                    <input
                      type="checkbox"
                      checked={ctrl.enabled}
                      onChange={(e) =>
                        cs.setMapGenUi((p) =>
                          updateControl(p, planetId, control.id, { enabled: e.target.checked }),
                        )
                      }
                    />
                    <ResourceLabel controlId={control.id} name={name} />
                  </label>
                </td>
                <td className="create-save__td-planet">
                  <PlanetBadge planetId={planetId} label={label} />
                </td>
                <td className="create-save__td-slider">
                  <GenSlider
                    compact
                    kind="autoplace"
                    autoplaceField="frequency"
                    label={t('map_gen_freq')}
                    value={ctrl.frequency}
                    disabled={!ctrl.enabled}
                    onChange={(v) =>
                      cs.setMapGenUi((p) => updateControl(p, planetId, control.id, { frequency: v }))
                    }
                  />
                </td>
                <td className="create-save__td-slider">
                  <GenSlider
                    compact
                    kind="autoplace"
                    autoplaceField="size"
                    label={t('map_gen_size')}
                    value={ctrl.size}
                    disabled={!ctrl.enabled}
                    onChange={(v) =>
                      cs.setMapGenUi((p) => updateControl(p, planetId, control.id, { size: v }))
                    }
                  />
                </td>
                <td className="create-save__td-slider">
                  {control.richness ? (
                    <GenSlider
                      compact
                      kind="autoplace"
                      autoplaceField="size"
                      label={t('map_gen_richness')}
                      value={ctrl.richness}
                      disabled={!ctrl.enabled}
                      onChange={(v) =>
                        cs.setMapGenUi((p) => updateControl(p, planetId, control.id, { richness: v }))
                      }
                    />
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AutoplaceTable({
  rows,
  ui,
  cs,
  t,
  label,
  sizeColumnLabel,
  terrainFeature = false,
}: {
  rows: ReturnType<typeof controlRows>;
  ui: MapGenUiState;
  cs: CreateSaveApi;
  t: (key: string) => string;
  label: (key: string, fallback: string) => string;
  sizeColumnLabel: string;
  terrainFeature?: boolean;
}) {
  if (!rows.length) return null;
  return (
    <div className="create-save__table-wrap">
      <table className="create-save__gen-table">
        <thead>
          <tr>
            <th className="create-save__th-resource" scope="col" />
            <th className="create-save__th-planet">{t('map_gen_col_appears_on')}</th>
            <th>{t('map_gen_freq')}</th>
            <th>{sizeColumnLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ planetId, control }) => {
            const ctrl = getControl(ui, planetId, control.id);
            const name = label(controlLabelKey(control.id), control.id);
            return (
              <tr key={`${planetId}-${control.id}`}>
                <td className="create-save__td-resource">
                  <label className="create-save__resource-name">
                    <input
                      type="checkbox"
                      checked={ctrl.enabled}
                      onChange={(e) =>
                        cs.setMapGenUi((p) =>
                          updateControl(p, planetId, control.id, { enabled: e.target.checked }),
                        )
                      }
                    />
                    <span>{name}</span>
                  </label>
                </td>
                <td className="create-save__td-planet">
                  <PlanetBadge planetId={planetId} label={label} />
                </td>
                <td className="create-save__td-slider">
                  <GenSlider
                    compact
                    kind="autoplace"
                    autoplaceField="frequency"
                    terrainFeature={terrainFeature}
                    label={t('map_gen_freq')}
                    value={ctrl.frequency}
                    disabled={!ctrl.enabled}
                    onChange={(v) =>
                      cs.setMapGenUi((p) => updateControl(p, planetId, control.id, { frequency: v }))
                    }
                  />
                </td>
                <td className="create-save__td-slider">
                  <GenSlider
                    compact
                    kind="autoplace"
                    autoplaceField="size"
                    terrainFeature={terrainFeature}
                    label={sizeColumnLabel}
                    value={ctrl.size}
                    disabled={!ctrl.enabled}
                    onChange={(v) =>
                      cs.setMapGenUi((p) => updateControl(p, planetId, control.id, { size: v }))
                    }
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NauvisPropertyTable({
  cs,
  t,
  ui,
}: {
  cs: CreateSaveApi;
  t: (key: string) => string;
  ui: MapGenUiState;
}) {
  const rows = [
    {
      id: 'moisture',
      name: t('map_gen_moisture'),
      scale: ui.moistureScale,
      value: ui.moistureBias,
      onScale: (v: number) => cs.setMapGenUi((p) => ({ ...p, moistureScale: v })),
      onValue: (v: number) => cs.setMapGenUi((p) => ({ ...p, moistureBias: v })),
    },
    {
      id: 'terrain_type',
      name: t('map_gen_terrain_type'),
      scale: ui.auxScale,
      value: ui.auxBias,
      onScale: (v: number) => cs.setMapGenUi((p) => ({ ...p, auxScale: v })),
      onValue: (v: number) => cs.setMapGenUi((p) => ({ ...p, auxBias: v })),
    },
  ];

  return (
    <div className="create-save__table-wrap">
      <table className="create-save__gen-table">
        <thead>
          <tr>
            <th className="create-save__th-resource" scope="col" />
            <th className="create-save__th-planet">{t('map_gen_col_appears_on')}</th>
            <th>{t('map_gen_col_scale')}</th>
            <th>{t('map_gen_col_value')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="create-save__td-resource">
                <span>{row.name}</span>
              </td>
              <td className="create-save__td-planet">
                <PlanetBadge planetId="nauvis" label={(k, fb) => t(k) || fb} />
              </td>
              <td className="create-save__td-slider">
                <GenSlider
                  compact
                  kind="autoplace"
                  autoplaceField="frequency"
                  terrainFeature
                  label={t('map_gen_col_scale')}
                  value={row.scale}
                  onChange={row.onScale}
                />
              </td>
              <td className="create-save__td-slider">
                <GenSlider
                  compact
                  kind="bias"
                  label={t('map_gen_col_value')}
                  value={row.value}
                  onChange={row.onValue}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TerrainTab({
  cs,
  t,
  label,
  spaceAge,
}: {
  cs: CreateSaveApi;
  t: (key: string) => string;
  label: (key: string, fallback: string) => string;
  spaceAge: boolean;
}) {
  const ui = cs.mapGenUi;
  const mapTypeLabelId = useId();
  const featureRows = controlRows(spaceAge, ['terrain', 'special']);
  const cliffRows = controlRows(spaceAge, 'cliff');

  const setMapType = (mapType: MapGenMapType) => {
    cs.setMapGenUi((p) => applyMapTypeToUi(p, mapType));
  };

  return (
    <div className="create-save__gen-sections">
      <section className="create-save__gen-section create-save__map-type-row">
        <div className="modpack-import-dialog__field create-save__map-type-field">
          <span id={mapTypeLabelId}>{t('map_gen_map_type_label')}</span>
          <MapGenAnimatedPicker
            labelledBy={mapTypeLabelId}
            value={ui.mapType}
            options={MAP_GEN_MAP_TYPES.map((id) => ({
              value: id,
              label: t(`map_gen_map_type_${id}`),
            }))}
            onChange={(v) => setMapType(v as MapGenMapType)}
          />
        </div>
      </section>

      {featureRows.length > 0 && (
        <section className="create-save__gen-section create-save__gen-section--divider">
          <AutoplaceTable
            rows={featureRows}
            ui={ui}
            cs={cs}
            t={t}
            label={label}
            sizeColumnLabel={t('map_gen_size')}
            terrainFeature
          />
        </section>
      )}

      {cliffRows.length > 0 && (
        <section className="create-save__gen-section create-save__gen-section--divider">
          <AutoplaceTable
            rows={cliffRows}
            ui={ui}
            cs={cs}
            t={t}
            label={label}
            sizeColumnLabel={t('map_gen_col_continuity')}
            terrainFeature={false}
          />
        </section>
      )}

      <section className="create-save__gen-section create-save__gen-section--divider">
        <NauvisPropertyTable cs={cs} t={t} ui={ui} />
      </section>
    </div>
  );
}

function EnemyTab({
  cs,
  t,
  label,
  spaceAge,
}: {
  cs: CreateSaveApi;
  t: (key: string) => string;
  label: (key: string, fallback: string) => string;
  spaceAge: boolean;
}) {
  const ui = cs.mapGenUi;
  const enemyRows = controlRows(spaceAge, 'enemy');

  return (
    <div className="create-save__gen-sections">
      {enemyRows.length > 0 && (
        <section className="create-save__gen-section">
          <div className="create-save__table-wrap">
            <table className="create-save__gen-table">
              <thead>
                <tr>
                  <th className="create-save__th-resource" scope="col" />
                  <th className="create-save__th-planet">{t('map_gen_col_appears_on')}</th>
                  <th>{t('map_gen_freq')}</th>
                  <th>{t('map_gen_size')}</th>
                </tr>
              </thead>
              <tbody>
                {enemyRows.map(({ planetId, control }) => {
                  const ctrl = getControl(ui, planetId, control.id);
                  const name = label(controlLabelKey(control.id), control.id);
                  return (
                    <tr key={`${planetId}-${control.id}`}>
                      <td className="create-save__td-resource">
                        <label className="create-save__resource-name">
                          <input
                            type="checkbox"
                            checked={ctrl.enabled}
                            onChange={(e) =>
                              cs.setMapGenUi((p) =>
                                updateControl(p, planetId, control.id, { enabled: e.target.checked }),
                              )
                            }
                          />
                          <span>{name}</span>
                        </label>
                      </td>
                      <td className="create-save__td-planet">
                        <PlanetBadge planetId={planetId} label={label} />
                      </td>
                      <td className="create-save__td-slider">
                        <GenSlider
                          compact
                          kind="autoplace"
                          autoplaceField="frequency"
                          label={t('map_gen_freq')}
                          value={ctrl.frequency}
                          disabled={!ctrl.enabled}
                          onChange={(v) =>
                            cs.setMapGenUi((p) => updateControl(p, planetId, control.id, { frequency: v }))
                          }
                        />
                      </td>
                      <td className="create-save__td-slider">
                        <GenSlider
                          compact
                          kind="autoplace"
                          autoplaceField="size"
                          label={t('map_gen_size')}
                          value={ctrl.size}
                          disabled={!ctrl.enabled}
                          onChange={(v) =>
                            cs.setMapGenUi((p) => updateControl(p, planetId, control.id, { size: v }))
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="create-save__gen-section create-save__gen-section--divider">
        <label className="modpack-import-dialog__option">
          <input
            type="checkbox"
            checked={ui.noEnemiesMode}
            onChange={(e) => cs.setMapGenUi((p) => ({ ...p, noEnemiesMode: e.target.checked }))}
          />
          <span>{t('map_gen_no_enemies')}</span>
        </label>
        <label className="modpack-import-dialog__option">
          <input
            type="checkbox"
            checked={ui.peacefulMode}
            onChange={(e) => cs.setMapGenUi((p) => ({ ...p, peacefulMode: e.target.checked }))}
          />
          <span>{t('map_gen_peaceful')}</span>
        </label>
        <GenSlider
          kind="autoplace"
          label={t('map_gen_starting_area')}
          value={ui.startingArea}
          onChange={(v) => cs.setMapGenUi((p) => ({ ...p, startingArea: v }))}
        />
      </section>

      <section className="create-save__gen-section create-save__gen-section--divider">
        <ExpansionSection ui={ui} setUi={cs.setMapGenUi} t={t} />
      </section>

      <section className="create-save__gen-section create-save__gen-section--divider">
        <EvolutionSection ui={ui} setUi={cs.setMapGenUi} t={t} />
      </section>
    </div>
  );
}

function AdvancedTab({
  cs,
  t,
  spaceAge,
}: {
  cs: CreateSaveApi;
  t: (key: string) => string;
  spaceAge: boolean;
}) {
  const ui = cs.mapGenUi;
  return (
    <div className="create-save__gen-sections">
      <section className="create-save__gen-section">
        <h4 className="create-save__gen-section-title">{t('map_gen_section_map')}</h4>
        <div className="create-save__row-2">
          <label className="modpack-import-dialog__field">
            <span>{t('map_gen_map_width')}</span>
            <input
              type="number"
              className="input"
              min={0}
              value={ui.mapWidth || ''}
              placeholder={t('map_gen_unlimited')}
              onChange={(e) =>
                cs.setMapGenUi((p) => ({ ...p, mapWidth: Math.max(0, Number(e.target.value) || 0) }))
              }
            />
          </label>
          <label className="modpack-import-dialog__field">
            <span>{t('map_gen_map_height')}</span>
            <input
              type="number"
              className="input"
              min={0}
              value={ui.mapHeight || ''}
              placeholder={t('map_gen_unlimited')}
              onChange={(e) =>
                cs.setMapGenUi((p) => ({ ...p, mapHeight: Math.max(0, Number(e.target.value) || 0) }))
              }
            />
          </label>
        </div>
      </section>

      <section className="create-save__gen-section create-save__gen-section--divider">
        <h4 className="create-save__gen-section-title">{t('map_gen_section_technology')}</h4>
        <div className="create-save__numeric-row create-save__numeric-row--value-only">
          <span className="create-save__slider-label">{t('map_gen_tech_price_multiplier')}</span>
          <div className="create-save__numeric-input-wrap">
            <input
              type="number"
              className="input create-save__numeric-input"
              min={0.01}
              max={1000}
              step={0.01}
              value={ui.technologyPriceMultiplier}
              onChange={(e) =>
                cs.setMapGenUi((p) => ({
                  ...p,
                  technologyPriceMultiplier: Number(e.target.value) || 1,
                }))
              }
            />
          </div>
        </div>
      </section>

      <section className="create-save__gen-section create-save__gen-section--divider">
        <PollutionSection ui={ui} setUi={cs.setMapGenUi} t={t} />
      </section>

      {spaceAge && (
        <section className="create-save__gen-section create-save__gen-section--divider">
          <h4 className="create-save__gen-section-title">{t('map_gen_section_asteroids')}</h4>
          <GenMapGenPercentSteps
            label={t('map_gen_asteroids_spawning_rate')}
            value={ui.asteroidsSpawningRatePercent}
            variant="asteroid"
            onChange={(v) => cs.setMapGenUi((p) => ({ ...p, asteroidsSpawningRatePercent: v }))}
          />
        </section>
      )}

      <section className="create-save__gen-section create-save__gen-section--divider">
        <h4 className="create-save__gen-section-title">{t('map_gen_section_spoiling')}</h4>
        <GenMapGenPercentSteps
          label={t('map_gen_spoiling_rate')}
          value={ui.spoilingRatePercent}
          variant="autoplace"
          onChange={(v) => cs.setMapGenUi((p) => ({ ...p, spoilingRatePercent: v }))}
        />
      </section>
    </div>
  );
}

function PollutionSection({
  ui,
  setUi,
  t,
}: {
  ui: MapGenUiState;
  setUi: CreateSaveApi['setMapGenUi'];
  t: (key: string) => string;
}) {
  const p = ui.pollution;
  return (
    <>
      <label className="modpack-import-dialog__option">
        <input
          type="checkbox"
          checked={p.enabled}
          onChange={(e) => setUi((s) => ({ ...s, pollution: { ...s.pollution, enabled: e.target.checked } }))}
        />
        <span>{t('map_gen_section_pollution')}</span>
      </label>
      <GenPercentRow
        label={t('map_gen_pollution_absorption')}
        value={p.absorptionModifierPercent}
        spec={POLLUTION_FIELD_SPECS.absorptionModifierPercent}
        disabled={!p.enabled}
        onChange={(v) =>
          setUi((s) => ({ ...s, pollution: { ...s.pollution, absorptionModifierPercent: v } }))
        }
      />
      <GenPercentRow
        label={t('map_gen_pollution_attack_cost')}
        value={p.attackCostModifierPercent}
        spec={POLLUTION_FIELD_SPECS.attackCostModifierPercent}
        disabled={!p.enabled}
        onChange={(v) =>
          setUi((s) => ({ ...s, pollution: { ...s.pollution, attackCostModifierPercent: v } }))
        }
      />
      <GenNumericRow
        label={t('map_gen_pollution_tree_damage')}
        value={p.minPollutionToDamageTrees}
        spec={POLLUTION_FIELD_SPECS.minPollutionToDamageTrees}
        disabled={!p.enabled}
        onChange={(v) =>
          setUi((s) => ({ ...s, pollution: { ...s.pollution, minPollutionToDamageTrees: v } }))
        }
      />
      <GenNumericRow
        label={t('map_gen_pollution_tree_restore')}
        value={p.pollutionAbsorbedPerTree}
        spec={POLLUTION_FIELD_SPECS.pollutionAbsorbedPerTree}
        disabled={!p.enabled}
        onChange={(v) =>
          setUi((s) => ({ ...s, pollution: { ...s.pollution, pollutionAbsorbedPerTree: v } }))
        }
      />
      <GenPercentRow
        label={t('map_gen_pollution_diffusion')}
        value={p.diffusionRatioPercent}
        spec={POLLUTION_FIELD_SPECS.diffusionRatioPercent}
        disabled={!p.enabled}
        onChange={(v) =>
          setUi((s) => ({ ...s, pollution: { ...s.pollution, diffusionRatioPercent: v } }))
        }
      />
    </>
  );
}

function EvolutionSection({
  ui,
  setUi,
  t,
}: {
  ui: MapGenUiState;
  setUi: CreateSaveApi['setMapGenUi'];
  t: (key: string) => string;
}) {
  const ev = ui.enemyEvolution;
  return (
    <>
      <label className="modpack-import-dialog__option">
        <input
          type="checkbox"
          checked={ev.enabled}
          onChange={(e) =>
            setUi((s) => ({ ...s, enemyEvolution: { ...s.enemyEvolution, enabled: e.target.checked } }))
          }
        />
        <span>{t('map_gen_evolution_enabled')}</span>
      </label>
      <GenNumericRow
        label={t('map_gen_evolution_time')}
        value={ev.timeFactor}
        spec={EVOLUTION_FIELD_SPECS.timeFactor}
        disabled={!ev.enabled}
        onChange={(v) => setUi((s) => ({ ...s, enemyEvolution: { ...s.enemyEvolution, timeFactor: v } }))}
      />
      <GenNumericRow
        label={t('map_gen_evolution_destroy')}
        value={ev.destroyFactor}
        spec={EVOLUTION_FIELD_SPECS.destroyFactor}
        disabled={!ev.enabled}
        onChange={(v) => setUi((s) => ({ ...s, enemyEvolution: { ...s.enemyEvolution, destroyFactor: v } }))}
      />
      <GenNumericRow
        label={t('map_gen_evolution_pollution')}
        value={ev.pollutionFactor}
        spec={EVOLUTION_FIELD_SPECS.pollutionFactor}
        disabled={!ev.enabled}
        onChange={(v) =>
          setUi((s) => ({ ...s, enemyEvolution: { ...s.enemyEvolution, pollutionFactor: v } }))
        }
      />
    </>
  );
}

function ExpansionSection({
  ui,
  setUi,
  t,
}: {
  ui: MapGenUiState;
  setUi: CreateSaveApi['setMapGenUi'];
  t: (key: string) => string;
}) {
  const ex = ui.enemyExpansion;
  return (
    <>
      <label className="modpack-import-dialog__option">
        <input
          type="checkbox"
          checked={ex.enabled}
          onChange={(e) =>
            setUi((s) => ({ ...s, enemyExpansion: { ...s.enemyExpansion, enabled: e.target.checked } }))
          }
        />
        <span>{t('map_gen_expansion_enabled')}</span>
      </label>
      <GenNumericRow
        label={t('map_gen_expansion_distance')}
        value={ex.maxExpansionDistance}
        spec={EXPANSION_FIELD_SPECS.maxExpansionDistance}
        disabled={!ex.enabled}
        onChange={(v) =>
          setUi((s) => ({ ...s, enemyExpansion: { ...s.enemyExpansion, maxExpansionDistance: v } }))
        }
      />
      <GenNumericRow
        label={t('map_gen_expansion_group_min')}
        value={ex.settlerGroupMin}
        spec={EXPANSION_FIELD_SPECS.settlerGroupMin}
        disabled={!ex.enabled}
        onChange={(v) =>
          setUi((s) => {
            const groups = normalizeSettlerGroupSizes(v, s.enemyExpansion.settlerGroupMax);
            return { ...s, enemyExpansion: { ...s.enemyExpansion, ...groups } };
          })
        }
      />
      <GenNumericRow
        label={t('map_gen_expansion_group_max')}
        value={ex.settlerGroupMax}
        spec={EXPANSION_FIELD_SPECS.settlerGroupMax}
        disabled={!ex.enabled}
        onChange={(v) =>
          setUi((s) => {
            const groups = normalizeSettlerGroupSizes(s.enemyExpansion.settlerGroupMin, v);
            return { ...s, enemyExpansion: { ...s.enemyExpansion, ...groups } };
          })
        }
      />
      <GenNumericRow
        label={t('map_gen_expansion_cooldown_min')}
        value={ex.minCooldownMinutes}
        spec={EXPANSION_FIELD_SPECS.minCooldownMinutes}
        unit={t('map_gen_minutes_abbr')}
        disabled={!ex.enabled}
        onChange={(v) =>
          setUi((s) => ({ ...s, enemyExpansion: { ...s.enemyExpansion, minCooldownMinutes: v } }))
        }
      />
      <GenNumericRow
        label={t('map_gen_expansion_cooldown_max')}
        value={ex.maxCooldownMinutes}
        spec={EXPANSION_FIELD_SPECS.maxCooldownMinutes}
        unit={t('map_gen_minutes_abbr')}
        disabled={!ex.enabled}
        onChange={(v) =>
          setUi((s) => ({ ...s, enemyExpansion: { ...s.enemyExpansion, maxCooldownMinutes: v } }))
        }
      />
    </>
  );
}
