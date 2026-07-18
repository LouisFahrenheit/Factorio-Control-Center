export type MapPreviewAnnotationTool = 'pan' | 'pen' | 'marker' | 'eraser';

export type MapPreviewDrawPoint = { x: number; y: number };

export type MapPreviewStroke = {
  id: string;
  points: MapPreviewDrawPoint[];
  color: string;
};

export type MapPreviewMarker = {
  id: string;
  x: number;
  y: number;
  color: string;
  label?: string;
};

export type MapPreviewAnnotations = {
  strokes: MapPreviewStroke[];
  markers: MapPreviewMarker[];
};

export const MAP_PREVIEW_ANNOTATION_DEFAULT_COLOR = '#ff9959';

export const MAP_PREVIEW_ANNOTATION_COLORS = [
  { id: 'orange', value: '#ff9959' },
  { id: 'red', value: '#ff6b6b' },
  { id: 'green', value: '#6bcf7f' },
  { id: 'blue', value: '#6bb8ff' },
  { id: 'yellow', value: '#ffd166' },
  { id: 'purple', value: '#c084fc' },
  { id: 'cyan', value: '#56d9e8' },
  { id: 'pink', value: '#ff8ecf' },
  { id: 'white', value: '#f2f2f2' },
] as const;

export type MapPreviewAnnotationColorId = (typeof MAP_PREVIEW_ANNOTATION_COLORS)[number]['id'];

export function emptyMapPreviewAnnotations(): MapPreviewAnnotations {
  return { strokes: [], markers: [] };
}

export function normalizeAnnotationColor(color: string | undefined): string {
  const value = String(color || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  return MAP_PREVIEW_ANNOTATION_DEFAULT_COLOR;
}

export function imageContentRect(
  containerW: number,
  containerH: number,
  naturalW: number,
  naturalH: number,
): { x: number; y: number; w: number; h: number } {
  if (containerW <= 0 || containerH <= 0 || naturalW <= 0 || naturalH <= 0) {
    return { x: 0, y: 0, w: containerW, h: containerH };
  }
  const fitScale = Math.min(containerW / naturalW, containerH / naturalH);
  const w = naturalW * fitScale;
  const h = naturalH * fitScale;
  return {
    x: (containerW - w) / 2,
    y: (containerH - h) / 2,
    w,
    h,
  };
}

export function clientToImageNorm(
  clientX: number,
  clientY: number,
  frameEl: HTMLElement,
  pan: { x: number; y: number },
  zoom: number,
  naturalW: number,
  naturalH: number,
): MapPreviewDrawPoint | null {
  const frameRect = frameEl.getBoundingClientRect();
  const frameW = frameEl.clientWidth;
  const frameH = frameEl.clientHeight;
  if (frameW <= 0 || frameH <= 0 || naturalW <= 0 || naturalH <= 0) return null;

  const mx = clientX - frameRect.left;
  const my = clientY - frameRect.top;
  const panLocalX = (mx - frameW / 2 - pan.x) / zoom + frameW / 2;
  const panLocalY = (my - frameH / 2 - pan.y) / zoom + frameH / 2;
  const content = imageContentRect(frameW, frameH, naturalW, naturalH);
  if (content.w <= 0 || content.h <= 0) return null;

  const x = (panLocalX - content.x) / content.w;
  const y = (panLocalY - content.y) / content.h;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

export function distNorm(a: MapPreviewDrawPoint, b: MapPreviewDrawPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function eraseAt(
  annotations: MapPreviewAnnotations,
  point: MapPreviewDrawPoint,
  radius: number,
): MapPreviewAnnotations {
  const strokes = annotations.strokes.filter(
    (stroke) => !stroke.points.some((p) => distNorm(p, point) <= radius),
  );
  const markers = annotations.markers.filter((m) => distNorm(m, point) <= radius);
  if (strokes.length === annotations.strokes.length && markers.length === annotations.markers.length) {
    return annotations;
  }
  return { strokes, markers };
}

export function strokePolylinePoints(stroke: MapPreviewStroke): string {
  return stroke.points.map((p) => `${p.x * 100},${p.y * 100}`).join(' ');
}

export function hasMapPreviewAnnotations(annotations: MapPreviewAnnotations): boolean {
  return annotations.strokes.length > 0 || annotations.markers.length > 0;
}

/** Same as `<IconMapPin size={22} stroke={1.75} />` in MapPreviewViewport. */
export const MAP_PREVIEW_MARKER_ICON_SIZE = 22;
export const MAP_PREVIEW_MARKER_STROKE_WIDTH = 1.75;

/** Tabler outline map-pin paths (`@tabler/icons`). */
const MAP_PREVIEW_MARKER_SVG_PATHS = [
  'M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0',
  'M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0',
] as const;

export type MapPreviewAnnotationDrawOptions = {
  markerIconPx?: number;
};

export function mapPreviewMarkerIconExportPx(
  exportImageWidth: number,
  overlayContentWidthPx: number,
): number {
  if (exportImageWidth <= 0 || overlayContentWidthPx <= 0) {
    return MAP_PREVIEW_MARKER_ICON_SIZE;
  }
  return Math.max(
    12,
    (MAP_PREVIEW_MARKER_ICON_SIZE * exportImageWidth) / overlayContentWidthPx,
  );
}

function buildMapPreviewMarkerSvg(iconSize: number, color: string): string {
  const strokeWidth = (MAP_PREVIEW_MARKER_STROKE_WIDTH * 24) / iconSize;
  const paths = MAP_PREVIEW_MARKER_SVG_PATHS.map((d) => `<path d="${d}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

const markerIconCache = new Map<string, Promise<HTMLImageElement>>();

function loadMapPreviewMarkerIcon(iconSize: number, color: string): Promise<HTMLImageElement> {
  const cacheKey = `${iconSize}|${color}`;
  const cached = markerIconCache.get(cacheKey);
  if (cached) return cached;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('preview_marker_icon_load_failed'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      buildMapPreviewMarkerSvg(iconSize, color),
    )}`;
  });
  markerIconCache.set(cacheKey, promise);
  return promise;
}

function annotationStrokeWidthPx(imageSize: number): number {
  return Math.max(1.5, imageSize * 0.0016);
}

function drawAnnotationStroke(
  ctx: CanvasRenderingContext2D,
  stroke: MapPreviewStroke,
  w: number,
  h: number,
  lineWidth: number,
): void {
  if (stroke.points.length === 0) return;

  ctx.save();
  ctx.strokeStyle = normalizeAnnotationColor(stroke.color);
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = Math.max(1, lineWidth * 0.6);

  if (stroke.points.length === 1) {
    const p = stroke.points[0];
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, lineWidth * 0.45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  stroke.points.forEach((p, index) => {
    const x = p.x * w;
    const y = p.y * h;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.restore();
}

function drawMarkerLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  iconSize: number,
): void {
  const label = text.trim();
  if (!label) return;

  const fontSize = Math.max(11, Math.round(iconSize * 0.42));
  ctx.save();
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  const metrics = ctx.measureText(label);
  const padX = Math.max(6, fontSize * 0.35);
  const padY = Math.max(4, fontSize * 0.2);
  const boxW = metrics.width + padX * 2;
  const boxH = fontSize + padY * 2;
  const boxX = x - boxW / 2;
  const boxY = y - iconSize - boxH - Math.max(4, iconSize * 0.12);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = Math.max(1, fontSize * 0.08);
  const radius = Math.max(4, fontSize * 0.25);
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, radius);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.fillText(label, x, boxY + boxH - padY);
  ctx.restore();
}

function drawAnnotationMarker(
  ctx: CanvasRenderingContext2D,
  marker: MapPreviewMarker,
  w: number,
  h: number,
  pinImg: HTMLImageElement,
  iconSize: number,
): void {
  const tipX = marker.x * w;
  const tipY = marker.y * h;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = Math.max(1, iconSize * 0.09);
  ctx.shadowOffsetY = Math.max(1, iconSize * 0.045);
  ctx.drawImage(pinImg, tipX - iconSize / 2, tipY - iconSize, iconSize, iconSize);
  ctx.restore();

  if (marker.label) {
    drawMarkerLabel(ctx, marker.label, tipX, tipY, iconSize);
  }
}

export async function drawMapPreviewAnnotationsOnCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  annotations: MapPreviewAnnotations,
  options: MapPreviewAnnotationDrawOptions = {},
): Promise<void> {
  if (!hasMapPreviewAnnotations(annotations)) return;

  const imageSize = Math.min(w, h);
  const lineWidth = annotationStrokeWidthPx(imageSize);

  for (const stroke of annotations.strokes) {
    drawAnnotationStroke(ctx, stroke, w, h, lineWidth);
  }

  if (annotations.markers.length === 0) return;

  const iconSize =
    options.markerIconPx ??
    mapPreviewMarkerIconExportPx(w, Math.max(1, Math.round(w * 0.2)));

  const markerColors = [...new Set(annotations.markers.map((m) => normalizeAnnotationColor(m.color)))];
  const pinImages = new Map<string, HTMLImageElement>();
  await Promise.all(
    markerColors.map(async (color) => {
      pinImages.set(color, await loadMapPreviewMarkerIcon(iconSize, color));
    }),
  );

  for (const marker of annotations.markers) {
    const color = normalizeAnnotationColor(marker.color);
    const pinImg = pinImages.get(color);
    if (!pinImg) continue;
    drawAnnotationMarker(ctx, marker, w, h, pinImg, iconSize);
  }
}
