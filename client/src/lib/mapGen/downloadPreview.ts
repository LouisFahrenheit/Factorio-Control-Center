import {
  drawMapPreviewAnnotationsOnCanvas,
  type MapPreviewAnnotationDrawOptions,
  type MapPreviewAnnotations,
} from './previewAnnotations';

export function downloadPngBase64(b64: string, filename: string): void {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadPngDataUrl(dataUrl: string, filename: string): void {
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  downloadPngBase64(b64, filename);
}

export function mapPreviewFilename(
  planet: string,
  seed: number | undefined,
  sizePx: number,
  annotated = false,
): string {
  const planetSafe = String(planet || 'nauvis').replace(/[^\w-]+/g, '_');
  const seedPart =
    seed != null && Number.isFinite(seed) ? String(Math.floor(seed)) : 'random';
  const suffix = annotated ? '-marked' : '';
  return `fcc-map-preview-${planetSafe}-${seedPart}-${sizePx}px${suffix}.png`;
}

function loadPngBase64Image(b64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('preview_image_load_failed'));
    img.src = `data:image/png;base64,${b64}`;
  });
}

export async function compositeAnnotatedMapPreviewBase64(
  b64: string,
  annotations: MapPreviewAnnotations,
  drawOptions: MapPreviewAnnotationDrawOptions = {},
): Promise<string> {
  const img = await loadPngBase64Image(b64);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('preview_canvas_failed');

  ctx.drawImage(img, 0, 0);
  await drawMapPreviewAnnotationsOnCanvas(ctx, w, h, annotations, drawOptions);

  const dataUrl = canvas.toDataURL('image/png');
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}
