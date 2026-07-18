export const LOG_HISTORY_TAIL_LINES = 25000;

export type LogHistoryApiResponse = {
  ok?: boolean;
  error?: string;
  lines?: string[];
  instance_log_disabled?: boolean;
  program_log_disabled?: boolean;
  file_missing?: boolean;
  truncated?: boolean;
  line_capped?: boolean;
  full_loaded?: boolean;
  file_bytes?: number;
};

export function logHistoryCanLoadFull(j: LogHistoryApiResponse): boolean {
  if (j.instance_log_disabled || j.program_log_disabled) return false;
  if (j.file_missing) return false;
  if (j.full_loaded) return false;
  return !!(j.truncated || j.line_capped);
}

export function logHistoryFileSizeMb(bytes: number): string {
  return (Math.max(0, bytes) / (1024 * 1024)).toFixed(1);
}

export function parseLogFileTooLargeError(err: unknown): number | null {
  const raw = err instanceof Error ? err.message : String(err);
  const m = /^log_file_too_large:(\d+)$/.exec(String(raw || '').trim());
  if (!m) return null;
  return parseInt(m[1], 10) || 0;
}
