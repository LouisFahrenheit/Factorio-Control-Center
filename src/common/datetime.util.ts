/** Readable UTC timestamp for JSON/history (`YYYY-MM-DD HH:mm:ss`, no Z). */
export function panelTimestamp(d = new Date()): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/** Local timestamp for instance log lines (`YYYY-MM-DD HH:mm:ss.mmm`). */
export function panelLogLineTimestamp(d = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}
