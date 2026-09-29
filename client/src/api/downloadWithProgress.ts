import type { UploadProgressInfo } from './uploadWithProgress';

export type { UploadProgressInfo };

export interface DownloadWithProgressOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  onProgress?: (info: UploadProgressInfo) => void;
  defaultFilename?: string;
}

export async function downloadWithProgress(
  url: string,
  options: DownloadWithProgressOptions = {},
): Promise<{ filename: string; blob: Blob; cancelled: boolean }> {
  const { headers = {}, signal, onProgress, defaultFilename = 'download' } = options;

  onProgress?.({
    loaded: 0,
    total: 0,
    percent: 0,
    speed: 0,
    remainingSeconds: null,
    isServerProcessing: true,
    filename: defaultFilename,
  });

  const response = await fetch(url, { headers, signal });
  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    try {
      const text = await response.text();
      try {
        const json = JSON.parse(text);
        if (json?.error || json?.message) {
          errMsg = String(json.error || json.message);
        } else if (text) {
          errMsg = text;
        }
      } catch {
        if (text) errMsg = text;
      }
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }

  // Parse filename from Content-Disposition if present
  let filename = defaultFilename;
  const cd = response.headers.get('Content-Disposition') || '';
  if (cd) {
    const fnMatch = /filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i.exec(cd);
    if (fnMatch && fnMatch[1]) {
      try {
        filename = decodeURIComponent(fnMatch[1]);
      } catch {
        filename = fnMatch[1];
      }
    }
  }

  const contentLengthHeader = response.headers.get('Content-Length');
  const total = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;

  // Headers received, server archive is ready; streaming starts now
  onProgress?.({
    loaded: 0,
    total,
    percent: 0,
    speed: 0,
    remainingSeconds: null,
    isServerProcessing: false,
    filename,
  });

  if (!response.body) {
    const blob = await response.blob();
    return { filename, blob, cancelled: false };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  const startTime = Date.now();
  let lastUpdateTime = startTime;
  let lastLoaded = 0;
  let smoothedSpeed = 0;
  const ALPHA = 0.25;

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        return { filename, blob: new Blob([]), cancelled: true };
      }

      const { done, value } = await reader.read();
      if (done) break;

      if (value) {
        chunks.push(value);
        loaded += value.length;
      }

      const now = Date.now();
      const elapsedSinceLast = (now - lastUpdateTime) / 1000;

      if (elapsedSinceLast >= 0.1 || (total > 0 && loaded >= total)) {
        const instantSpeed = elapsedSinceLast > 0 ? (loaded - lastLoaded) / elapsedSinceLast : 0;
        smoothedSpeed =
          smoothedSpeed === 0 ? instantSpeed : ALPHA * instantSpeed + (1 - ALPHA) * smoothedSpeed;
        lastUpdateTime = now;
        lastLoaded = loaded;

        let remainingSeconds: number | null = null;
        if (total > 0 && smoothedSpeed > 0) {
          remainingSeconds = Math.max(0, Math.round((total - loaded) / smoothedSpeed));
        }

        const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;

        onProgress?.({
          loaded,
          total,
          percent,
          speed: smoothedSpeed,
          remainingSeconds,
          isServerProcessing: false,
        });
      }
    }
  } catch (err) {
    if (signal?.aborted) {
      return { filename, blob: new Blob([]), cancelled: true };
    }
    throw err;
  }

  if (total > 0) {
    onProgress?.({
      loaded,
      total,
      percent: 100,
      speed: smoothedSpeed,
      remainingSeconds: 0,
      isServerProcessing: false,
    });
  }

  const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
  const blob = new Blob(chunks as unknown as BlobPart[], { type: contentType });

  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

  return { filename, blob, cancelled: false };
}
