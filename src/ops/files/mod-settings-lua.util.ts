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

function findEnclosingTable(text: string, typeIdx: number): string | null {
  let openBrace = -1;
  let depth = 0;
  for (let i = typeIdx; i >= 0; i -= 1) {
    const c = text[i];
    if (c === '}') depth += 1;
    else if (c === '{') {
      if (depth === 0) {
        openBrace = i;
        break;
      }
      depth -= 1;
    }
  }
  if (openBrace === -1) return null;

  let closeBrace = -1;
  depth = 0;
  const n = text.length;
  for (let i = openBrace; i < n; i += 1) {
    if (text[i] === '"' || text[i] === "'") {
      const q = text[i];
      i += 1;
      while (i < n) {
        if (text[i] === '\\' && i + 1 < n) {
          i += 2;
          continue;
        }
        if (text[i] === q) break;
        i += 1;
      }
      continue;
    }
    if (text[i] === '-' && text[i + 1] === '-') {
      if (text.slice(i, i + 4) === '--[[') {
        const end = text.indexOf(']]', i + 4);
        i = end === -1 ? n : end + 1;
        continue;
      }
      const nextLine = text.indexOf('\n', i + 2);
      i = nextLine === -1 ? n : nextLine;
      continue;
    }
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        closeBrace = i;
        break;
      }
    }
  }
  if (closeBrace === -1) return null;
  return text.slice(openBrace, closeBrace + 1);
}

function extractSettingTables(text: string): { name: string; block: string }[] {
  const tables: { name: string; block: string }[] = [];
  const seenNames = new Set<string>();
  const searchRegex = /type\s*=\s*["'](\w+-setting)["']/g;
  let match: RegExpExecArray | null;
  while ((match = searchRegex.exec(text)) !== null) {
    const block = findEnclosingTable(text, match.index);
    if (!block) continue;
    const nameMatch = /name\s*=\s*["']([^"']+)["']/.exec(block);
    if (nameMatch) {
      const sname = nameMatch[1].trim();
      if (!seenNames.has(sname)) {
        seenNames.add(sname);
        tables.push({ name: sname, block });
      }
    }
  }

  // Also support direct data.raw assignments: data.raw["bool-setting"]["sname"]
  const rawRegex = /data\.raw\[["']\w+-setting["']\]\[["']([^"']+)["']\]/g;
  while ((match = rawRegex.exec(text)) !== null) {
    const sname = match[1].trim();
    if (!seenNames.has(sname)) {
      seenNames.add(sname);
      const after = text.slice(match.index, match.index + 2000);
      tables.push({ name: sname, block: after });
    }
  }

  return tables;
}

export function extractAllowedValuesFromLuaText(
  text: string,
): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const { name, block } of extractSettingTables(text)) {
    const allowedMatch = /allowed_values\s*=\s*\{/.exec(block);
    if (!allowedMatch) continue;
    const braceIdx = block.indexOf('{', allowedMatch.index);
    if (braceIdx === -1) continue;
    let depth = 0;
    let endIdx = -1;
    for (let k = braceIdx; k < block.length; k += 1) {
      if (block[k] === '{') depth += 1;
      else if (block[k] === '}') {
        depth -= 1;
        if (depth === 0) {
          endIdx = k;
          break;
        }
      }
    }
    if (endIdx === -1) continue;
    const inner = block.slice(braceIdx + 1, endIdx);
    const vals = parseLuaListLiteralInner(inner);
    if (vals.length) {
      out[name] = vals;
    }
  }
  return out;
}

export function extractSettingNamesFromLuaText(text: string): Set<string> {
  const names = new Set<string>();
  for (const { name } of extractSettingTables(text)) {
    names.add(name);
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
  for (const { name: sname, block } of extractSettingTables(text)) {
    for (const [pat, isDesc] of [
      [/localised_name\s*=\s*"((?:[^"\\]|\\.)*)"/, false],
      [/localised_name\s*=\s*'((?:[^'\\]|\\.)*)'/, false],
      [/localised_description\s*=\s*"((?:[^"\\]|\\.)*)"/, true],
      [/localised_description\s*=\s*'((?:[^'\\]|\\.)*)'/, true],
    ] as const) {
      const m = pat.exec(block);
      if (!m?.[1]) continue;
      const val = unescapeLuaStringLiteral(m[1]).trim();
      if (!val) continue;
      if (isDesc) into.descriptions[sname] ??= val;
      else into.titles[sname] ??= val;
    }
    const arr2 =
      /localised_name\s*=\s*\{\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\}/.exec(
        block,
      );
    if (arr2)
      into.titleRefs[sname] ??= [
        unescapeLuaStringLiteral(arr2[1]),
        unescapeLuaStringLiteral(arr2[2]),
      ];
    const arrNested =
      /localised_name\s*=\s*\{\s*"((?:[^"\\]|\\.)*)"\s*,\s*\{\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\}\s*\}/.exec(
        block,
      );
    if (arrNested) {
      into.titleRefs[sname] ??= [
        unescapeLuaStringLiteral(arrNested[2]),
        unescapeLuaStringLiteral(arrNested[3]),
      ];
    }
    const arrNestedOnly =
      /localised_name\s*=\s*\{\s*\{\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\}\s*\}/.exec(
        block,
      );
    if (arrNestedOnly) {
      into.titleRefs[sname] ??= [
        unescapeLuaStringLiteral(arrNestedOnly[1]),
        unescapeLuaStringLiteral(arrNestedOnly[2]),
      ];
    }
    const arr2d =
      /localised_description\s*=\s*\{\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\}/.exec(
        block,
      );
    if (arr2d)
      into.descRefs[sname] ??= [
        unescapeLuaStringLiteral(arr2d[1]),
        unescapeLuaStringLiteral(arr2d[2]),
      ];
    const arrNestedD =
      /localised_description\s*=\s*\{\s*"((?:[^"\\]|\\.)*)"\s*,\s*\{\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\}\s*\}/.exec(
        block,
      );
    if (arrNestedD) {
      into.descRefs[sname] ??= [
        unescapeLuaStringLiteral(arrNestedD[2]),
        unescapeLuaStringLiteral(arrNestedD[3]),
      ];
    }
    const arrNestedOnlyD =
      /localised_description\s*=\s*\{\s*\{\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\}\s*\}/.exec(
        block,
      );
    if (arrNestedOnlyD) {
      into.descRefs[sname] ??= [
        unescapeLuaStringLiteral(arrNestedOnlyD[1]),
        unescapeLuaStringLiteral(arrNestedOnlyD[2]),
      ];
    }
    const arr1 = /localised_name\s*=\s*\{\s*"((?:[^"\\]|\\.)*)"\s*\}/.exec(
      block,
    );
    if (arr1 && !into.titles[sname]) {
      const single = unescapeLuaStringLiteral(arr1[1]);
      const dot = single.indexOf('.');
      if (dot > 0)
        into.titleRefs[sname] ??= [single.slice(0, dot), single.slice(dot + 1)];
    }
    const arr1d =
      /localised_description\s*=\s*\{\s*"((?:[^"\\]|\\.)*)"\s*\}/.exec(block);
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
    base === 'settings-final-fixes.lua' ||
    norm.includes('/settings/')
  );
}
