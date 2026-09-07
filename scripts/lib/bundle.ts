import { readRegistry, writeRegistry, getRegistryPath } from "./paths.ts";
import { REGISTRY_NAMES, validateRegistryEntry, validateRegistrySnapshot } from "./registry-validation.ts";
import type { RegistryItem, RegistrySnapshot } from "./registry-validation.ts";
import type { RegistryName } from "./types.ts";

export const BUNDLE_REGISTRIES = REGISTRY_NAMES;
export type BundleRegistryName = RegistryName;
export interface ConfigBundle {
  version: 1;
  exportedAt: string;
  registries: Partial<Record<BundleRegistryName, { id: string }[]>>;
}
export function exportConfigBundle(): ConfigBundle {
  const registries: RegistrySnapshot = {};
  for (const name of BUNDLE_REGISTRIES) registries[name] = readRegistry<RegistryItem>(name);
  validateRegistrySnapshot(registries);
  return { version: 1, exportedAt: new Date().toISOString(), registries };
}
export interface ImportSummary {
  added: number;
  updated: number;
  byRegistry: Record<string, { added: number; updated: number }>;
  warnings: string[];
}
/** Validate the complete merged configuration and all destination paths before any write.
 * Validation failures are all-or-nothing; each registry replacement is individually atomic.
 * An OS/I/O failure across multiple replacements is not a filesystem transaction.
 */
export function importConfigBundle(bundle: unknown): ImportSummary {
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) throw new Error("bundle inválido");
  const input = bundle as Partial<ConfigBundle>;
  if (input.version !== 1) throw new Error("versão de bundle incompatível");
  if (!input.registries || typeof input.registries !== "object" || Array.isArray(input.registries)) throw new Error("bundle sem registries válidas");
  const summary: ImportSummary = { added: 0, updated: 0, byRegistry: {}, warnings: [] };
  const merged: RegistrySnapshot = {};
  const changed: RegistryName[] = [];
  for (const name of BUNDLE_REGISTRIES) merged[name] = readRegistry<RegistryItem>(name);
  for (const [rawName, incoming] of Object.entries(input.registries)) {
    const name = rawName as RegistryName;
    if (!BUNDLE_REGISTRIES.includes(name)) {
      summary.warnings.push(`registro desconhecido ignorado: ${name}`);
      continue;
    }
    if (!Array.isArray(incoming)) throw new Error(`registro ${name} deve ser lista`);
    const seen = new Set<string>();
    const byId = new Map(merged[name]!.map(item => [item.id, item]));
    let added = 0, updated = 0;
    for (const item of incoming) {
      validateRegistryEntry(name, item);
      if (seen.has(item.id)) throw new Error(`id duplicado em ${name}`);
      seen.add(item.id);
      if (byId.has(item.id)) updated++; else added++;
      byId.set(item.id, item);
    }
    merged[name] = [...byId.values()];
    changed.push(name);
    summary.byRegistry[name] = { added, updated };
    summary.added += added;
    summary.updated += updated;
  }
  validateRegistrySnapshot(merged);
  changed.forEach(getRegistryPath);
  for (const name of changed) writeRegistry(name, merged[name]);
  return summary;
}
