import { describe, expect, it } from 'vitest';
import {
  applyMapTypeToUi,
  applyPresetToUi,
  buildMapGenSettingsFromUi,
  buildMapSettingsFromUi,
  defaultMapGenUiState,
  mapGenSettingsToUi,
  mapSettingsDifferFromDefault,
} from './buildSettings';
import {
  autoplaceFieldPercent,
  biasSliderToValue,
  biasValueToSlider,
  invertAutoplaceSliderIndex,
  MAP_GEN_SLIDER_MAX,
  MAP_GEN_SLIDER_NORMAL,
  multiplierToSlider,
  percentToAsteroidSliderIndex,
  propertyFrequencyToScaleSlider,
  sizeNameToSlider,
  sliderToAutoplaceValue,
} from './sliderScale';

describe('mapGen sliderScale & buildSettings', () => {
  describe('sliderScale conversions', () => {
    it('maps slider indices to Factorio named tiers and multipliers', () => {
      expect(sliderToAutoplaceValue(0)).toBe('none');
      expect(sliderToAutoplaceValue(1)).toBeCloseTo(0.1667, 4);
      expect(sliderToAutoplaceValue(3)).toBe('very-low');
      expect(sliderToAutoplaceValue(MAP_GEN_SLIDER_NORMAL)).toBe('normal');
      expect(sliderToAutoplaceValue(8)).toBe('very-high');
      expect(sliderToAutoplaceValue(MAP_GEN_SLIDER_MAX)).toBe(6);

      expect(sizeNameToSlider('very-good')).toBe(8);
      expect(sizeNameToSlider('small')).toBe(4);
      expect(multiplierToSlider(0)).toBe(0);
      expect(multiplierToSlider(6)).toBe(10);
    });

    it('inverts terrain frequency display percentage while keeping size direct', () => {
      // Index 10 (mult 6): resource frequency = 600%, terrain scale display = round(100 / 6) = 17%
      expect(autoplaceFieldPercent(10, 'frequency')).toBe(600);
      expect(
        autoplaceFieldPercent(10, 'frequency', { terrainFeature: true }),
      ).toBe(17);
      expect(autoplaceFieldPercent(10, 'size', { terrainFeature: true })).toBe(
        600,
      );
      expect(invertAutoplaceSliderIndex(1)).toBe(10);
      expect(invertAutoplaceSliderIndex(10)).toBe(1);
    });

    it('roundtrips climate bias, property frequency, and 10% asteroid minimum', () => {
      expect(biasSliderToValue(0)).toBe(-0.5);
      expect(biasSliderToValue(10)).toBe(0);
      expect(biasSliderToValue(20)).toBe(0.5);
      expect(biasValueToSlider('-0.25')).toBe(5);
      expect(biasValueToSlider('0.50')).toBe(20);

      expect(propertyFrequencyToScaleSlider('0.5')).toBe(8); // 1 / 0.5 = 2 -> slider 8
      expect(percentToAsteroidSliderIndex(10)).toBe(1);
      expect(percentToAsteroidSliderIndex(600)).toBe(10);
    });
  });

  describe('buildMapGenSettingsFromUi & mapGenSettingsToUi roundtrip', () => {
    it('builds default vanilla settings without Space Age planets or asteroids', () => {
      const ui = defaultMapGenUiState(false);
      expect(Object.keys(ui.planets)).toEqual(['nauvis']);
      expect(mapSettingsDifferFromDefault(ui, false)).toBe(false);

      const gen = buildMapGenSettingsFromUi(ui, false);
      const controls = gen.autoplace_controls as Record<string, unknown>;
      expect(gen.seed).toBeNull();
      expect(gen.width).toBeUndefined();
      expect(controls['iron-ore']).toEqual({
        frequency: 'normal',
        size: 'normal',
        richness: 'normal',
      });
      expect(controls['tungsten-ore']).toBeUndefined();

      const mapSettings = buildMapSettingsFromUi(ui, false);
      expect(mapSettings.asteroids).toBeUndefined();
    });

    it('includes Space Age planets and asteroid spawning rate when Space Age is enabled', () => {
      const ui = defaultMapGenUiState(true);
      expect(Object.keys(ui.planets).length).toBeGreaterThan(1);
      ui.asteroidsSpawningRatePercent = 10;

      const mapSettings = buildMapSettingsFromUi(ui, true);
      expect(mapSettings.asteroids).toEqual({ spawning_rate: 0.1 });
      expect(mapSettingsDifferFromDefault(ui, true)).toBe(true);

      const restored = mapGenSettingsToUi(
        buildMapGenSettingsFromUi(ui, true),
        mapSettings,
        true,
      );
      expect(restored.asteroidsSpawningRatePercent).toBe(10);
    });

    it('roundtrips custom seed, chunk dimensions, island expressions, disabled controls, and enemy settings', () => {
      let ui = defaultMapGenUiState(false);
      ui.seed = '123456789';
      ui.mapWidth = 50;
      ui.mapHeight = 40;
      ui.peacefulMode = true;
      ui.moistureScale = 8;
      ui.moistureBias = 14; // +0.20
      ui = applyMapTypeToUi(ui, 'island');
      ui.planets.nauvis['iron-ore'] = {
        enabled: false,
        frequency: 5,
        size: 5,
        richness: 5,
      };
      // When min > max, normalizeSettlerGroupSizes clamps min down to max
      ui.enemyExpansion.settlerGroupMin = 18;
      ui.enemyExpansion.settlerGroupMax = 6;
      ui.technologyPriceMultiplier = 4;

      const gen = buildMapGenSettingsFromUi(ui, false);
      const settings = buildMapSettingsFromUi(ui, false);
      const controls = gen.autoplace_controls as Record<string, unknown>;
      const exprs = gen.property_expression_names as Record<string, string>;

      expect(gen.seed).toBe(123456789);
      expect(gen.width).toBe(50 * 32);
      expect(gen.height).toBe(40 * 32);
      expect(gen.cliff_settings).toEqual({ cliff_smoothing: 1 });
      expect(exprs.elevation).toBe('elevation_island');
      expect(controls['iron-ore']).toEqual({
        frequency: 'none',
        size: 'none',
        richness: 'none',
      });
      expect(settings.enemy_expansion).toMatchObject({
        settler_group_min_size: 6,
        settler_group_max_size: 6,
      });

      const roundtripped = mapGenSettingsToUi(gen, settings, false);
      expect(roundtripped.seed).toBe('123456789');
      expect(roundtripped.mapWidth).toBe(50);
      expect(roundtripped.mapHeight).toBe(40);
      expect(roundtripped.peacefulMode).toBe(true);
      expect(roundtripped.mapType).toBe('island');
      expect(roundtripped.moistureScale).toBe(8);
      expect(roundtripped.moistureBias).toBe(14);
      expect(roundtripped.planets.nauvis['iron-ore'].enabled).toBe(false);
      expect(roundtripped.technologyPriceMultiplier).toBe(4);
      expect(roundtripped.enemyExpansion.settlerGroupMin).toBe(6);
      expect(roundtripped.enemyExpansion.settlerGroupMax).toBe(6);
    });

    it('treats sentinel >= 2,000,000 map dimensions as unlimited (0 chunks) and preserves seed on preset reset', () => {
      const ui = mapGenSettingsToUi({
        width: 2_000_000,
        height: 2_000_000,
        seed: 777,
      });
      expect(ui.mapWidth).toBe(0);
      expect(ui.mapHeight).toBe(0);

      const reset = applyPresetToUi({ ...ui, peacefulMode: true }, 'default');
      expect(reset.seed).toBe('777');
      expect(reset.peacefulMode).toBe(false);
    });
  });
});
