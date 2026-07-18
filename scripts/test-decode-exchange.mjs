import { inflateSync } from 'zlib';
import { readFileSync } from 'fs';
import { decodeMapExchangeString } from '../dist/ops/map-gen/map-exchange-decode.js';

const raw = readFileSync(new URL('./test-exchange.txt', import.meta.url), 'utf8');
try {
  const d = decodeMapExchangeString(raw);
  console.log('OK', Object.keys(d.map_gen_settings.autoplace_controls || {}).length);
} catch (e) {
  console.error('FAIL', e.message);
  const s = raw.replace(/[\s\r\n]+/g, '');
  const buf = inflateSync(Buffer.from(s.slice(3, -3), 'base64'));
  console.log('buf len', buf.length);
  console.log('version', buf.readUInt16LE(0), buf.readUInt16LE(2), buf.readUInt16LE(4), buf.readUInt16LE(6));
}
