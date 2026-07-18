/** Language-neutral command definition (stored in server_commands.json). */
export interface CommandsBaseCommand {
  id: string;
  command: string;
  has_player?: boolean;
  has_value?: boolean;
  has_boolean?: boolean;
  has_item?: boolean;
  has_count?: boolean;
  has_quality?: boolean;
  default_value?: string;
  default_quality?: string;
  items?: Record<string, number>;
  requires_value?: boolean;
}

export interface CommandsBaseCategory {
  commands: CommandsBaseCommand[];
}

export interface CommandsBaseDoc {
  version: string;
  categories: Record<string, CommandsBaseCategory>;
}

/** Per-language strings (`server_commands_en.json`, `server_commands_XX.json`, …). */
export interface CommandsTranslationEntry {
  name: string;
  description: string;
}

export interface CommandsTranslationsDoc {
  categories: Record<string, string>;
  commands: Record<string, CommandsTranslationEntry>;
}

/** Merged catalog returned to the UI. */
export interface CommandsMergedCommand extends CommandsBaseCommand {
  name: string;
  description: string;
}

export interface CommandsMergedCategory {
  name: string;
  commands: CommandsMergedCommand[];
}

export interface CommandsMergedDoc {
  version: string;
  categories: Record<string, CommandsMergedCategory>;
}

export function emptyBaseDoc(): CommandsBaseDoc {
  return { version: '2.0', categories: {} };
}

export function emptyTranslationsDoc(): CommandsTranslationsDoc {
  return { categories: {}, commands: {} };
}

function stripBaseCommand(raw: Record<string, unknown>): CommandsBaseCommand {
  const id = String(raw.id || '').trim();
  const out: CommandsBaseCommand = {
    id,
    command: String(raw.command || ''),
  };
  if (raw.has_player) out.has_player = true;
  if (raw.has_boolean) {
    out.has_boolean = true;
    if (raw.default_value != null)
      out.default_value = String(raw.default_value);
  } else if (raw.has_value) {
    out.has_value = true;
    if (raw.default_value != null)
      out.default_value = String(raw.default_value);
  }
  if (raw.has_item) {
    out.has_item = true;
    if (
      raw.items &&
      typeof raw.items === 'object' &&
      !Array.isArray(raw.items)
    ) {
      out.items = { ...(raw.items as Record<string, number>) };
    }
  }
  if (raw.has_count) out.has_count = true;
  if (raw.has_quality) {
    out.has_quality = true;
    if (raw.default_quality != null)
      out.default_quality = String(raw.default_quality);
  }
  if (raw.requires_value === false) out.requires_value = false;
  return out;
}

export function parseBaseDoc(raw: unknown): CommandsBaseDoc {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return emptyBaseDoc();
  const obj = raw as Record<string, unknown>;
  const categories: Record<string, CommandsBaseCategory> = {};
  const catsRaw = obj.categories;
  if (catsRaw && typeof catsRaw === 'object' && !Array.isArray(catsRaw)) {
    Object.entries(catsRaw as Record<string, unknown>).forEach(
      ([catKey, catVal]) => {
        if (!catVal || typeof catVal !== 'object' || Array.isArray(catVal))
          return;
        const cat = catVal as Record<string, unknown>;
        const commands = Array.isArray(cat.commands) ? cat.commands : [];
        categories[catKey] = {
          commands: commands
            .filter((c) => c && typeof c === 'object' && !Array.isArray(c))
            .map((c) => stripBaseCommand(c as Record<string, unknown>))
            .filter((c) => c.id),
        };
      },
    );
  }
  return { version: String(obj.version || '2.0'), categories };
}

export function parseTranslationsDoc(raw: unknown): CommandsTranslationsDoc {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return emptyTranslationsDoc();
  const obj = raw as Record<string, unknown>;
  const categories: Record<string, string> = {};
  const commands: Record<string, CommandsTranslationEntry> = {};
  if (
    obj.categories &&
    typeof obj.categories === 'object' &&
    !Array.isArray(obj.categories)
  ) {
    Object.entries(obj.categories as Record<string, string>).forEach(
      ([k, v]) => {
        categories[k] = String(v || k);
      },
    );
  }
  if (
    obj.commands &&
    typeof obj.commands === 'object' &&
    !Array.isArray(obj.commands)
  ) {
    Object.entries(obj.commands as Record<string, unknown>).forEach(
      ([id, val]) => {
        if (!val || typeof val !== 'object' || Array.isArray(val)) return;
        const e = val as Record<string, unknown>;
        commands[id] = {
          name: String(e.name || id),
          description: String(e.description || ''),
        };
      },
    );
  }
  return { categories, commands };
}

export function mergeCatalog(
  base: CommandsBaseDoc,
  translations: CommandsTranslationsDoc,
): CommandsMergedDoc {
  const categories: Record<string, CommandsMergedCategory> = {};
  Object.entries(base.categories || {}).forEach(([catKey, cat]) => {
    const catName = translations.categories[catKey] || catKey;
    categories[catKey] = {
      name: catName,
      commands: (cat.commands || []).map((cmd) => {
        const tr = translations.commands[cmd.id];
        return {
          ...cmd,
          name: tr?.name || cmd.id,
          description: tr?.description || '',
        };
      }),
    };
  });
  return { version: base.version || '2.0', categories };
}

export function splitMergedCatalog(merged: unknown): {
  base: CommandsBaseDoc;
  translations: CommandsTranslationsDoc;
} {
  if (!merged || typeof merged !== 'object' || Array.isArray(merged)) {
    return { base: emptyBaseDoc(), translations: emptyTranslationsDoc() };
  }
  const obj = merged as Record<string, unknown>;
  const base: CommandsBaseDoc = {
    version: String(obj.version || '2.0'),
    categories: {},
  };
  const translations: CommandsTranslationsDoc = {
    categories: {},
    commands: {},
  };
  const catsRaw = obj.categories;
  if (!catsRaw || typeof catsRaw !== 'object' || Array.isArray(catsRaw)) {
    return { base, translations };
  }
  Object.entries(catsRaw as Record<string, unknown>).forEach(
    ([catKey, catVal]) => {
      if (!catVal || typeof catVal !== 'object' || Array.isArray(catVal))
        return;
      const cat = catVal as Record<string, unknown>;
      translations.categories[catKey] = String(cat.name || catKey);
      const commands = Array.isArray(cat.commands) ? cat.commands : [];
      base.categories[catKey] = {
        commands: commands
          .filter((c) => c && typeof c === 'object' && !Array.isArray(c))
          .map((c) => {
            const row = c as Record<string, unknown>;
            const id = String(row.id || '').trim();
            if (id) {
              translations.commands[id] = {
                name: String(row.name || id),
                description: String(row.description || ''),
              };
            }
            return stripBaseCommand(row);
          })
          .filter((c) => c.id),
      };
    },
  );
  return { base, translations };
}

export function baseCategoryOrder(base: CommandsBaseDoc): string[] {
  return Object.keys(base.categories || {});
}

/** Writes categories and command arrays in stable catalog order. */
export function serializeBaseDoc(base: CommandsBaseDoc): CommandsBaseDoc {
  const categories: Record<string, CommandsBaseCategory> = {};
  baseCategoryOrder(base).forEach((key) => {
    const cat = base.categories[key];
    if (!cat) return;
    categories[key] = {
      commands: (cat.commands || []).map((cmd) => ({ ...cmd })),
    };
  });
  return { version: base.version || '2.0', categories };
}

/**
 * Reorders translation maps to match base catalog structure.
 * Category keys and command keys follow category/command order from base.
 */
export function serializeTranslationsDoc(
  tr: CommandsTranslationsDoc,
  base: CommandsBaseDoc,
): CommandsTranslationsDoc {
  const categoryKeys = baseCategoryOrder(base);
  const categories: Record<string, string> = {};
  categoryKeys.forEach((key) => {
    const label = tr.categories[key];
    categories[key] =
      label != null && String(label).trim() ? String(label) : key;
  });
  Object.keys(tr.categories || {}).forEach((key) => {
    if (!categories[key]) categories[key] = tr.categories[key];
  });

  const commands: Record<string, CommandsTranslationEntry> = {};
  categoryKeys.forEach((catKey) => {
    const list = base.categories[catKey]?.commands || [];
    list.forEach((cmd) => {
      const id = cmd.id;
      const entry = tr.commands[id];
      if (entry) {
        commands[id] = { name: entry.name, description: entry.description };
      }
    });
  });
  Object.keys(tr.commands || {}).forEach((id) => {
    if (!commands[id]) commands[id] = tr.commands[id];
  });

  return { categories, commands };
}
