export interface CommandsCatalogHistoryChange {
  action:
    | 'category_create'
    | 'category_delete'
    | 'command_create'
    | 'command_delete';
  target: string;
  detail?: Record<string, unknown>;
}

interface CatalogCommandSnap {
  id: string;
  name: string;
  command: string;
}

interface CatalogCategorySnap {
  key: string;
  name: string;
  commands: Map<string, CatalogCommandSnap>;
}

function snapshotCatalog(raw: unknown): Map<string, CatalogCategorySnap> {
  const out = new Map<string, CatalogCategorySnap>();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const categories = (raw as Record<string, unknown>).categories;
  if (
    !categories ||
    typeof categories !== 'object' ||
    Array.isArray(categories)
  )
    return out;

  Object.entries(categories as Record<string, unknown>).forEach(
    ([key, catVal]) => {
      if (!catVal || typeof catVal !== 'object' || Array.isArray(catVal))
        return;
      const cat = catVal as Record<string, unknown>;
      const commands = new Map<string, CatalogCommandSnap>();
      const list = Array.isArray(cat.commands) ? cat.commands : [];
      list.forEach((cmdVal) => {
        if (!cmdVal || typeof cmdVal !== 'object' || Array.isArray(cmdVal))
          return;
        const cmd = cmdVal as Record<string, unknown>;
        const id = String(cmd.id || '').trim();
        if (!id) return;
        commands.set(id, {
          id,
          name: String(cmd.name || id).trim() || id,
          command: String(cmd.command || '').trim(),
        });
      });
      out.set(key, {
        key,
        name: String(cat.name || key).trim() || key,
        commands,
      });
    },
  );

  return out;
}

/** Detect category/command create/delete between two merged catalog documents. */
export function diffCommandsCatalog(
  before: unknown,
  after: unknown,
): CommandsCatalogHistoryChange[] {
  const oldSnap = snapshotCatalog(before);
  const newSnap = snapshotCatalog(after);
  const changes: CommandsCatalogHistoryChange[] = [];

  for (const [key, newCat] of newSnap) {
    if (oldSnap.has(key)) continue;
    changes.push({
      action: 'category_create',
      target: newCat.name,
      detail: { key },
    });
    for (const cmd of newCat.commands.values()) {
      changes.push({
        action: 'command_create',
        target: cmd.name,
        detail: {
          id: cmd.id,
          command: cmd.command,
          category: newCat.name,
          category_key: key,
        },
      });
    }
  }

  for (const [key, oldCat] of oldSnap) {
    if (newSnap.has(key)) continue;
    const removedCommands = [...oldCat.commands.values()].map(
      (cmd) => cmd.name || cmd.id,
    );
    changes.push({
      action: 'category_delete',
      target: oldCat.name,
      detail: {
        key,
        commands: removedCommands,
      },
    });
  }

  for (const [key, newCat] of newSnap) {
    const oldCat = oldSnap.get(key);
    if (!oldCat) continue;

    for (const cmd of newCat.commands.values()) {
      if (oldCat.commands.has(cmd.id)) continue;
      changes.push({
        action: 'command_create',
        target: cmd.name,
        detail: {
          id: cmd.id,
          command: cmd.command,
          category: newCat.name,
          category_key: key,
        },
      });
    }

    for (const cmd of oldCat.commands.values()) {
      if (newCat.commands.has(cmd.id)) continue;
      changes.push({
        action: 'command_delete',
        target: cmd.name,
        detail: {
          id: cmd.id,
          command: cmd.command,
          category: oldCat.name,
          category_key: key,
        },
      });
    }
  }

  return changes;
}
