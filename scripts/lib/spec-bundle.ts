import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, posix, relative, resolve } from "node:path";
import { safeRepositoryPath } from "./repository-source.ts";
import { assertSafeExport } from "./export-safety.ts";

export interface SpecDocument { path: string; content: string; sha256: string; size: number }
export interface SpecBundle { documents: SpecDocument[]; suggestedPaths: string[] }

/** References are suggestions, never an instruction to fetch or automatically include data. */
export function resolveSpecBundle(root: string, entry: string, selectedPaths: string[] = []): SpecBundle {
  if (!Array.isArray(selectedPaths) || selectedPaths.some(path => typeof path !== "string")) throw new Error("Documentos auxiliares devem ser uma lista de caminhos.");
  const paths = [...new Set([entry, ...selectedPaths])];
  if (paths.length > 100) throw new Error("Selecione no máximo 100 documentos.");
  const base = realpathSync(root), documents: SpecDocument[] = [], suggestions = new Set<string>();
  let total = 0;
  for (const path of paths) {
    safeRepositoryPath(path);
    if (!/\.md$/i.test(path) || path.split("/").length > 8) throw new Error("Selecione Markdown dentro da raiz, com profundidade máxima de 8 níveis.");
    let current = base;
    for (const segment of path.split("/")) {
      current = join(current, segment);
      if (lstatSync(current).isSymbolicLink()) throw new Error("Documentação não pode conter links simbólicos.");
    }
    const rel = relative(base, realpathSync(current));
    if (rel.startsWith("..") || isAbsolute(rel) || !lstatSync(current).isFile()) throw new Error("Documento fora da raiz ou não regular.");
    const size = lstatSync(current).size;
    if (size > 1024 * 1024 || (total += size) > 10 * 1024 * 1024) throw new Error("Documentação excede 1 MiB/arquivo ou 10 MiB total.");
    const raw = readFileSync(current), content = new TextDecoder("utf-8", { fatal: true }).decode(raw);
    assertSafeExport(content);
    documents.push({ path, content, size: raw.length, sha256: createHash("sha256").update(raw).digest("hex") });
    for (const match of content.matchAll(/\[[^\]]*\]\(<?([^\s)>]+)>?(?:\s+[^)]*)?\)/g)) {
      const target = match[1].split("#")[0];
      if (!/\.md$/i.test(target) || /^[a-z]+:/i.test(target) || target.startsWith("/") || target.includes("\\")) continue;
      const candidate = posix.normalize(posix.join(posix.dirname(path), target));
      try { safeRepositoryPath(candidate); } catch { continue; }
      if (!paths.includes(candidate)) suggestions.add(candidate);
    }
  }
  return { documents, suggestedPaths: [...suggestions].sort() };
}
