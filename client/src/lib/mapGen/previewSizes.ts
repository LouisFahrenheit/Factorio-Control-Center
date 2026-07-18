/** Sizes for live preview and PNG download (--map-preview-size). */
export const MAP_PREVIEW_DOWNLOAD_SIZES = [1024, 2048, 4096, 8192, 16384] as const;

export type MapPreviewDownloadSize = (typeof MAP_PREVIEW_DOWNLOAD_SIZES)[number];

export const MAP_PREVIEW_DOWNLOAD_DEFAULT: MapPreviewDownloadSize = 2048;

export function isMapPreviewDownloadSize(n: number): n is MapPreviewDownloadSize {
  return (MAP_PREVIEW_DOWNLOAD_SIZES as readonly number[]).includes(n);
}
