import { describe, expect, it } from 'vitest';
import {
  parseFactorioColor,
  getFactorioFontStyle,
  stripFactorioRichText,
  renderFactorioRichText,
} from './factorioRichText';

describe('factorioRichText', () => {
  describe('parseFactorioColor', () => {
    it('parses named colors', () => {
      expect(parseFactorioColor('red')).toBe('#ff5959');
      expect(parseFactorioColor('cyan')).toBe('#4deeea');
      expect(parseFactorioColor('default')).toBe('inherit');
    });

    it('parses hex colors', () => {
      expect(parseFactorioColor('#123456')).toBe('#123456');
      expect(parseFactorioColor('abcdef')).toBe('#abcdef');
    });

    it('parses RGB 0-255 numbers', () => {
      expect(parseFactorioColor('128,206,240')).toBe('rgb(128, 206, 240)');
      expect(parseFactorioColor('255, 0, 128, 200')).toBe('rgba(255, 0, 128, 0.7843137254901961)');
    });

    it('parses RGB 0-1 floats', () => {
      expect(parseFactorioColor('0.5, 1, 0')).toBe('rgb(128, 255, 0)');
    });

    it('returns null on invalid input', () => {
      expect(parseFactorioColor('')).toBeNull();
      expect(parseFactorioColor('invalid_color_foo')).toBeNull();
    });
  });

  describe('getFactorioFontStyle', () => {
    it('maps semibold and bold fonts', () => {
      expect(getFactorioFontStyle('default-semibold')).toEqual({ fontWeight: 600 });
      expect(getFactorioFontStyle('default-bold')).toEqual({ fontWeight: 700 });
    });

    it('maps mono/code and italic', () => {
      expect(getFactorioFontStyle('default-mono')).toMatchObject({
        fontFamily: 'var(--font-mono, monospace)',
      });
      expect(getFactorioFontStyle('default-italic')).toEqual({ fontStyle: 'italic' });
    });
  });

  describe('stripFactorioRichText', () => {
    it('strips font and color tags', () => {
      const raw =
        'Отключить везде [font=default-semibold][color=128,206,240]Ctrl+щелчок+протягивание[/color][/font]';
      expect(stripFactorioRichText(raw)).toBe(
        'Отключить везде Ctrl+щелчок+протягивание',
      );
    });

    it('strips item and icon tags', () => {
      const raw = 'Produce [item=iron-plate] iron plates';
      expect(stripFactorioRichText(raw)).toBe('Produce Iron plate iron plates');
    });

    it('strips item tags with custom label', () => {
      const raw = 'Produce [item=iron-plate|Железная плита] iron plates';
      expect(stripFactorioRichText(raw)).toBe('Produce Железная плита iron plates');
    });

    it('interpolates and humanizes __ITEM__ tags', () => {
      const raw = 'Быстрее создавать __ITEM__motor__';
      expect(stripFactorioRichText(raw)).toBe('Быстрее создавать Motor');
    });

    it('handles clean text without tags unchanged', () => {
      expect(stripFactorioRichText('Hello world')).toBe('Hello world');
    });

    it('normalizes literal \\n to actual newlines', () => {
      expect(stripFactorioRichText('First line\\nSecond line')).toBe('First line\nSecond line');
    });
  });

  describe('renderFactorioRichText', () => {
    it('returns plain string when no tags present and no newlines', () => {
      expect(renderFactorioRichText('Regular setting title')).toBe('Regular setting title');
    });

    it('renders text with color and font spans', () => {
      const raw =
        'Prefix [font=default-semibold][color=128,206,240]Middle[/color][/font] Suffix';
      const rendered = renderFactorioRichText(raw);
      expect(Array.isArray(rendered)).toBe(true);
      expect((rendered as unknown[]).length).toBe(3);
    });

    it('converts literal \\n into line break elements when no tags present', () => {
      const rendered = renderFactorioRichText('Line 1\\nLine 2');
      expect(Array.isArray(rendered)).toBe(true);
      const arr = rendered as unknown[];
      expect(arr.length).toBe(3);
      expect(arr[0]).toBe('Line 1');
      expect(arr[2]).toBe('Line 2');
    });

    it('converts newlines into line breaks alongside tags', () => {
      const raw = 'Header\\n[font=default-semibold]Subheader[/font]\\n[item=iron-plate]';
      const rendered = renderFactorioRichText(raw);
      expect(Array.isArray(rendered)).toBe(true);
    });

    it('renders tile tags as readable tile text badges', () => {
      const raw = 'Enable on [tile=oil-ocean-shallow]';
      const rendered = renderFactorioRichText(raw);
      expect(Array.isArray(rendered)).toBe(true);
      const arr = rendered as unknown[];
      expect(arr.length).toBe(2);
    });
  });
});
