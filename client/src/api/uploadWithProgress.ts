import { getToken } from './client';

export interface UploadProgressInfo {
  loaded: number;
  total: number;
  percent: number; // 0 to 100
  speed: number;   // bytes per second
  remainingSeconds: number | null;
  isServerProcessing: boolean;
  filename?: string;
}

export interface UploadHttpError extends Error {
  data?: unknown;
  status?: number;
}

export interface UploadRequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  omitBearer?: boolean;
  onProgress?: (progress: UploadProgressInfo) => void;
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));
  return `${val} ${sizes[i] || 'B'}`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '0 B/s';
  return `${formatBytes(bytesPerSec, 1)}/s`;
}

export function formatEta(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

/**
 * Uploads FormData via XMLHttpRequest with real-time byte progress, smoothed speed tracking,
 * estimated time remaining (ETA), and server-processing detection.
 */
export function uploadWithProgress<T = unknown>(
  url: string,
  formData: FormData,
  options: UploadRequestOptions = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const startTime = performance.now();
    let lastTime = startTime;
    let lastLoaded = 0;
    let smoothedSpeed = 0;

    // Handle abort signal
    if (options.signal) {
      if (options.signal.aborted) {
        return reject(new DOMException('Upload aborted', 'AbortError'));
      }
      options.signal.addEventListener('abort', () => {
        xhr.abort();
        reject(new DOMException('Upload aborted', 'AbortError'));
      });
    }

    xhr.open('POST', url, true);

    // Set authorization header
    const token = getToken();
    if (token && !options.omitBearer) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    // Set language header
    const lang = localStorage.getItem('fcc_lang') || '';
    if (lang) {
      xhr.setRequestHeader('X-FCC-UI-Lang', lang);
    }

    // Set custom headers
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        xhr.setRequestHeader(key, value);
      }
    }

    // Track upload progress
    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;

      const now = performance.now();
      const timeDelta = (now - lastTime) / 1000;

      // Update speed estimation periodically (every ~150ms)
      if (timeDelta >= 0.15) {
        const bytesDelta = evt.loaded - lastLoaded;
        const instantSpeed = bytesDelta / timeDelta;
        smoothedSpeed = smoothedSpeed === 0 ? instantSpeed : smoothedSpeed * 0.65 + instantSpeed * 0.35;
        lastTime = now;
        lastLoaded = evt.loaded;
      }

      const percent = Math.min(100, Math.round((evt.loaded / Math.max(1, evt.total)) * 100));
      const remainingBytes = Math.max(0, evt.total - evt.loaded);
      const remainingSeconds = smoothedSpeed > 0 ? remainingBytes / smoothedSpeed : null;
      const isServerProcessing = evt.loaded >= evt.total;

      options.onProgress?.({
        loaded: evt.loaded,
        total: evt.total,
        percent,
        speed: smoothedSpeed,
        remainingSeconds,
        isServerProcessing,
      });
    };

    xhr.onload = () => {
      // When upload reaches 100% and response arrives
      const status = xhr.status;
      const responseText = xhr.responseText;
      let data: unknown = null;

      try {
        data = JSON.parse(responseText);
      } catch {
        // Non-JSON response
      }

      if (status >= 200 && status < 300) {
        // Success
        resolve(data != null ? (data as T) : (responseText as unknown as T));
      } else {
        // HTTP Error
        const dataObj = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
        const errMsg =
          dataObj?.error ||
          dataObj?.message ||
          dataObj?.detail ||
          (typeof data === 'string' ? data : '') ||
          `HTTP ${status}`;
        const err = new Error(Array.isArray(errMsg) ? String(errMsg[0]) : String(errMsg)) as UploadHttpError;
        err.data = data;
        err.status = status;
        reject(err);
      }
    };

    xhr.onerror = () => {
      reject(new Error('web_error_failed_fetch'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Upload request timed out'));
    };

    xhr.onabort = () => {
      reject(new DOMException('Upload aborted', 'AbortError'));
    };

    xhr.send(formData);
  });
}
