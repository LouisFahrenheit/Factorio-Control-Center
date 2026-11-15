import { describe, it, expect } from 'vitest';
import {
  annotationSvgStrokeWidth,
  clientToFrameLocal,
  clientToImageNorm,
  frameCssScale,
  MAP_PREVIEW_STROKE_WIDTH_DEFAULT,
  MAP_PREVIEW_STROKE_WIDTH_MAX,
  MAP_PREVIEW_STROKE_WIDTH_MIN,
  normalizeAnnotationStrokeWidth,
} from './previewAnnotations';

function createMockFrameElement(options: {
  clientWidth: number;
  clientHeight: number;
  rectLeft: number;
  rectTop: number;
  uiScale: number;
}): HTMLElement {
  const { clientWidth, clientHeight, rectLeft, rectTop, uiScale } = options;
  return {
    clientWidth,
    clientHeight,
    getBoundingClientRect: () => ({
      left: rectLeft,
      top: rectTop,
      width: clientWidth * uiScale,
      height: clientHeight * uiScale,
      right: rectLeft + clientWidth * uiScale,
      bottom: rectTop + clientHeight * uiScale,
      x: rectLeft,
      y: rectTop,
      toJSON: () => ({}),
    }),
  } as unknown as HTMLElement;
}

describe('previewAnnotations coordinate mapping across UI scales', () => {
  it('computes inverse CSS zoom scale for frame', () => {
    const frame = createMockFrameElement({
      clientWidth: 400,
      clientHeight: 400,
      rectLeft: 100,
      rectTop: 50,
      uiScale: 1.25,
    });
    const { scaleX, scaleY } = frameCssScale(frame);
    expect(scaleX).toBeCloseTo(0.8, 6);
    expect(scaleY).toBeCloseTo(0.8, 6);
  });

  it('maps pointer at visual center of frame to (0.5, 0.5) at any UI scale', () => {
    for (const uiScale of [1, 1.25, 1.5, 1.75, 2]) {
      const frame = createMockFrameElement({
        clientWidth: 400,
        clientHeight: 400,
        rectLeft: 120,
        rectTop: 80,
        uiScale,
      });
      const visualCenterX = 120 + (400 * uiScale) / 2;
      const visualCenterY = 80 + (400 * uiScale) / 2;

      const point = clientToImageNorm(
        visualCenterX,
        visualCenterY,
        frame,
        { x: 0, y: 0 },
        1.65,
        1024,
        1024,
      );

      expect(point).not.toBeNull();
      expect(point?.x).toBeCloseTo(0.5, 6);
      expect(point?.y).toBeCloseTo(0.5, 6);
    }
  });

  it('maps arbitrary pointer coordinates accurately under UI scale and pan/zoom', () => {
    const clientWidth = 500;
    const clientHeight = 500;
    const zoom = 2;
    const pan = { x: 30, y: -20 };
    const targetNorm = { x: 0.72, y: 0.34 };

    // Local coordinates inside frame (before CSS zoom) where targetNorm is rendered
    const localX =
      (targetNorm.x * clientWidth - clientWidth / 2) * zoom +
      clientWidth / 2 +
      pan.x;
    const localY =
      (targetNorm.y * clientHeight - clientHeight / 2) * zoom +
      clientHeight / 2 +
      pan.y;

    for (const uiScale of [1, 1.25, 1.5, 1.75, 2]) {
      const rectLeft = 200;
      const rectTop = 150;
      const frame = createMockFrameElement({
        clientWidth,
        clientHeight,
        rectLeft,
        rectTop,
        uiScale,
      });

      const clientX = rectLeft + localX * uiScale;
      const clientY = rectTop + localY * uiScale;

      const local = clientToFrameLocal(clientX, clientY, frame);
      expect(local.mx).toBeCloseTo(localX, 6);
      expect(local.my).toBeCloseTo(localY, 6);

      const point = clientToImageNorm(
        clientX,
        clientY,
        frame,
        pan,
        zoom,
        1024,
        1024,
      );
      expect(point).not.toBeNull();
      expect(point?.x).toBeCloseTo(targetNorm.x, 6);
      expect(point?.y).toBeCloseTo(targetNorm.y, 6);
    }
  });

  it('clamps and normalizes annotation stroke width and computes SVG stroke width', () => {
    expect(normalizeAnnotationStrokeWidth(undefined)).toBe(
      MAP_PREVIEW_STROKE_WIDTH_DEFAULT,
    );
    expect(normalizeAnnotationStrokeWidth(0)).toBe(
      MAP_PREVIEW_STROKE_WIDTH_MIN,
    );
    expect(normalizeAnnotationStrokeWidth(99)).toBe(
      MAP_PREVIEW_STROKE_WIDTH_MAX,
    );
    expect(normalizeAnnotationStrokeWidth(4.4)).toBe(4);

    expect(
      annotationSvgStrokeWidth(MAP_PREVIEW_STROKE_WIDTH_DEFAULT),
    ).toBeCloseTo(0.55, 6);
    expect(
      annotationSvgStrokeWidth(MAP_PREVIEW_STROKE_WIDTH_DEFAULT * 2),
    ).toBeCloseTo(1.1, 6);
  });
});
