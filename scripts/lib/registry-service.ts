// Shared registry mutation boundary for HTTP and future CLI callers.
import { newId, readRegistry, writeRegistry } from "./paths.ts";
import { assertSafeId, REGISTRY_NAMES, registryReferencesTo, validateRegistrySnapshot } from "./registry-validation.ts";
import type { RegistryItem, RegistrySnapshot } from "./registry-validation.ts";
import type { RegistryName } from "./types.ts";

export class RegistryNotFoundError extends Error {
  constructor() { super("registro não encontrado"); }
}

export function readRegistrySnapshot(): RegistrySnapshot {
  return Object.fromEntries(REGISTRY_NAMES.map(name => [name, readRegistry<RegistryItem>(name)]));
}
function objectBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("cadastro deve ser um objeto JSON");
  return body as Record<string, unknown>;
}
function persist(name: RegistryName, snapshot: RegistrySnapshot): void {
  validateRegistrySnapshot(snapshot);
  writeRegistry(name, snapshot[name]);
}
export function createRegistryEntry(name: RegistryName, body: unknown): RegistryItem {
  const item = { ...objectBody(body), id: newId() };
  const snapshot = readRegistrySnapshot();
  if (!snapshot[name]) throw new Error("registro desconhecido");
  snapshot[name]!.push(item);
  persist(name, snapshot);
  return item;
}
export function updateRegistryEntry(name: RegistryName, id: string, body: unknown): RegistryItem {
  assertSafeId(id);
  const patch = objectBody(body);
  const snapshot = readRegistrySnapshot();
  const index = snapshot[name]?.findIndex(item => item.id === id) ?? -1;
  if (index < 0) throw new RegistryNotFoundError();
  const item = { ...snapshot[name]![index], ...patch, id };
  snapshot[name]![index] = item;
  persist(name, snapshot);
  return item;
}
export function deleteRegistryEntry(name: RegistryName, id: string): void {
  assertSafeId(id);
  const snapshot = readRegistrySnapshot();
  if (!snapshot[name]?.some(item => item.id === id)) throw new RegistryNotFoundError();
  const references = registryReferencesTo(snapshot, name, id);
  if (references.length) throw new Error(`item ainda referenciado por ${references.join(", ")}`);
  snapshot[name] = snapshot[name]!.filter(item => item.id !== id);
  persist(name, snapshot);
}
