/** Terminal width for centering startup banner (fallback when not a TTY). */
export function terminalColumns(): number {
  const cols = process.stdout?.columns;
  return Number.isFinite(cols) && cols > 0 ? cols : 80;
}

export function centerLine(line: string, width = terminalColumns()): string {
  const text = String(line ?? '');
  const w = Math.max(1, width);
  if (text.length >= w) return text;
  const pad = Math.floor((w - text.length) / 2);
  return ' '.repeat(pad) + text;
}

export function centerBlock(text: string, width = terminalColumns()): string {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => centerLine(line, width))
    .join('\n');
}
