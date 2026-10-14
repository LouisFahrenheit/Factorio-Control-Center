// eslint-disable-next-line no-control-regex
const SPLIT_CHARS = /[\r\n\x00\x85\u2028\u2029]/;
// eslint-disable-next-line no-control-regex
const SPLIT_G = /[\r\n\x00\x85\u2028\u2029]/g;
const STDIN_LINE_MAX = 512;
const PLAYER_MAX = 128;

export function sanitizeStdinLine(text: string): string {
  let s = (text || '').replace(SPLIT_G, ' ');
  s = s
    .replace(/[\t\v\f]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
  if (s.length > STDIN_LINE_MAX) s = s.slice(0, STDIN_LINE_MAX);
  return s;
}

export function validateBanPlayer(player: string): {
  name?: string;
  error?: string;
} {
  const n = (player || '').trim();
  if (!n) return { error: 'empty' };
  if (n.length > PLAYER_MAX) return { error: 'invalid_ban_player' };
  if (SPLIT_CHARS.test(n)) return { error: 'invalid_ban_player' };
  return { name: n };
}
