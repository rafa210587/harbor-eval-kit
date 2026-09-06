// Config bundle: export every registry as one portable JSON file, and re-apply it elsewhere.
//
// WHY THIS EXISTS: agents/judges/rubrics/criteria live in ~/.harbor-eval-kit/ per machine, so a
// team has no way to version, review in a PR, or reproduce each other's evaluation setup --
// which is exactly what makes an eval trustworthy in the first place. This is the fix: export
// to a file, commit it, everyone imports it.
//
// SECRETS ARE NEVER IN THIS FILE. Only registry entries (agents, models, skills, skillsets,
// criteria, rubrics, judges) go in the bundle -- a Model entry is a label plus a
// "provider/model" string, never a key. Callers must not add secrets.env to EXPORTABLE_KEYS.

import { readRegistry, writeRegistry } from "./paths.ts";

/** The registries a bundle carries, in dependency order (skills before skillsets that
 *  reference them, criteria before rubrics, etc.) -- order only matters for readability here,
 *  since import writes each registry independently regardless of order. */
export const BUNDLE_REGISTRIES = ["skills", "skillsets", "models", "agents", "criteria", "rubrics", "judges"] as const;
export type BundleRegistryName = (typeof BUNDLE_REGISTRIES)[number];

export interface ConfigBundle {
  /** Bumped only if the shape of this bundle ever changes incompatibly. */
  version: 1;
  exportedAt: string;
  registries: Partial<Record<BundleRegistryName, { id: string }[]>>;
}

export function exportConfigBundle(): ConfigBundle {
  const registries: ConfigBundle["registries"] = {};
  for (const name of BUNDLE_REGISTRIES) registries[name] = readRegistry<{ id: string }>(name);
  return { version: 1, exportedAt: new Date().toISOString(), registries };
}

export interface ImportSummary {
  added: number;
  updated: number;
  /** Per-registry breakdown, for a report the user can actually read. */
  byRegistry: Record<string, { added: number; updated: number }>;
  /** Non-fatal: an entry whose id collides with something already local that looks unrelated
   *  is still imported (last write wins, same as any git merge) -- this only surfaces it. */
  warnings: string[];
}

/**
 * Upserts every entry in `bundle` into the local registries, by id. Preserving the exported id
 * (rather than minting a new one on import) is what makes this idempotent: importing the same
 * bundle twice, or importing after a teammate already did, converges to the same state instead
 * of duplicating every entry.
 *
 * Unknown registry names in the bundle (e.g. from a newer kit version) are ignored rather than
 * rejected, so an old importer degrades gracefully instead of failing the whole import.
 */
export function importConfigBundle(bundle: unknown): ImportSummary {
  const summary: ImportSummary = { added: 0, updated: 0, byRegistry: {}, warnings: [] };
  const registries = (bundle as Partial<ConfigBundle>)?.registries;
  if (!registries || typeof registries !== "object") {
    summary.warnings.push("bundle sem campo 'registries' -- nada foi importado");
    return summary;
  }

  for (const [name, incoming] of Object.entries(registries)) {
    if (!BUNDLE_REGISTRIES.includes(name as BundleRegistryName)) {
      summary.warnings.push(`registro desconhecido ignorado: ${name}`);
      continue;
    }
    if (!Array.isArray(incoming)) continue;

    const existing = readRegistry<{ id: string }>(name);
    const byId = new Map(existing.map((item) => [item.id, item]));
    let added = 0;
    let updated = 0;
    for (const item of incoming) {
      if (!item || typeof item !== "object" || !("id" in item)) {
        summary.warnings.push(`item sem id em '${name}' ignorado`);
        continue;
      }
      if (byId.has((item as { id: string }).id)) updated++;
      else added++;
      byId.set((item as { id: string }).id, item as { id: string });
    }
    writeRegistry(name, [...byId.values()]);
    summary.byRegistry[name] = { added, updated };
    summary.added += added;
    summary.updated += updated;
  }
  return summary;
}
