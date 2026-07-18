import type { CommandDef, CommandCategoryDef, CommandsCatalogDoc } from '../types/commandsCatalog';

export function normalizeCatalog(raw: unknown): CommandsCatalogDoc {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { version: '2.0', categories: {} };
  }
  const obj = raw as Record<string, unknown>;
  const categoriesRaw = obj.categories;
  const categories: Record<string, CommandCategoryDef> = {};
  if (categoriesRaw && typeof categoriesRaw === 'object' && !Array.isArray(categoriesRaw)) {
    Object.entries(categoriesRaw as Record<string, unknown>).forEach(([key, val]) => {
      if (!val || typeof val !== 'object' || Array.isArray(val)) return;
      const cat = val as Record<string, unknown>;
      const commands = Array.isArray(cat.commands) ? cat.commands : [];
      categories[key] = {
        name: String(cat.name || key),
        commands: commands
          .filter((c) => c && typeof c === 'object' && !Array.isArray(c))
          .map((c) => normalizeCommand(c as Record<string, unknown>)),
      };
    });
  }
  return {
    version: String(obj.version || '2.0'),
    categories,
  };
}

function normalizeCommand(raw: Record<string, unknown>): CommandDef {
  const itemsRaw = raw.items;
  let items: Record<string, number> | undefined;
  if (itemsRaw && typeof itemsRaw === 'object' && !Array.isArray(itemsRaw)) {
    items = {};
    Object.entries(itemsRaw as Record<string, unknown>).forEach(([k, v]) => {
      const n = Number(v);
      if (k && Number.isFinite(n)) items![k] = n;
    });
  }
  return {
    id: String(raw.id || ''),
    name: String(raw.name || raw.id || ''),
    command: String(raw.command || ''),
    description: String(raw.description || ''),
    has_player: !!raw.has_player,
    has_value: !!raw.has_value,
    has_boolean: !!raw.has_boolean,
    has_item: !!raw.has_item,
    has_count: !!raw.has_count,
    has_quality: !!raw.has_quality,
    default_value: raw.default_value != null ? String(raw.default_value) : undefined,
    default_quality: raw.default_quality != null ? String(raw.default_quality) : undefined,
    items,
    requires_value: raw.requires_value === false ? false : undefined,
  };
}

export function cloneCatalog(doc: CommandsCatalogDoc): CommandsCatalogDoc {
  return JSON.parse(JSON.stringify(doc)) as CommandsCatalogDoc;
}

export function slugifyCommandId(name: string, fallback = 'command'): string {
  const slug = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || fallback;
}

export function uniqueCommandId(catalog: CommandsCatalogDoc, base: string): string {
  let id = slugifyCommandId(base);
  const used = new Set<string>();
  Object.values(catalog.categories).forEach((cat) => {
    cat.commands.forEach((cmd) => used.add(cmd.id));
  });
  if (!used.has(id)) return id;
  let n = 2;
  while (used.has(`${id}_${n}`)) n += 1;
  return `${id}_${n}`;
}

export function sortedCategoryKeys(catalog: CommandsCatalogDoc): string[] {
  return Object.keys(catalog.categories || {}).sort((a, b) => {
    const na = catalog.categories[a]?.name || a;
    const nb = catalog.categories[b]?.name || b;
    return na.localeCompare(nb);
  });
}

/** Category order as stored in catalog (editor + commands tab). */
export function categoryOrderKeys(catalog: CommandsCatalogDoc): string[] {
  return Object.keys(catalog.categories || {});
}

export function reorderCategories(
  catalog: CommandsCatalogDoc,
  orderedKeys: string[],
): CommandsCatalogDoc {
  const categories: Record<string, CommandCategoryDef> = {};
  orderedKeys.forEach((key) => {
    if (catalog.categories[key]) categories[key] = catalog.categories[key];
  });
  Object.keys(catalog.categories).forEach((key) => {
    if (!categories[key]) categories[key] = catalog.categories[key];
  });
  return { ...catalog, categories };
}

export function moveCategory(
  catalog: CommandsCatalogDoc,
  categoryKey: string,
  targetIndex: number,
): CommandsCatalogDoc {
  const keys = categoryOrderKeys(catalog);
  const fromIndex = keys.indexOf(categoryKey);
  if (fromIndex < 0) return catalog;

  let insertIndex = Math.max(0, Math.min(targetIndex, keys.length));
  if (fromIndex === insertIndex || fromIndex + 1 === insertIndex) return catalog;

  const nextKeys = keys.slice();
  nextKeys.splice(fromIndex, 1);
  if (fromIndex < targetIndex) insertIndex -= 1;
  nextKeys.splice(insertIndex, 0, categoryKey);

  return reorderCategories(catalog, nextKeys);
}

export function findCommandLocation(
  catalog: CommandsCatalogDoc,
  commandId: string,
): { categoryKey: string; index: number } | null {
  for (const [categoryKey, cat] of Object.entries(catalog.categories)) {
    const index = cat.commands.findIndex((c) => c.id === commandId);
    if (index >= 0) return { categoryKey, index };
  }
  return null;
}

export function getSelectedCommand(catalog: CommandsCatalogDoc, commandId: string): CommandDef | null {
  const loc = findCommandLocation(catalog, commandId);
  if (!loc) return null;
  return catalog.categories[loc.categoryKey]?.commands[loc.index] || null;
}

export function stripEmptyFlags(cmd: CommandDef): CommandDef {
  const out: CommandDef = {
    id: cmd.id,
    name: cmd.name,
    command: cmd.command,
    description: cmd.description,
  };
  if (cmd.has_player) out.has_player = true;
  if (cmd.has_boolean) {
    out.has_boolean = true;
    if (cmd.default_value) out.default_value = cmd.default_value;
  } else if (cmd.has_value) {
    out.has_value = true;
    if (cmd.default_value) out.default_value = cmd.default_value;
  }
  if (cmd.has_item) {
    out.has_item = true;
    if (cmd.items && Object.keys(cmd.items).length) out.items = { ...cmd.items };
  }
  if (cmd.has_count) out.has_count = true;
  if (cmd.has_quality) {
    out.has_quality = true;
    if (cmd.default_quality) out.default_quality = cmd.default_quality;
  }
  if (cmd.requires_value === false) out.requires_value = false;
  return out;
}

export function serializeCatalogForSave(catalog: CommandsCatalogDoc): CommandsCatalogDoc {
  const categories: Record<string, CommandCategoryDef> = {};
  categoryOrderKeys(catalog).forEach((key) => {
    const cat = catalog.categories[key];
    if (!cat) return;
    categories[key] = {
      name: cat.name,
      commands: cat.commands.map((cmd) => stripEmptyFlags(cmd)),
    };
  });
  return {
    version: catalog.version || '2.0',
    categories,
  };
}

export function newCommandDef(catalog: CommandsCatalogDoc): CommandDef {
  const id = uniqueCommandId(catalog, 'new_command');
  return {
    id,
    name: '',
    command: '/c ',
    description: '',
  };
}
