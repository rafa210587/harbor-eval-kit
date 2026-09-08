import type { RegistryName } from "./types.ts";

export type RegistryItem = { id: string; [key: string]: unknown };
export type RegistrySnapshot = Partial<Record<RegistryName, RegistryItem[]>>;
export const REGISTRY_NAMES: RegistryName[] = ["skills", "skillsets", "models", "agents", "criteria", "rubrics", "judges"];
export const REGISTRY_REFERENCES: [RegistryName, string, RegistryName][] = [
  ["skillsets", "skillIds", "skills"], ["agents", "modelId", "models"], ["agents", "defaultSkillsetIds", "skillsets"],
  ["rubrics", "criterionIds", "criteria"], ["judges", "modelId", "models"], ["judges", "defaultRubricIds", "rubrics"],
];

export function registryReferencesTo(registries: RegistrySnapshot, target: RegistryName, id: string): string[] {
  const blockers: string[] = [];
  for (const [from, field, to] of REGISTRY_REFERENCES) {
    if (to !== target) continue;
    for (const item of registries[from] ?? []) {
      const ids = Array.isArray(item[field]) ? item[field] as string[] : item[field] ? [item[field] as string] : [];
      if (ids.includes(id)) blockers.push(`${from}.${field} → ${target}`);
    }
  }
  return [...new Set(blockers)];
}

export function assertSafeId(id: unknown): asserts id is string {
  if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) {
    throw new Error("id inválido: use 1–128 letras ASCII, números, hífen ou underscore");
  }
}

export function assertExtraFileName(name: unknown): asserts name is string {
  if (typeof name !== "string" || !name || name !== name.trim() || /[\\:\x00-\x1f]/.test(name)
    || name.startsWith("/") || name.split("/").some(p => !p || p === "." || p === ".." || /[. ]$/.test(p)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)) || name.toLowerCase() === "skill.md") {
    throw new Error("nome de arquivo extra inválido ou reservado");
  }
}

/** Validate without coercing values or including their contents in error messages. */
export function validateRegistryEntry(name: RegistryName, value: unknown): asserts value is RegistryItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`item inválido em ${name}`);
  const item = value as RegistryItem;
  assertSafeId(item.id);
  const fields: Record<RegistryName, string[]> = {
    skills: ["label", "mode", "instructions", "path", "extraFiles"], skillsets: ["label", "skillIds"],
    models: ["label", "value"], agents: ["label", "agentValue", "modelId", "integrationId", "instructions", "defaultSkillsetIds", "notes"],
    criteria: ["name", "description", "guidance"], rubrics: ["label", "criterionIds"],
    judges: ["label", "agentValue", "modelId", "promptTemplate", "defaultRubricIds", "notes"],
  };
  if (!fields[name]) throw new Error("registro desconhecido");
  for (const key of Object.keys(item)) if (key !== "id" && !fields[name].includes(key)) throw new Error(`campo não permitido em ${name}`);
  const required = name === "criteria" ? ["name"] : ["label", ...(name === "models" ? ["value"] : name === "agents" || name === "judges" ? ["agentValue"] : [])];
  for (const key of required) if (typeof item[key] !== "string" || !(item[key] as string).trim()) throw new Error(`campo ${key} obrigatório em ${name}`);
  for (const key of fields[name]) {
    if (item[key] === undefined) continue;
    if (key.endsWith("Ids")) {
      if (!Array.isArray(item[key])) throw new Error(`${key} deve ser uma lista`);
      (item[key] as unknown[]).forEach(assertSafeId);
    } else if (key === "extraFiles") {
      if (!Array.isArray(item[key])) throw new Error("extraFiles deve ser uma lista");
      const seen = new Set<string>();
      for (const file of item[key]) {
        if (!file || typeof file !== "object" || typeof file.content !== "string" || Object.keys(file).some(k => !["name", "content"].includes(k))) throw new Error("arquivo extra inválido");
        assertExtraFileName(file.name);
        const normalized = file.name.toLowerCase();
        if ([...seen].some(n => n === normalized || n.startsWith(normalized + "/") || normalized.startsWith(n + "/"))) throw new Error("arquivos extras em conflito");
        seen.add(normalized);
      }
    } else if (typeof item[key] !== "string") throw new Error(`${key} deve ser texto`);
  }
  if (item.modelId) assertSafeId(item.modelId);
  if (item.integrationId !== undefined) assertSafeId(item.integrationId);
  if (name === "skills" && item.mode !== "authored" && item.mode !== "path") throw new Error("mode deve ser authored ou path");
  if (name === "skills" && item.mode === "path" && (typeof item.path !== "string" || !item.path.trim())) throw new Error("path obrigatório");
  for (const field of name === "skillsets" ? ["skillIds"] : name === "rubrics" ? ["criterionIds"] : []) {
    if (!Array.isArray(item[field])) throw new Error(`${field} deve ser uma lista`);
  }
}

export function validateRegistrySnapshot(registries: RegistrySnapshot): void {
  for (const name of REGISTRY_NAMES) {
    const seen = new Set<string>();
    for (const item of registries[name] ?? []) {
      validateRegistryEntry(name, item);
      if (seen.has(item.id)) throw new Error(`id duplicado em ${name}`);
      seen.add(item.id);
    }
  }
  for (const [from, field, to] of REGISTRY_REFERENCES) for (const item of registries[from] ?? []) {
    const ids = Array.isArray(item[field]) ? item[field] as string[] : item[field] ? [item[field] as string] : [];
    for (const id of ids) if (!(registries[to] ?? []).some(entry => entry.id === id)) throw new Error(`referência inexistente: ${from}.${field} → ${to}`);
  }
}
