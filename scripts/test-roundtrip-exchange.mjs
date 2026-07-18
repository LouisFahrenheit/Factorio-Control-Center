import { readFileSync } from 'fs';
import { decodeMapExchangeString } from '../dist/ops/map-gen/map-exchange-decode.js';
import { encodeMapExchangeString, prepareMapSettingsForExchange } from '../dist/ops/map-gen/map-exchange-encode.js';

const raw = readFileSync(new URL('./test-exchange.txt', import.meta.url), 'utf8');
const d = decodeMapExchangeString(raw);
const encoded = encodeMapExchangeString(
  d.map_gen_settings,
  prepareMapSettingsForExchange(d.map_settings, true),
  d.version,
);
const d2 = decodeMapExchangeString(encoded);
console.log('roundtrip', encoded.length, 'controls', Object.keys(d2.map_gen_settings.autoplace_controls || {}).length);
console.log('seed', d.map_gen_settings.seed, '->', d2.map_gen_settings.seed);
