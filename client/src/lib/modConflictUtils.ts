import type { ModInstallPlan } from '../types/modJob';
import type { ModInstallConflictInfo } from '../types/modConflict';

/** Merge install conflict rows from multiple upload/API responses. */
export function mergeInstallConflicts(
  items: ModInstallConflictInfo[] | null | undefined,
  into: Map<string, ModInstallConflictInfo>,
): void {
  for (const raw of items || []) {
    const name = String(raw?.name || '').trim();
    if (!name || raw?.will_disable === false) continue;
    const key = name.toLowerCase();
    if (!into.has(key)) {
      into.set(key, {
        name,
        is_builtin: !!raw.is_builtin,
        will_disable: true,
      });
    }
  }
}

/** Resolve install conflicts from API plan. */
export function installConflictsFromPlan(plan: ModInstallPlan | null | undefined): ModInstallConflictInfo[] {
  const rich = Array.isArray(plan?.install_conflicts) ? plan!.install_conflicts! : [];
  return rich
    .filter((x) => x?.will_disable !== false && String(x?.name || '').trim())
    .map((x) => ({
      name: String(x.name).trim(),
      is_builtin: !!x.is_builtin,
      will_disable: true,
    }));
}
