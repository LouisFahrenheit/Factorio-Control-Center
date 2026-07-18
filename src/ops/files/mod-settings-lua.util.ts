const MOD_LUA_SETTING_TYPE_RE = /type\s*=\s*["'](\w+-setting)["']/gi;
const ALLOWED_VALUES_START_RE = /allowed_values\s*=\s*\{/gi;

export interface LuaSettingUiRefs {
  titles: Record<string, string>;
  descriptions: Record<string, string>;
  titleRefs: Record<string, [string, string]>;
  descRefs: Record<string, [string, string]>;
}

export function parseLuaListLiteralInner(inner: string): unknown[] {
  const body = inner.trim();
  if (!body) return [];
  const items: unknown[] = [];
  let i = 0;
  const n = body.length;
  while (i < n) {
    while (i < n && /[, \t\r\n]/.test(body[i])) i += 1;
    if (i >= n) break;
    const c = body[i];
    if (c === '"' || c === "'") {
      const q = c;
      i += 1;
      let sb = '';
      while (i < n) {
        const ch = body[i];
        if (ch === '\\' && i + 1 < n) {
          sb += body[i + 1];
          i += 2;
          continue;
        }
        if (ch === q) {
          i += 1;
          break;
        }
        sb += ch;
        i += 1;
      }
      items.push(sb);
      continue;
    }
    let j = i;
    while (j < n && body[j] !== ',') j += 1;
    const tok = body.slice(i, j).trim();
    if (tok) {
      const tl = tok.toLowerCase();
      if (tl === 'true') items.push(true);
      else if (tl === 'false') items.push(false);
      else if (/[.e]/i.test(tok)) {
        const f = parseFloat(tok);
        items.push(Number.isFinite(f) ? f : tok);
      } else {
        const iv = parseInt(tok, 10);
        items.push(Number.isFinite(iv) && String(iv) === tok ? iv : tok);
      }
    }
    i = j + 1;
  }
  return items;
}

export function extractAllowedValuesFromLuaText(
  text: string,
): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  const n = text.length;
  ALLOWED_VALUES_START_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ALLOWED_VALUES_START_RE.exec(text))) {
    const brace = text.indexOf('{', m.index);
    if (brace < 0) continue;
    let depth = 0;
    let innerEnd = -1;
    for (let k = brace; k < n; k += 1) {
      const ch = text[k];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          innerEnd = k;
          break;
        }
      }
    }
    if (innerEnd < 0) continue;
    const inner = text.slice(brace + 1, innerEnd);
    const vals = parseLuaListLiteralInner(inner);
    if (!vals.length) continue;
    const chunk = text.slice(Math.max(0, m.index - 4000), m.index);
    const names = [...chunk.matchAll(/name\s*=\s*["']([^"']+)["']/g)];
    if (!names.length) continue;
    const sname = names[names.length - 1][1].trim();
    if (sname) out[sname] = vals;
  }
  return out;
}

export function extractSettingNamesFromLuaText(text: string): Set<string> {
  const names = new Set<string>();
  const capped = text.length > 800_000 ? text.slice(0, 800_000) : text;
  MOD_LUA_SETTING_TYPE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MOD_LUA_SETTING_TYPE_RE.exec(capped))) {
    const start = Math.max(0, m.index - 500);
    const end = Math.min(capped.length, m.index + 700);
    const chunk = capped.slice(start, end);
    const nm = /name\s*=\s*["']([^"']+)["']/.exec(chunk);
    if (nm?.[1]) names.add(nm[1].trim());
  }
  for (const hit of capped.matchAll(/name\s*=\s*["']([^"']+)["']/g)) {
    const s = hit[1]?.trim();
    if (!s || s.length > 200) continue;
    const start = Math.max(0, hit.index - 400);
    const end = Math.min(capped.length, hit.index + hit[0].length + 400);
    if (MOD_LUA_SETTING_TYPE_RE.test(capped.slice(start, end))) names.add(s);
  }
  return names;
}

function unescapeLuaStringLiteral(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i];
    if (c === '\\' && i + 1 < raw.length) {
      out += raw[i + 1];
      i += 1;
      continue;
    }
    out += c;
  }
  return out;
}

export function extractLuaModSettingUiStrings(
  text: string,
  into: LuaSettingUiRefs,
): void {
  MOD_LUA_SETTING_TYPE_RE.lastIndex = 0;
  let tm: RegExpExecArray | null;
  while ((tm = MOD_LUA_SETTING_TYPE_RE.exec(text))) {
    const chunk = text.slice(tm.index, tm.index + 2800);
    const nm = /name\s*=\s*["']([^"']+)["']/.exec(chunk);
    if (!nm?.[1]) continue;
    const sname = nm[1].trim();
    for (const [pat, isDesc] of [
      [/localised_name\s*=\s*"((?:[^"\\]|\\.)*)"/, false],
      [/localised_name\s*=\s*'((?:[^'\\]|\\.)*)'/, false],
      [/localised_description\s*=\s*"((?:[^"\\]|\\.)*)"/, true],
      [/localised_description\s*=\s*'((?:[^'\\]|\\.)*)'/, true],
    ] as const) {
      const m = pat.exec(chunk);
      if (!m?.[1]) continue;
      const val = unescapeLuaStringLiteral(m[1]).trim();
      if (!val) continue;
      if (isDesc) into.descriptions[sname] ??= val;
      else into.titles[sname] ??= val;
    }
    const arr2 =
      /localised_name\s*=\s*\{\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\}/.exec(
        chunk,
      );
    if (arr2)
      into.titleRefs[sname] ??= [
        unescapeLuaStringLiteral(arr2[1]),
        unescapeLuaStringLiteral(arr2[2]),
      ];
    const arrNested =
      /localised_name\s*=\s*\{\s*"((?:[^"\\]|\\.)*)"\s*,\s*\{\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\}\s*\}/.exec(
        chunk,
      );
    if (arrNested) {
      into.titleRefs[sname] ??= [
        unescapeLuaStringLiteral(arrNested[2]),
        unescapeLuaStringLiteral(arrNested[3]),
      ];
    }
    const arrNestedOnly =
      /localised_name\s*=\s*\{\s*\{\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\}\s*\}/.exec(
        chunk,
      );
    if (arrNestedOnly) {
      into.titleRefs[sname] ??= [
        unescapeLuaStringLiteral(arrNestedOnly[1]),
        unescapeLuaStringLiteral(arrNestedOnly[2]),
      ];
    }
    const arr2d =
      /localised_description\s*=\s*\{\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\}/.exec(
        chunk,
      );
    if (arr2d)
      into.descRefs[sname] ??= [
        unescapeLuaStringLiteral(arr2d[1]),
        unescapeLuaStringLiteral(arr2d[2]),
      ];
    const arrNestedD =
      /localised_description\s*=\s*\{\s*"((?:[^"\\]|\\.)*)"\s*,\s*\{\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\}\s*\}/.exec(
        chunk,
      );
    if (arrNestedD) {
      into.descRefs[sname] ??= [
        unescapeLuaStringLiteral(arrNestedD[2]),
        unescapeLuaStringLiteral(arrNestedD[3]),
      ];
    }
    const arrNestedOnlyD =
      /localised_description\s*=\s*\{\s*\{\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\}\s*\}/.exec(
        chunk,
      );
    if (arrNestedOnlyD) {
      into.descRefs[sname] ??= [
        unescapeLuaStringLiteral(arrNestedOnlyD[1]),
        unescapeLuaStringLiteral(arrNestedOnlyD[2]),
      ];
    }
    const arr1 = /localised_name\s*=\s*\{\s*"((?:[^"\\]|\\.)*)"\s*\}/.exec(
      chunk,
    );
    if (arr1 && !into.titles[sname]) {
      const single = unescapeLuaStringLiteral(arr1[1]);
      const dot = single.indexOf('.');
      if (dot > 0)
        into.titleRefs[sname] ??= [single.slice(0, dot), single.slice(dot + 1)];
    }
    const arr1d =
      /localised_description\s*=\s*\{\s*"((?:[^"\\]|\\.)*)"\s*\}/.exec(chunk);
    if (arr1d && !into.descriptions[sname]) {
      const single = unescapeLuaStringLiteral(arr1d[1]);
      const dot = single.indexOf('.');
      if (dot > 0)
        into.descRefs[sname] ??= [single.slice(0, dot), single.slice(dot + 1)];
    }
  }
}

export function ingestSettingsLuaText(
  text: string,
  mod: string,
  ownerMod: Record<string, string>,
  allowedValues: Record<string, unknown[]>,
  ui: LuaSettingUiRefs,
): void {
  for (const sname of extractSettingNamesFromLuaText(text))
    ownerMod[sname] ??= mod;
  for (const [sname, vals] of Object.entries(
    extractAllowedValuesFromLuaText(text),
  )) {
    if (vals.length) allowedValues[sname] = vals;
  }
  extractLuaModSettingUiStrings(text, ui);
}

export function modSettingValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'boolean' || typeof b === 'boolean') return false;
  if (typeof a === 'number' && typeof b === 'number')
    return Math.abs(a - b) < 1e-9;
  return false;
}

export function rowShouldUseChoiceCombo(
  val: unknown,
  allowed: unknown[],
): boolean {
  if (!allowed.length) return false;
  if (typeof val === 'string')
    return allowed.every((x) => typeof x === 'string');
  if (typeof val === 'boolean')
    return allowed.every((x) => typeof x === 'boolean');
  if (typeof val === 'number' && !Number.isNaN(val))
    return allowed.every((x) => typeof x === 'number');
  return false;
}

export function modSettingChoiceLocaleKeys(
  settingKey: string,
  value: unknown,
): string[] {
  const keys: string[] = [];
  if (typeof value === 'boolean') {
    keys.push(`${settingKey}-${String(value).toLowerCase()}`);
    return [...new Set(keys)];
  }
  if (typeof value === 'string') {
    keys.push(`${settingKey}-${value}`);
    return [...new Set(keys)];
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Math.abs(value - Math.round(value)) < 1e-9)
      keys.push(`${settingKey}-${Math.round(value)}`);
    keys.push(`${settingKey}-${value}`);
    keys.push(`${settingKey}-${value.toString()}`);
    return [...new Set(keys)];
  }
  keys.push(`${settingKey}-${String(value)}`);
  return [...new Set(keys)];
}

export function isSettingsLuaMember(name: string): boolean {
  const norm = name.replace(/\\/g, '/').toLowerCase();
  if (!norm.endsWith('.lua')) return false;
  const base = norm.split('/').pop() || '';
  return (
    base === 'settings.lua' ||
    base === 'settings-updates.lua' ||
    norm.includes('/settings/')
  );
}
